import { separateGroups } from '../../core/group-separation'
import { type GroupTree, groupTree } from '../../core/group-tree'
import type { LayoutListener, LayoutRun } from '../../types'
import { separate } from './collider'
import type { GpuForce } from './gpu'
import { Ladder, runMultilevel } from './multilevel'
import { type ForceGraph, type ForceSettings, ForceSimulation, type LevelRun } from './simulation'

export type Schedule = (task: () => void) => void

const batchTarget = 32
const elementsPerTarget = 200_000
const maxBatch = 256
const separationRounds = 10
const groupRounds = 64

export function settle(
  graph: ForceGraph,
  tree: GroupTree | null,
  fixed: Uint8Array,
  xy: Float32Array,
  settings: ForceSettings,
): void {
  if (!tree) {
    separate(graph.radius, graph.alive, fixed, xy, settings.spacing, separationRounds)
    return
  }
  separateGroups(tree, graph.alive, graph.radius, fixed, xy, {
    spacing: settings.spacing,
    groupSpacing: settings.groupSpacing,
    rounds: groupRounds,
    nodes: 'all',
  })
}

export function snapshotInterval(graph: ForceGraph): number {
  let alive = 0
  for (let index = 0; index < graph.capacity; index++) alive += graph.alive[index] ?? 0
  const elements = alive + graph.edges.length / 2
  return Math.max(batchTarget, (elements / elementsPerTarget) * batchTarget)
}

export function runForce(
  graph: ForceGraph,
  settings: ForceSettings,
  listener: LayoutListener,
  budget: number,
  schedule: Schedule,
): LayoutRun {
  const simulation = new ForceSimulation(graph, settings)
  let stopped = false
  const snapshot = () => {
    const xy = new Float32Array(graph.capacity * 2)
    simulation.write(xy)
    return xy
  }
  const loop = () => {
    if (stopped) return
    const until = performance.now() + budget
    do simulation.step()
    while (!simulation.done && performance.now() < until)
    if (simulation.done) {
      stopped = true
      const xy = snapshot()
      if (simulation.tree) settle(graph, simulation.tree, simulation.fixed, xy, settings)
      listener.end(xy)
      return
    }
    listener.progress(snapshot(), simulation.progress)
    schedule(loop)
  }
  schedule(loop)
  return {
    pin: (index, x, y) => simulation.pin(index, x, y),
    stop: () => {
      stopped = true
    },
  }
}

export function runGpuForce(
  gpu: GpuForce,
  graph: ForceGraph,
  settings: ForceSettings,
  listener: LayoutListener,
  rescue: (xy: Float32Array) => LayoutRun,
): LayoutRun {
  const current = Float32Array.from(graph.xy)
  const pins = new Map<number, readonly [number, number]>()
  let fallback: LayoutRun | null = null
  let stopped = false
  let batch = 4
  const interval = snapshotInterval(graph)
  const fall = () => {
    gpu.destroy()
    fallback = rescue(current.slice())
    for (const [index, [x, y]] of pins) fallback.pin(index, x, y)
  }
  const loop = async () => {
    while (!stopped) {
      const started = performance.now()
      for (let k = 0; k < batch && !gpu.done; k++) gpu.step()
      const read = await gpu.read(current)
      if (stopped) return
      if (!read || gpu.lost) {
        fall()
        return
      }
      const elapsed = Math.max(performance.now() - started, 1)
      batch = Math.max(1, Math.min(maxBatch, Math.round((batch * interval) / elapsed)))
      if (gpu.done) {
        stopped = true
        gpu.destroy()
        settle(
          graph,
          groupTree(graph.capacity, graph.alive, graph.groups),
          gpu.fixed,
          current,
          settings,
        )
        listener.end(current.slice())
        return
      }
      listener.progress(current.slice(), gpu.progress)
    }
  }
  loop().catch((error: unknown) => {
    if (stopped || fallback) throw error
    fall()
  })
  return {
    pin(index, x, y) {
      pins.set(index, [x, y])
      if (fallback) fallback.pin(index, x, y)
      else gpu.pin(index, x, y)
    },
    stop() {
      stopped = true
      fallback?.stop()
      gpu.destroy()
    },
  }
}

export function runMultilevelForce(
  graph: ForceGraph,
  settings: ForceSettings,
  listener: LayoutListener,
  budget: number,
  schedule: Schedule,
  gpu: ((graph: ForceGraph, level: LevelRun) => GpuForce | null) | null,
): LayoutRun {
  return runMultilevel(new Ladder(graph, settings), settings, listener, {
    budget,
    schedule,
    interval: snapshotInterval(graph),
    gpu,
    settle: (fixed, xy) => settle(graph, null, fixed, xy, settings),
  })
}
