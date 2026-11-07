import type { EdgeColumns, NodeColumns } from '../core/columns'
import { EdgePaths, type PathResult } from '../core/edge-paths'
import type { LayerFilter } from '../core/mark-layers'
import type { Positions } from '../core/positions'
import { nodeOutline, type Outline } from '../core/route-shape'
import { shallowEqual } from '../core/shallow-equal'
import { easeInOut } from '../core/view'
import { dev } from '../dev'
import type {
  BundleGraph,
  BundleListener,
  BundlePaths,
  BundleRun,
  EdgeBundling,
  EdgeRouting,
} from '../types'

export interface BundleContext {
  readonly edges: EdgeColumns
  readonly nodes: NodeColumns
  readonly positions: Positions
  readonly datum: (index: number) => unknown
  readonly busy: () => boolean
  readonly duration: () => number
  readonly request: () => void
  readonly running: (running: boolean, kind: PathKind) => void
  readonly zoom: () => number
  readonly boxes: () => Float32Array | null
  readonly holder: (index: number) => number
  readonly layers: () => LayerFilter | null
}

export type PathKind = 'bundle' | 'route'

type Method =
  | { readonly kind: 'bundle'; readonly bundling: EdgeBundling }
  | { readonly kind: 'route'; readonly routing: EdgeRouting }

const quiet = 150
const zoomDrift = 1.5

function sameSettings(a: EdgeBundling | EdgeRouting, b: EdgeBundling | EdgeRouting): boolean {
  return (
    a.name === b.name &&
    a.maxEdges === b.maxEdges &&
    shallowEqual(a.options as Record<string, unknown>, b.options as Record<string, unknown>)
  )
}

function fits(paths: BundlePaths, count: number): boolean {
  const end = paths.offsets[count] ?? -1
  return paths.offsets.length === count + 1 && end * 2 <= paths.points.length
}

function methodOf(bundling: EdgeBundling | null, routing: EdgeRouting | null): Method | null {
  if (routing) return { kind: 'route', routing }
  return bundling ? { kind: 'bundle', bundling } : null
}

