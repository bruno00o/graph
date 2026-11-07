import type { BundleListener, BundleRun, EdgeRouting, RouteGraph } from '../types'
import { OrthogonalRouter, type OrthogonalSettings, type RouteAxis } from './orthogonal'
import type { FromWorker, ToWorker } from './protocol'
import RouteWorker from './worker?worker&inline'

export type { RouteAxis } from './orthogonal'

/** Options of `orthogonalRouting`. */
export interface OrthogonalRoutingOptions {
  /**
   * Room kept free around each node and group, in world units. Routes go around the boxes grown by
   * this gap.
   * @default 8
   */
  readonly gap?: number | undefined
  /**
   * Distance between routes that run side by side, in world units. Where a channel is too narrow,
   * the routes share it more tightly.
   * @default 6
   */
  readonly spacing?: number | undefined
  /**
   * Radius of the rounded corners at each bend, in world units, `0` for sharp corners. A new
   * radius alone redraws the routes without computing again.
   * @default 6
   */
  readonly radius?: number | undefined
  /**
   * Axis along which routes leave and enter their nodes: `'vertical'` through the top and bottom
   * sides, `'horizontal'` through the left and right sides, or `'auto'` along the larger distance
   * between the two ends of each edge.
   * @default 'auto'
   */
  readonly axis?: RouteAxis | undefined
  /**
   * Most edges routed. Above it, every edge stays straight and a warning is logged in development.
   * @default 50000
   */
  readonly maxEdges?: number | undefined
}

/** Settings of an orthogonal routing, read by the graph to decide whether to compute again. */
export interface OrthogonalRoutingSettings {
  /** Room kept free around each node and group, in world units. */
  readonly gap: number
  /** Distance between routes that run side by side, in world units. */
  readonly spacing: number
  /**
   * Axis along which routes leave and enter their nodes: `'vertical'`, `'horizontal'` or
   * `'auto'`.
   */
  readonly axis: RouteAxis
}

const defaultGap = 8
const defaultSpacing = 6
const defaultRadius = 6
const defaultMaxEdges = 50_000
const inlineBudget = 8
const axes: readonly RouteAxis[] = ['auto', 'vertical', 'horizontal']

function finiteOr(value: number | undefined, fallback: number, min: number, max: number): number {
  return value !== undefined && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

function inline(message: ToWorker, listener: BundleListener): BundleRun {
  const router = new OrthogonalRouter(message, message.settings)
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const loop = () => {
    if (stopped) return
    const paths = router.step(performance.now() + inlineBudget)
    if (paths) listener.end(paths)
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
    return new RouteWorker({ name: 'graph-routing' })
  } catch {
    return null
  }
}

function start(
  graph: RouteGraph,
  settings: OrthogonalSettings,
  listener: BundleListener,
): BundleRun {
  const message: ToWorker = {
    xy: graph.xy,
    extents: graph.extents,
    parents: graph.parents,
    ends: graph.ends,
    settings,
  }
  const worker = spawn()
  if (!worker) return inline(message, listener)
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
    fallback = inline(message, listener)
  }
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
 * Routes edges with horizontal and vertical segments around nodes and groups, with rounded
 * corners, ends spread along the sides of nodes and side by side routes kept apart. It runs in a
 * Web Worker and falls back to the main thread.
 */
export function orthogonalRouting(options: OrthogonalRoutingOptions = {}): EdgeRouting {
  const axis = options.axis ?? 'auto'
  if (!axes.includes(axis)) {
    throw new TypeError("orthogonalRouting: axis must be 'auto', 'vertical' or 'horizontal'")
  }
  const settings: OrthogonalRoutingSettings = Object.freeze({
    gap: finiteOr(options.gap, defaultGap, 0, Number.MAX_VALUE),
    spacing: finiteOr(options.spacing, defaultSpacing, 0, Number.MAX_VALUE),
    axis,
  })
  return Object.freeze({
    name: 'orthogonal',
    options: settings,
    radius: finiteOr(options.radius, defaultRadius, 0, Number.MAX_VALUE),
    maxEdges: Math.max(0, Math.floor(finiteOr(options.maxEdges, defaultMaxEdges, 0, 2 ** 31))),
    start: (graph: RouteGraph, listener: BundleListener) => start(graph, settings, listener),
  })
}
