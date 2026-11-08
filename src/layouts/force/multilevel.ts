import type { LayoutListener, LayoutRun } from '../../types'
import { type Adjacency, adjacencyOf, type CoarseLevel, coarsen } from './coarsen'
import type { GpuForce } from './gpu'
import { type ForceGraph, type ForceSettings, ForceSimulation, type LevelRun } from './simulation'

const goldenTurn = 2.399963229728653

export interface MultilevelPlan {
  readonly coarsest: number
  readonly stall: number
  readonly alpha: number
  readonly share: number
  readonly minSteps: number
  readonly pull: number
  readonly spread: number
  readonly fullBelow: number
  readonly gpuFrom: number
  readonly keep: number
}

export const multilevelPlan: MultilevelPlan = {
  coarsest: 10,
  stall: 0.8,
  alpha: 0.3,
  share: 0.2,
  minSteps: 30,
  pull: 0.3,
  spread: 0.5,
  fullBelow: 1000,
  gpuFrom: 4000,
  keep: 16,
}

export class Ladder {
  readonly graph: ForceGraph
  readonly levels: readonly CoarseLevel[]
  readonly #settings: ForceSettings
  readonly #plan: MultilevelPlan

  constructor(graph: ForceGraph, settings: ForceSettings, plan: MultilevelPlan = multilevelPlan) {
    this.graph = graph
    this.#settings = settings
    this.#plan = plan
    this.levels = coarsen(graph, {
      coarsest: plan.coarsest,
      stall: plan.stall,
      edgeLength: settings.edgeLength,
      keep: plan.keep,
    })
  }

  get top(): number {
    return this.levels.length - 1
  }

  graphAt(level: number): ForceGraph {
    return level < 0 ? this.graph : (this.levels[level] as CoarseLevel).graph
  }

