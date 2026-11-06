import type { Layout, LayoutGraph, LayoutListener, LayoutRun } from '../../types'
import type { FromWorker, ToWorker } from './protocol'
import { runForce } from './runner'
import { type ForceOptions, type ForceSettings, resolveForce } from './simulation'
import ForceWorker from './worker?worker&inline'

export type { ForceEngine, ForceOptions, ForceSettings } from './simulation'

const inlineBudget = 8

function inline(graph: LayoutGraph, settings: ForceSettings, listener: LayoutListener): LayoutRun {
  return runForce(graph, settings, listener, inlineBudget, (task) => setTimeout(task, 0))
}

function spawn(): Worker | null {
  if (typeof Worker === 'undefined') return null
  try {
    return new ForceWorker({ name: 'graph-force' })
  } catch {
    return null
  }
}

function start(graph: LayoutGraph, settings: ForceSettings, listener: LayoutListener): LayoutRun {
  const worker = spawn()
  if (!worker) return inline(graph, settings, listener)
  const pins = new Map<number, readonly [number, number]>()
  let latest: Float32Array | null = null
  let fallback: LayoutRun | null = null
  let stopped = false
  const post = (message: ToWorker) => worker.postMessage(message)
  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    if (stopped) return
    const message = event.data
    if (message.type === 'progress') {
      latest = message.xy
      listener.progress(message.xy, message.progress)
      return
    }
    stopped = true
    worker.terminate()
    listener.end(message.xy)
  }
  worker.onerror = (event) => {
    event.preventDefault()
    worker.terminate()
    if (stopped) return
    fallback = inline({ ...graph, xy: latest ?? graph.xy }, settings, listener)
    for (const [index, [x, y]] of pins) fallback.pin(index, x, y)
  }
  const { capacity, alive, movable, xy, radius, edges } = graph
  post({ type: 'start', graph: { capacity, alive, movable, xy, radius, edges }, settings })
  return {
    pin(index, x, y) {
      pins.set(index, [x, y])
      if (fallback) fallback.pin(index, x, y)
      else post({ type: 'pin', index, x, y })
    },
    stop() {
      stopped = true
      worker.terminate()
      fallback?.stop()
    },
  }
}

export function force(options: ForceOptions = {}): Layout {
  const settings = resolveForce(options)
  return Object.freeze({
    name: 'force',
    options: settings,
    start: (graph: LayoutGraph, listener: LayoutListener) => start(graph, settings, listener),
  })
}
