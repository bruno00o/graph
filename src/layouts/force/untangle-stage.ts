import type { LayoutListener, LayoutRun } from '../../types'
import type { Schedule } from './runner'
import type { ForceGraph, ForceSettings } from './simulation'

export interface UntangleJob {
  readonly skipped: boolean
  readonly moved: boolean
  pin(index: number, x: number, y: number): void
  advance(until: number): boolean
  result(): Float32Array
}

export type UntangleStart = (
  graph: ForceGraph,
  xy: Float32Array,
  settings: ForceSettings,
) => UntangleJob

export interface UntangleStage {
  readonly slice: number
  readonly schedule: Schedule
  readonly load: () => UntangleStart | Promise<UntangleStart>
  readonly dense: () => void
}

export function untangles(graph: ForceGraph, settings: ForceSettings): boolean {
  if (!(settings.untangle > 0) || (graph.groups?.order.length ?? 0) > 0) return false
  if (graph.edges.length < 4) return false
  for (let index = 0; index < graph.capacity; index++) {
    if (graph.alive[index] === 1 && graph.movable[index] === 1) return true
  }
  return false
}

export function untangling(
  graph: ForceGraph,
  settings: ForceSettings,
  listener: LayoutListener,
  stage: UntangleStage,
  start: (listener: LayoutListener) => LayoutRun,
): LayoutRun {
  if (!untangles(graph, settings)) return start(listener)
  const pins = new Map<number, readonly [number, number]>()
  let job: UntangleJob | null = null
  let stopped = false
  const finish = (xy: Float32Array, glide: boolean) => {
    if (stopped) return
    stopped = true
    if (glide) listener.end(xy, { glide: true })
    else listener.end(xy)
  }
  const begin = (open: UntangleStart, xy: Float32Array) => {
    if (stopped) return
    let current: UntangleJob
    try {
      current = open(graph, xy, settings)
      for (const [index, [x, y]] of pins) current.pin(index, x, y)
    } catch {
      finish(xy, false)
      return
    }
    job = current
    const loop = () => {
      if (stopped) return
      let done: boolean
      try {
        done = current.advance(performance.now() + stage.slice)
      } catch {
        finish(xy, false)
        return
      }
      if (!done) {
        stage.schedule(loop)
        return
      }
      if (current.skipped) stage.dense()
      finish(current.moved ? current.result() : xy, current.moved)
    }
    stage.schedule(loop)
  }
  const forces = start({
    progress: (xy, progress) => {
      if (!stopped) listener.progress(xy, progress)
    },
    end: (xy) => {
      if (stopped) return
      let open: UntangleStart | Promise<UntangleStart>
      try {
        open = stage.load()
      } catch {
        finish(xy, false)
        return
      }
      if (typeof open === 'function') begin(open, xy)
      else
        open.then(
          (loaded) => begin(loaded, xy),
          () => finish(xy, false),
        )
    },
    fail: (error) => {
      if (stopped) return
      stopped = true
      if (listener.fail) listener.fail(error)
      else listener.end(graph.xy)
    },
  })
  return {
    pin(index, x, y) {
      pins.set(index, [x, y])
      if (job) job.pin(index, x, y)
      else forces.pin(index, x, y)
    },
    stop() {
      stopped = true
      forces.stop()
    },
  }
}
