import { report } from '../host/isolate'
import type { Layout, LayoutGraph, LayoutListener, LayoutRun } from '../types'

export type ScopeRunner = (graph: LayoutGraph, listener: LayoutListener) => LayoutRun | null

export interface SliceTask {
  step(until: number): boolean
}

export interface Slice {
  stop(): void
}

const runners = new WeakMap<Layout, ScopeRunner>()
const sliceBudget = 8

export function registerScopeRun(layout: Layout, runner: ScopeRunner): void {
  runners.set(layout, runner)
}

export function scopeRunOf(layout: Layout): ScopeRunner | null {
  return runners.get(layout) ?? null
}

interface Entry {
  readonly task: SliceTask
  readonly budget: number
  stopped: boolean
}

const queue: Entry[] = []
let head = 0
let scheduled = false

export function sliced(task: SliceTask, budget: number = sliceBudget): Slice {
  const entry: Entry = { task, budget, stopped: false }
  queue.push(entry)
  if (!scheduled) {
    scheduled = true
    queueMicrotask(work)
  }
  return {
    stop() {
      entry.stopped = true
    },
  }
}

function work(): void {
  const until = performance.now() + (queue[head]?.budget ?? sliceBudget)
  while (head < queue.length) {
    const entry = queue[head] as Entry
    if (!entry.stopped) {
      let finished = true
      try {
        finished = entry.task.step(until)
      } catch (error) {
        setTimeout(() => {
          throw error
        }, 0)
      }
      if (!finished) break
      entry.stopped = true
    }
    head++
    if (performance.now() >= until) break
  }
  if (head > 1024 && head * 2 > queue.length) {
    queue.splice(0, head)
    head = 0
  }
  if (head < queue.length) {
    setTimeout(work, 0)
  } else {
    scheduled = false
    queue.length = 0
    head = 0
  }
}

export function failWith(
  listener: LayoutListener,
  error: unknown,
  start: () => Float32Array,
): void {
  if (listener.fail) {
    listener.fail(error)
    return
  }
  report(error)
  listener.end(start())
}

export function endWith(
  graph: Pick<LayoutGraph, 'xy'>,
  listener: LayoutListener,
  compute: () => Float32Array,
): void {
  let xy: Float32Array
  try {
    xy = compute()
  } catch (error) {
    failWith(listener, error, () => Float32Array.from(graph.xy))
    return
  }
  listener.end(xy)
}

export function instantRun(
  graph: Pick<LayoutGraph, 'xy' | 'work'>,
  compute: () => Float32Array,
  listener: LayoutListener,
): LayoutRun {
  const slice = sliced(
    {
      step() {
        endWith(graph, listener, compute)
        return true
      },
    },
    graph.work?.slice,
  )
  return { pin() {}, stop: () => slice.stop() }
}