export class BundleHost {
  readonly paths: EdgePaths = new EdgePaths()
  readonly #context: BundleContext
  readonly #outline: Outline = {
    x: 0,
    y: 0,
    shape: 0,
    radius: 0,
    halfWidth: 0,
    halfHeight: 0,
    trim: 0,
  }
  #method: Method | null = null
  #routedZoom = 0
  #shapedZoom = 0
  #run: BundleRun | null = null
  #serial = 0
  #timer: ReturnType<typeof setTimeout> | undefined
  #result: PathResult | null = null
  #animation: { readonly start: number; readonly duration: number } | null = null
  #positionsVersion = -1
  #waiters: Array<(done: boolean) => void> = []
  #warned = false
  #running: PathKind = 'bundle'
  #reduced: () => boolean

  constructor(context: BundleContext, reduced: () => boolean) {
    this.#context = context
    this.#reduced = reduced
  }

  get running(): boolean {
    return this.#run !== null
  }

  get kind(): PathKind | null {
    return this.#method?.kind ?? null
  }

  setBundling(bundling: EdgeBundling | null, routing: EdgeRouting | null = null): void {
    const previous = this.#method
    const next = methodOf(bundling, routing)
    this.#method = next
    if (!next) {
      this.#halt(false)
      this.#result = null
      this.fade()
      return
    }
    if (previous && previous.kind === next.kind) {
      const before = previous.kind === 'bundle' ? previous.bundling : previous.routing
      const after = next.kind === 'bundle' ? next.bundling : next.routing
      if (sameSettings(before, after)) {
        if (this.#result && this.#look(previous) !== this.#look(next)) this.#ease(this.#result)
        return
      }
    } else if (previous) {
      this.#halt(false)
    }
    this.#result = null
    this.#schedule(0)
  }

  layered(): void {
    if (this.#method?.kind === 'route') this.#schedule()
  }

  changed(structural: boolean, nodes = false): void {
    const { edges } = this.#context
    this.paths.reserve(edges.capacity)
    if (!this.#method && this.paths.bundled === 0) return
    const before = this.paths.version
    this.paths.validateAll(edges, this.#column())
    const routed = this.#method?.kind === 'route' && nodes
    if (structural || routed || this.paths.version !== before) this.#schedule()
  }

  frame(now: number): boolean {
    const { positions } = this.#context
    if (positions.version !== this.#positionsVersion) {
      this.#positionsVersion = positions.version
      if (this.#method) {
        if (this.#run) this.#halt(null)
        this.#schedule()
      }
    }
    if (this.#method?.kind === 'route' && this.#result) this.#follow()
    const animation = this.#animation
    if (!animation) return false
    const t = animation.duration > 0 ? Math.min(1, (now - animation.start) / animation.duration) : 1
    this.paths.mix = easeInOut(t)
    if (t < 1) return true
    this.#animation = null
    this.paths.mix = 1
    this.paths.settle()
    return false
  }

  fade(): void {
    if (this.#run) this.#halt(null)
    if (this.paths.bundled === 0) return
    this.paths.start(null, 0, this.#context.positions)
    this.#animate()
  }

  run(kind: PathKind = 'bundle'): Promise<boolean> {
    if (this.#method?.kind !== kind) return Promise.resolve(false)
    const done = new Promise<boolean>((resolve) => this.#waiters.push(resolve))
    clearTimeout(this.#timer)
    this.#timer = undefined
    this.#compute()
    return done
  }

  destroy(): void {
    this.#halt(false)
    this.#method = null
  }

  #column(): Uint8Array {
    const { edges } = this.#context
    return this.#method?.kind === 'route' || (!this.#method && !this.paths.lanes)
      ? edges.route
      : edges.bundle
  }

  #look(method: Method): number {
    return method.kind === 'bundle' ? method.bundling.strength : method.routing.radius
  }

  #screenUnits(): boolean {
    const { nodes } = this.#context
    for (let index = 0; index < nodes.capacity; index++) {
      if (nodes.alive[index] === 1 && nodes.screenUnits[index] === 1) return true
    }
    return false
  }

  #follow(): void {
    const zoom = this.#context.zoom()
    if (zoom === this.#shapedZoom || this.#animation || this.#context.busy()) return
    if (!this.#screenUnits()) {
      this.#shapedZoom = zoom
      return
    }
    const drift = Math.max(zoom / this.#routedZoom, this.#routedZoom / zoom)
    if (drift > zoomDrift) {
      this.#shapedZoom = zoom
      this.#schedule()
      return
    }
    const result = this.#result
    if (!result) return
    this.#shape(result)
    this.paths.mix = 1
    this.#context.request()
  }

  #halt(outcome: boolean | null): void {
    clearTimeout(this.#timer)
    this.#timer = undefined
    if (this.#run) {
      this.#run.stop()
      this.#run = null
      this.#serial++
      this.#context.running(false, this.#running)
    }
    if (outcome !== null) this.#settle(outcome)
  }

  #settle(outcome: boolean): void {
    const waiters = this.#waiters
    this.#waiters = []
    for (const resolve of waiters) resolve(outcome)
  }

  #schedule(delay = quiet): void {
    if (!this.#method) return
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => {
      this.#timer = undefined
      if (this.#context.busy()) this.#schedule()
      else this.#compute()
    }, delay)
  }

  #compute(): void {
    const method = this.#method
    if (!method) return
    if (this.#run) {
      this.#run.stop()
      this.#run = null
    }
    const { edges, positions } = this.#context
    const column = method.kind === 'route' ? edges.route : edges.bundle
    const limit = method.kind === 'route' ? method.routing.maxEdges : method.bundling.maxEdges
    const listed: number[] = []
    const layers = method.kind === 'route' ? this.#context.layers() : null
    for (let index = 0; index < edges.capacity; index++) {
      if (edges.alive[index] !== 1 || column[index] !== 1) continue
      if (layers && !this.#layerShown(layers, index)) continue
      listed.push(index)
    }
    if (listed.length === 0 || listed.length > limit) {
      if (dev && listed.length > 0 && !this.#warned) {
        this.#warned = true
        const verb = method.kind === 'route' ? 'route' : 'bundle'
        console.warn(
          `graph: ${listed.length} edges to ${verb}, more than maxEdges (${limit}); edges stay straight`,
        )
      }
      this.#result = null
      this.fade()
      this.#settle(false)
      return
    }
    const capacity = Math.max(positions.capacity, this.#context.nodes.capacity)
    const xy = new Float32Array(capacity * 2)
    for (let index = 0; index < positions.capacity; index++) {
      xy[index * 2] = positions.x(index)
      xy[index * 2 + 1] = positions.y(index)
    }
    const indices = Uint32Array.from(listed)
    const ends = new Uint32Array(listed.length * 2)
    listed.forEach((edge, at) => {
      ends[at * 2] = edges.source[edge] ?? 0
      ends[at * 2 + 1] = edges.target[edge] ?? 0
    })
    const graph: BundleGraph = {
      xy,
      edges: indices,
      ends: ends.slice(),
      keys: edges.keys,
      datum: this.#context.datum,
    }
    const serial = ++this.#serial
    const name = method.kind === 'route' ? 'routing' : 'bundling'
    this.#running = method.kind
    this.#context.running(true, method.kind)
    const listener: BundleListener = {
      end: (paths) => {
        if (serial !== this.#serial) return
        this.#run = null
        this.#serial++
        this.#context.running(false, method.kind)
        if (!fits(paths, listed.length)) {
          if (dev) console.warn(`graph: ${name} returned paths that do not match its edges`)
          this.#settle(false)
          return
        }
        this.#result = { edges: indices, ends, paths }
        this.#ease(this.#result)
        this.#settle(true)
      },
    }
    let run: BundleRun
    if (method.kind === 'route') {
      this.#routedZoom = this.#context.zoom()
      run = method.routing.start({ ...graph, ...this.#obstacles(capacity) }, listener)
    } else {
      run = method.bundling.start(graph, listener)
    }
    if (serial === this.#serial) this.#run = run
  }

  #layerShown(layers: LayerFilter, edge: number): boolean {
    const { edges, nodes } = this.#context
    const hidden = (flags: Uint8Array, slot: number | undefined) => flags[slot ?? 0] === 1
    return (
      !hidden(layers.edges, edges.slot[edge]) &&
      !hidden(layers.nodes, nodes.slot[edges.source[edge] ?? 0]) &&
      !hidden(layers.nodes, nodes.slot[edges.target[edge] ?? 0])
    )
  }

  #obstacles(capacity: number): { extents: Float32Array; parents: Int32Array } {
    const { nodes, positions, holder } = this.#context
    const boxes = this.#context.boxes()
    const zoom = this.#context.zoom()
    const layers = this.#context.layers()
    const extents = new Float32Array(capacity * 2)
    const parents = new Int32Array(capacity).fill(-1)
    const outline = this.#outline
    for (let index = 0; index < Math.min(capacity, nodes.capacity); index++) {
      if (nodes.alive[index] !== 1) continue
      if (layers && layers.nodes[nodes.slot[index] ?? 0] === 1) continue
      nodeOutline(nodes, boxes, index, positions.x(index), positions.y(index), zoom, outline)
      extents[index * 2] = outline.halfWidth
      extents[index * 2 + 1] = outline.halfHeight
      parents[index] = holder(index)
    }
    return { extents, parents }
  }

  #shape(result: PathResult): void {
    const { nodes, positions } = this.#context
    const boxes = this.#context.boxes()
    const zoom = this.#context.zoom()
    this.#shapedZoom = zoom
    const radius = this.#method?.kind === 'route' ? this.#method.routing.radius : 0
    this.paths.route(
      result,
      radius,
      (index, out) =>
        nodeOutline(nodes, boxes, index, positions.x(index), positions.y(index), zoom, out),
      positions,
    )
  }

  #ease(result: PathResult): void {
    const { edges, positions } = this.#context
    this.paths.reserve(edges.capacity)
    const method = this.#method
    if (method?.kind === 'route') this.#shape(result)
    else {
      const strength = method?.kind === 'bundle' ? method.bundling.strength : 1
      this.paths.start(result, strength, positions)
    }
    this.paths.validateAll(edges, this.#column())
    this.#animate()
  }

  #animate(): void {
    const duration = this.#reduced() ? 0 : this.#context.duration()
    this.#animation = { start: performance.now(), duration }
    this.#context.request()
  }
}
