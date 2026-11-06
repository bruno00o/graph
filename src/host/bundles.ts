import type { EdgeColumns } from '../core/columns'
import { EdgePaths, type PathResult } from '../core/edge-paths'
import type { Positions } from '../core/positions'
import { shallowEqual } from '../core/shallow-equal'
import { easeInOut } from '../core/view'
import { dev } from '../dev'
import type { BundleGraph, BundlePaths, BundleRun, EdgeBundling } from '../types'

export interface BundleContext {
  readonly edges: EdgeColumns
  readonly positions: Positions
  readonly datum: (index: number) => unknown
  readonly busy: () => boolean
  readonly duration: () => number
  readonly request: () => void
  readonly running: (running: boolean) => void
}

const quiet = 150

function sameSettings(a: EdgeBundling, b: EdgeBundling): boolean {
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

export class BundleHost {
  readonly paths: EdgePaths = new EdgePaths()
  readonly #context: BundleContext
  #bundling: EdgeBundling | null = null
  #run: BundleRun | null = null
  #serial = 0
  #timer: ReturnType<typeof setTimeout> | undefined
  #result: PathResult | null = null
  #animation: { readonly start: number; readonly duration: number } | null = null
  #positionsVersion = -1
  #waiters: Array<(done: boolean) => void> = []
  #warned = false
  #reduced: () => boolean

  constructor(context: BundleContext, reduced: () => boolean) {
    this.#context = context
    this.#reduced = reduced
  }

  get running(): boolean {
    return this.#run !== null
  }

  setBundling(next: EdgeBundling | null): void {
    const previous = this.#bundling
    this.#bundling = next
    if (!next) {
      this.#halt(false)
      this.#result = null
      this.fade()
      return
    }
    if (previous && sameSettings(previous, next)) {
      if (previous.strength !== next.strength && this.#result) this.#ease(this.#result)
      return
    }
    this.#result = null
    this.#schedule(0)
  }

  changed(structural: boolean): void {
    const { edges } = this.#context
    this.paths.reserve(edges.capacity)
    if (!this.#bundling && this.paths.bundled === 0) return
    const before = this.paths.version
    this.paths.validateAll(edges)
    if (structural || this.paths.version !== before) this.#schedule()
  }

  frame(now: number): boolean {
    const { positions } = this.#context
    if (positions.version !== this.#positionsVersion) {
      this.#positionsVersion = positions.version
      if (this.#bundling) {
        if (this.#run) this.#halt(null)
        this.#schedule()
      }
    }
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

  run(): Promise<boolean> {
    if (!this.#bundling) return Promise.resolve(false)
    const done = new Promise<boolean>((resolve) => this.#waiters.push(resolve))
    clearTimeout(this.#timer)
    this.#timer = undefined
    this.#compute()
    return done
  }

  destroy(): void {
    this.#halt(false)
    this.#bundling = null
  }

  #halt(outcome: boolean | null): void {
    clearTimeout(this.#timer)
    this.#timer = undefined
    if (this.#run) {
      this.#run.stop()
      this.#run = null
      this.#serial++
      this.#context.running(false)
    }
    if (outcome !== null) this.#settle(outcome)
  }

  #settle(outcome: boolean): void {
    const waiters = this.#waiters
    this.#waiters = []
    for (const resolve of waiters) resolve(outcome)
  }

  #schedule(delay = quiet): void {
    if (!this.#bundling) return
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => {
      this.#timer = undefined
      if (this.#context.busy()) this.#schedule()
      else this.#compute()
    }, delay)
  }

  #compute(): void {
    const bundling = this.#bundling
    if (!bundling) return
    if (this.#run) {
      this.#run.stop()
      this.#run = null
    }
    const { edges, positions } = this.#context
    const listed: number[] = []
    for (let index = 0; index < edges.capacity; index++) {
      if (edges.alive[index] === 1 && edges.bundle[index] === 1) listed.push(index)
    }
    if (listed.length === 0 || listed.length > bundling.maxEdges) {
      if (dev && listed.length > 0 && !this.#warned) {
        this.#warned = true
        console.warn(
          `graph: ${listed.length} edges to bundle, more than maxEdges (${bundling.maxEdges}); edges stay straight`,
        )
      }
      this.#result = null
      this.fade()
      this.#settle(false)
      return
    }
    const capacity = positions.capacity
    const xy = new Float32Array(capacity * 2)
    for (let index = 0; index < capacity; index++) {
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
    this.#context.running(true)
    const run = bundling.start(graph, {
      end: (paths) => {
        if (serial !== this.#serial) return
        this.#run = null
        this.#serial++
        this.#context.running(false)
        if (!fits(paths, listed.length)) {
          if (dev) console.warn('graph: bundling returned paths that do not match its edges')
          this.#settle(false)
          return
        }
        this.#result = { edges: indices, ends, paths }
        this.#ease(this.#result)
        this.#settle(true)
      },
    })
    if (serial === this.#serial) this.#run = run
  }

  #ease(result: PathResult): void {
    const { edges, positions } = this.#context
    this.paths.reserve(edges.capacity)
    this.paths.start(result, this.#bundling?.strength ?? 1, positions)
    this.paths.validateAll(edges)
    this.#animate()
  }

  #animate(): void {
    const duration = this.#reduced() ? 0 : this.#context.duration()
    this.#animation = { start: performance.now(), duration }
    this.#context.request()
  }
}