  runAt(level: number): LevelRun {
    const plan = this.#plan
    const coarse = level < 0 ? null : (this.levels[level] as CoarseLevel)
    const mass = coarse?.mass ?? null
    const reach = coarse?.reach ?? null
    const collide = level < 0
    const small = level >= 0 && this.graphAt(level).capacity <= plan.fullBelow
    if (level === this.top || small) {
      return { mass, reach, collide, alpha: 1, steps: this.#settings.steps }
    }
    return { mass, reach, collide, alpha: plan.alpha, steps: this.#steps() }
  }

  #steps(): number {
    const steps = this.#settings.steps
    return Math.min(steps, Math.max(this.#plan.minSteps, Math.round(steps * this.#plan.share)))
  }

  onGpu(level: number): boolean {
    return level < 0 || this.graphAt(level).capacity >= this.#plan.gpuFrom
  }

  work(level: number): number {
    return this.graphAt(level).capacity * this.runAt(level).steps
  }

  ancestor(index: number, level: number): number {
    let at = index
    for (let k = 0; k <= level && at >= 0; k++) at = (this.levels[k] as CoarseLevel).up[at] ?? -1
    return at
  }

  prolong(level: number, xy: Float32Array): Float32Array {
    const graph = this.graphAt(level)
    const out = new Float32Array(graph.capacity * 2)
    this.#spread(level, xy, out, adjacencyOf(graph))
    return out
  }

  display(level: number, xy: Float32Array, target: Float32Array): void {
    let current = xy
    for (let at = level; at >= 0; at--) {
      const next = at === 0 ? target : new Float32Array(this.graphAt(at - 1).capacity * 2)
      this.#spread(at - 1, current, next, null)
      current = next
    }
  }

  #spread(level: number, from: Float32Array, to: Float32Array, adjacency: Adjacency | null): void {
    const graph = this.graphAt(level)
    const coarse = this.levels[level + 1] as CoarseLevel
    const up = coarse.up
    const size = new Uint32Array(coarse.graph.capacity)
    for (let i = 0; i < graph.capacity; i++) {
      const c = up[i] ?? -1
      if (c >= 0) size[c] = (size[c] ?? 0) + 1
    }
    const rank = new Uint32Array(coarse.graph.capacity)
    const half = this.#settings.edgeLength / 2
    const pull = adjacency ? this.#plan.pull : 0
    const spread = this.#plan.spread
    const limit = Math.min(graph.capacity, to.length >> 1)
    for (let i = 0; i < limit; i++) {
      const c = up[i] ?? -1
      if (c < 0) continue
      if (graph.movable[i] !== 1) {
        to[i * 2] = graph.xy[i * 2] ?? 0
        to[i * 2 + 1] = graph.xy[i * 2 + 1] ?? 0
        continue
      }
      let x = from[c * 2] ?? 0
      let y = from[c * 2 + 1] ?? 0
      if (adjacency && pull > 0) {
        let sx = 0
        let sy = 0
        let count = 0
        for (let k = adjacency.start[i] ?? 0; k < (adjacency.start[i + 1] ?? 0); k++) {
          const d = up[adjacency.next[k] ?? 0] ?? -1
          if (d < 0 || d === c) continue
          sx += from[d * 2] ?? 0
          sy += from[d * 2 + 1] ?? 0
          count++
        }
        if (count > 0) {
          x += (sx / count - x) * pull
          y += (sy / count - y) * pull
        }
      }
      if ((size[c] ?? 1) > 1) {
        const r = rank[c] ?? 0
        rank[c] = r + 1
        const reach = ((graph.radius[i] ?? 0) + half) * spread * Math.sqrt(r + 0.5)
        const turn = (r + c) * goldenTurn
        x += Math.cos(turn) * reach
        y += Math.sin(turn) * reach
      }
      to[i * 2] = x
      to[i * 2 + 1] = y
    }
  }
}

export type Schedule = (task: () => void) => void

export interface MultilevelEngines {
  readonly budget: number
  readonly schedule: Schedule
  readonly interval: number
  readonly gpu: ((graph: ForceGraph, level: LevelRun) => GpuForce | null) | null
  readonly settle: (fixed: Uint8Array, xy: Float32Array) => void
}

const maxBatch = 256

export function runMultilevel(
  ladder: Ladder,
  settings: ForceSettings,
  listener: LayoutListener,
  engines: MultilevelEngines,
): LayoutRun {
  const graph = ladder.graph
  const pins = new Map<number, readonly [number, number]>()
  let stopped = false
  let level = ladder.top
  let pinLevel: ((index: number, x: number, y: number) => void) | null = null
  let total = 0
  for (let at = ladder.top; at >= -1; at--) total += ladder.work(at)
  let worked = 0
  let shown = performance.now()
  let gpuFailed = engines.gpu === null

  const report = (at: number, xy: Float32Array, levelProgress: number, force: boolean) => {
    const now = performance.now()
    if (!force && now - shown < engines.interval) return
    shown = now
    const fine = new Float32Array(graph.capacity * 2)
    if (at < 0) fine.set(xy.subarray(0, fine.length))
    else ladder.display(at, xy, fine)
    for (const [index, [x, y]] of pins) {
      fine[index * 2] = x
      fine[index * 2 + 1] = y
    }
    const done = worked + ladder.work(at) * levelProgress
    listener.progress(fine, total === 0 ? 1 : Math.min(1, done / total))
  }

  const pause = () => new Promise<void>((resolve) => engines.schedule(resolve))

  const pinAll = (at: number, pin: (index: number, x: number, y: number) => void) => {
    pinLevel = pin
    for (const [index, [x, y]] of pins) {
      const near = ladder.ancestor(index, at)
      if (near >= 0) pin(near, x, y)
    }
  }

  const onCpu = async (at: number, xy: Float32Array): Promise<Float32Array | null> => {
    const simulation = new ForceSimulation(
      { ...ladder.graphAt(at), xy },
      settings,
      ladder.runAt(at),
    )
    pinAll(at, (index, x, y) => simulation.pin(index, x, y))
    const out = new Float32Array(ladder.graphAt(at).capacity * 2)
    for (;;) {
      if (stopped) return null
      const until = performance.now() + engines.budget
      do simulation.step()
      while (!simulation.done && performance.now() < until)
      if (simulation.done) break
      simulation.write(out)
      report(at, out, simulation.progress, false)
      await pause()
    }
    simulation.write(out)
    return out
  }

  const onGpu = async (at: number, xy: Float32Array): Promise<Float32Array | null> => {
    const engine = engines.gpu?.({ ...ladder.graphAt(at), xy }, ladder.runAt(at)) ?? null
    if (!engine) {
      gpuFailed = true
      return onCpu(at, xy)
    }
    pinAll(at, (index, x, y) => engine.pin(index, x, y))
    const current = xy.slice()
    let batch = 4
    try {
      for (;;) {
        const started = performance.now()
        for (let k = 0; k < batch && !engine.done; k++) engine.step()
        const read = await engine.read(current)
        if (stopped) {
          engine.destroy()
          return null
        }
        if (!read || engine.lost) throw new Error('graph: the layout lost the GPU')
        const elapsed = Math.max(performance.now() - started, 1)
        batch = Math.max(1, Math.min(maxBatch, Math.round((batch * engines.interval) / elapsed)))
        if (engine.done) break
        report(at, current, engine.progress, false)
      }
    } catch {
      engine.destroy()
      gpuFailed = true
      return stopped ? null : onCpu(at, current)
    }
    engine.destroy()
    return current
  }

  const run = async () => {
    let xy: Float32Array = ladder.graphAt(level).xy
    for (; level >= -1; level--) {
      if (level < ladder.top) {
        xy = ladder.prolong(level, xy)
        report(level, xy, 0, true)
      }
      const gpu = !gpuFailed && ladder.onGpu(level)
      const next = await (gpu ? onGpu(level, xy) : onCpu(level, xy))
      if (!next || stopped) return
      xy = next
      worked += ladder.work(level)
    }
    const fixed = new Uint8Array(graph.capacity)
    for (let i = 0; i < graph.capacity; i++) {
      fixed[i] = graph.alive[i] === 1 && graph.movable[i] === 1 ? 0 : 1
    }
    for (const [index, [x, y]] of pins) {
      fixed[index] = 1
      xy[index * 2] = x
      xy[index * 2 + 1] = y
    }
    if (ladder.onGpu(-1) && !gpuFailed) engines.settle(fixed, xy)
    stopped = true
    listener.end(xy)
  }

  void run()
  return {
    pin(index, x, y) {
      if (index < 0 || index >= graph.capacity || !Number.isFinite(x) || !Number.isFinite(y)) {
        return
      }
      pins.set(index, [x, y])
      const near = ladder.ancestor(index, level)
      if (near >= 0) pinLevel?.(near, x, y)
    },
    stop() {
      stopped = true
    },
  }
}
