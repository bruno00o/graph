import type { BundleGraph, BundleListener, BundleRun, EdgeBundling } from '../types'
import { DensityBundler, type DensitySettings, densityDefaults } from './density'
import type { FromWorker, ToWorker } from './protocol'
import BundleWorker from './worker?worker&inline'

/** Options of `densityBundling`. */
export interface DensityBundlingOptions {
  /**
   * Share of the bundled shape drawn, from 0, straight, to 1. A new strength alone eases the edges
   * to it without computing again.
   * @default 0.85
   */
  readonly strength?: number | undefined
  /**
   * How far an edge reaches for others at the first pass, as a share of the larger side of the
   * graph. Larger values merge edges from further away into fewer, thicker bundles.
   * @default 0.06
   */
  readonly radius?: number | undefined
  /**
   * Number of passes, each with a smaller radius than the last. More passes draw tighter bundles.
   * @default 12
   */
  readonly iterations?: number | undefined
  /**
   * Most edges bundled. Above it, every edge stays straight and a warning is logged in development.
   * `Infinity` sets no limit, a negative value counts as 0 and `NaN` as the default.
   * @default 200000
   */
  readonly maxEdges?: number | undefined
}

/** Settings of a density bundling, read by the graph to decide whether to compute again. */
export interface DensityBundlingSettings {
  /** Reach of the first pass, as a share of the larger side of the graph. */
  readonly radius: number
  /** Number of passes. */
  readonly iterations: number
}

const defaultStrength = 0.85
const defaultMaxEdges = 200_000
const inlineBudget = 8

const maxLimit = 2 ** 31

function finiteOr(value: number | undefined, fallback: number, min: number, max: number): number {
  return value !== undefined && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

function edgeLimit(value: number | undefined): number {
  if (value === Number.POSITIVE_INFINITY) return maxLimit
  return Math.max(0, Math.floor(finiteOr(value, defaultMaxEdges, 0, maxLimit)))
}

function inline(
  xy: Float32Array,
  ends: Uint32Array,
  settings: DensitySettings,
  listener: BundleListener,
): BundleRun {
  const bundler = new DensityBundler(xy, ends, settings)
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const loop = () => {
    if (stopped) return
    const until = performance.now() + inlineBudget
    do bundler.step()
    while (!bundler.done && performance.now() < until)
    if (bundler.done) listener.end(bundler.paths())
    else timer = setTimeout(loop, 0)
  }
  timer = setTimeout(loop, 0)
  return {
    stop() {
      stopped = true
      clearTimeout(timer)
    },
  }
}

function spawn(): Worker | null {
  if (typeof Worker === 'undefined') return null
  try {
    return new BundleWorker({ name: 'graph-bundling' })
  } catch {
    return null
  }
}

function start(graph: BundleGraph, settings: DensitySettings, listener: BundleListener): BundleRun {
  const worker = spawn()
  if (!worker) return inline(graph.xy, graph.ends, settings, listener)
  let stopped = false
  let fallback: BundleRun | null = null
  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    worker.terminate()
    if (stopped) return
    stopped = true
    listener.end(event.data)
  }
  worker.onerror = (event) => {
    event.preventDefault()
    worker.terminate()
    if (stopped) return
    fallback = inline(graph.xy, graph.ends, settings, listener)
  }
  const message: ToWorker = { xy: graph.xy, ends: graph.ends, settings }
  worker.postMessage(message)
  return {
    stop() {
      stopped = true
      worker.terminate()
      fallback?.stop()
    },
  }
}

/**
 * Bundles edges by density: each edge bends toward the places where edges are densest, pass after
 * pass with a smaller reach, so that edges that run side by side merge into bundles. It runs in a
 * Web Worker and falls back to the main thread.
 */
export function densityBundling(options: DensityBundlingOptions = {}): EdgeBundling {
  const settings: DensityBundlingSettings = Object.freeze({
    radius: finiteOr(options.radius, densityDefaults.radius, 0, 1),
    iterations: Math.round(finiteOr(options.iterations, densityDefaults.iterations, 0, 64)),
  })
  return Object.freeze({
    name: 'density',
    options: settings,
    strength: finiteOr(options.strength, defaultStrength, 0, 1),
    maxEdges: edgeLimit(options.maxEdges),
    start: (graph: BundleGraph, listener: BundleListener) => start(graph, settings, listener),
  })
}
