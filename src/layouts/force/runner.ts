import type { LayoutGraph, LayoutListener, LayoutRun } from '../../types'
import { separate } from './collider'
import type { GpuForce } from './gpu'
import { type ForceSettings, ForceSimulation } from './simulation'

export type Schedule = (task: () => void) => void

const batchTarget = 32
const maxBatch = 256
const separationRounds = 10

export function runForce(
  graph: LayoutGraph,
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
      listener.end(snapshot())
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
  graph: LayoutGraph,
  settings: ForceSettings,
  listener: LayoutListener,
  rescue: (xy: Float32Array) => LayoutRun,
): LayoutRun {
  const current = Float32Array.from(graph.xy)
  const pins = new Map<number, readonly [number, number]>()
  let fallback: LayoutRun | null = null
  let stopped = false
  let batch = 4
  const loop = async () => {
    while (!stopped) {
      const started = performance.now()
      for (let k = 0; k < batch && !gpu.done; k++) gpu.step()
      const read = await gpu.read(current)
      if (stopped) return
      if (!read || gpu.lost) {
        gpu.destroy()
        fallback = rescue(current.slice())
        for (const [index, [x, y]] of pins) fallback.pin(index, x, y)
        return
      }
      const elapsed = Math.max(performance.now() - started, 1)
      batch = Math.max(1, Math.min(maxBatch, Math.round((batch * batchTarget) / elapsed)))
      if (gpu.done) {
        stopped = true
        gpu.destroy()
        separate(graph.radius, graph.alive, gpu.fixed, current, settings.spacing, separationRounds)
        listener.end(current.slice())
        return
      }
      listener.progress(current.slice(), gpu.progress)
    }
  }
  void loop()
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
