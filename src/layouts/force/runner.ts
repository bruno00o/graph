import type { LayoutGraph, LayoutListener, LayoutRun } from '../../types'
import { type ForceSettings, ForceSimulation } from './simulation'

export type Schedule = (task: () => void) => void

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
