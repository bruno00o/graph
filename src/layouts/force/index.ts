import { withFinitePositions } from '../../core/finite-positions'
import { dev } from '../../dev'
import type { Layout, LayoutGraph, LayoutListener, LayoutRun } from '../../types'
import { registerScopeRun } from '../scope-runs'
import { enableScopes } from '../scopes'
import { follow } from './follow'
import { ForcePool } from './pool'
import type { FromWorker, ToWorker } from './protocol'
import { runForce, runMultilevelForce } from './runner'
import {
  type ForceGraph,
  type ForceOptions,
  type ForceSettings,
  forceGraphOf,
  prefersGpu,
  prefersMultilevel,
  resolveForce,
  settingsIn,
} from './simulation'
import { untangling } from './untangle-stage'
import ForceWorker from './worker?worker&inline'

export type { ForceEngine, ForceOptions, ForceSettings, UntangleOptions } from './simulation'

const inlineBudget = 8

const loadUntangle = () => import('./untangle').then((module) => module.startUntangle)

function inline(
  graph: ForceGraph,
  settings: ForceSettings,
  listener: LayoutListener,
  dense: () => void,
  budget = inlineBudget,
): LayoutRun {
  const schedule = (task: () => void) => setTimeout(task, 0)
  const stage = { slice: budget, schedule, load: loadUntangle, dense }
  return untangling(graph, settings, listener, stage, (inner) =>
    prefersMultilevel(graph, settings)
      ? runMultilevelForce(graph, settings, inner, budget, schedule, null)
      : runForce(graph, settings, inner, budget, schedule),
  )
}

function spawn(): Worker | null {
  if (typeof Worker === 'undefined') return null
  try {
    return new ForceWorker({ name: 'graph-force' })
  } catch {
    return null
  }
}

let pool: ForcePool | null = null
let threadPool: ForcePool | null = null

function pooled(given: LayoutGraph, settings: ForceSettings, listener: LayoutListener) {
  const graph = forceGraphOf(withFinitePositions(given))
  if (prefersGpu(graph, settings)) return null
  if (given.work?.workers === false) {
    threadPool ??= new ForcePool(() => null, 1)
    return threadPool.run(graph, settings, listener, given.work.slice)
  }
  const cores = globalThis.navigator?.hardwareConcurrency ?? 2
  pool ??= new ForcePool(spawn, Math.min(4, cores - 1))
  return pool.run(graph, settings, listener)
}

function start(
  given: LayoutGraph,
  chosen: ForceSettings,
  listener: LayoutListener,
  dense: () => void,
): LayoutRun {
  const graph = forceGraphOf(withFinitePositions(given))
  const settings = given.blocks || given.container ? { ...chosen, untangle: 0 } : chosen
  if (given.work?.workers === false) {
    return inline(graph, settings, listener, dense, given.work.slice)
  }
  const worker = spawn()
  if (!worker) return inline(graph, settings, listener, dense)
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
    if (message.type === 'dense') {
      dense()
      return
    }
    if (message.type !== 'end') return
    stopped = true
    worker.terminate()
    if (message.glide) listener.end(message.xy, { glide: true })
    else listener.end(message.xy)
  }
  worker.onerror = (event) => {
    event.preventDefault()
    worker.terminate()
    if (stopped) return
    fallback = inline({ ...graph, xy: latest ?? graph.xy }, settings, listener, dense)
    for (const [index, [x, y]] of pins) fallback.pin(index, x, y)
  }
  post({ type: 'start', graph, settings })
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

/**
 * A force layout: nodes push each other apart and edges pull their ends together. It runs in a Web
 * Worker, on the GPU or the CPU, and falls back to the main thread.
 */
export function force(options: ForceOptions = {}): Layout {
  const settings = resolveForce(options)
  enableScopes()
  let warned = !dev || options.untangle === undefined
  const dense = () => {
    if (warned) return
    warned = true
    console.warn(
      'force: untangle skipped this graph, which has more than 4 edge crossings per edge, where moving single nodes removes few of them',
    )
  }
  const layout: Layout = Object.freeze({
    name: 'force',
    options: settings,
    turns: 'free',
    start: (graph: LayoutGraph, listener: LayoutListener) =>
      start(graph, settingsIn(graph, settings, options), listener, dense),
    follow,
  })
  registerScopeRun(layout, (graph, listener) =>
    pooled(graph, settingsIn(graph, settings, options), listener),
  )
  return layout
}
