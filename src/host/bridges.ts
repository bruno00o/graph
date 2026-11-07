import { BridgeFinder, BridgeSet } from '../core/bridges'
import type { EdgeColumns, NodeColumns } from '../core/columns'
import type { EdgePaths } from '../core/edge-paths'
import type { Positions } from '../core/positions'
import { nodeOutline, type Outline } from '../core/route-shape'
import { edgeShown, type Sight } from '../core/visibility'
import { dev } from '../dev'
import type { ResolvedBridges } from '../types'

export interface BridgeContext {
  readonly edges: EdgeColumns
  readonly nodes: NodeColumns
  readonly positions: Positions
  readonly paths: EdgePaths
  readonly zoom: () => number
  readonly boxes: () => Float32Array | null
  readonly busy: () => boolean
  readonly request: () => void
  readonly sight: () => Sight
}

const quiet = 150
const slice = 8

export class BridgeHost {
  readonly set: BridgeSet = new BridgeSet()
  readonly #context: BridgeContext
  readonly #outline: Outline = {
    x: 0,
    y: 0,
    shape: 0,
    radius: 0,
    halfWidth: 0,
    halfHeight: 0,
    trim: 0,
  }
  #options: ResolvedBridges | null = null
  #timer: ReturnType<typeof setTimeout> | undefined
  #finder: BridgeFinder | null = null
  #stamp = ''
  #warned = false

  constructor(context: BridgeContext) {
    this.#context = context
  }

  get enabled(): boolean {
    return this.#options !== null
  }

  get active(): boolean {
    return this.#options !== null && this.set.count > 0
  }

  setOptions(options: ResolvedBridges | null): void {
    const previous = this.#options
    this.#options = options
    if (!options) {
      this.#stop()
      this.#stamp = ''
      if (this.set.count > 0) {
        this.set.clear()
        this.#context.request()
      }
      return
    }
    this.set.shape = options.shape
    this.set.size = options.size
    if (previous && previous.shape === options.shape && previous.size === options.size) {
      if (previous.maxEdges !== options.maxEdges) this.#schedule(0)
      return
    }
    this.set.version++
    this.#context.request()
    if (!previous) this.#schedule(0)
  }

  changed(): void {
    if (this.#options) this.#schedule()
  }

  frame(): void {
    if (!this.#options) return
    const { positions, paths } = this.#context
    const stamp = `${positions.version}:${paths.version}:${paths.pointsVersion}`
    if (stamp === this.#stamp) return
    this.#stamp = stamp
    this.#schedule()
  }

  destroy(): void {
    this.#stop()
    this.#options = null
  }

  #stop(): void {
    clearTimeout(this.#timer)
    this.#timer = undefined
    this.#finder = null
  }

  #schedule(delay = quiet): void {
    if (!this.#options) return
    this.#stop()
    this.#timer = setTimeout(() => {
      this.#timer = undefined
      if (this.#context.busy()) this.#schedule()
      else this.#start()
    }, delay)
  }

  #start(): void {
    const options = this.#options
    if (!options) return
    const { edges, nodes, positions, paths } = this.#context
    const boxes = this.#context.boxes()
    const zoom = this.#context.zoom()
    const outline = this.#outline
    const sight = this.#context.sight()
    const finder = new BridgeFinder({
      edges,
      positions,
      paths,
      maxEdges: options.maxEdges,
      shown: (edge) => edgeShown(nodes, edges, edge, sight),
      radius: (node) =>
        nodeOutline(nodes, boxes, node, positions.x(node), positions.y(node), zoom, outline).radius,
    })
    this.#finder = finder
    const loop = (): void => {
      this.#timer = undefined
      if (this.#finder !== finder) return
      const done = finder.step(performance.now() + slice, this.set)
      if (!done) {
        this.#timer = setTimeout(loop, 0)
        return
      }
      this.#finder = null
      if (finder.over && dev && !this.#warned) {
        this.#warned = true
        console.warn(
          `graph: more than maxEdges (${options.maxEdges}) edges to check for crossings; no bridges`,
        )
      }
      this.#context.request()
    }
    loop()
  }
}
