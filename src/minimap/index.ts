import { wheelFactor } from '../core/view'
import { edgeShown, filtered, nodeShown, type Sight } from '../core/visibility'
import { dev } from '../dev'
import { listenPinch } from '../dom/gestures'
import { ThemeResolver } from '../dom/theme'
import { type GraphInternals, internalsOf } from '../host/internals'
import type { GraphInstance } from '../host/mount-graph'
import { themeColor } from '../theme/tokens'
import type { Mark, Point } from '../types'
import { MinimapPainter } from './painter'
import type { DrawnMessage, DrawRequest, MinimapPaint } from './protocol'
import {
  packColor,
  packPalette,
  type RasterContainers,
  type RasterEdges,
  type RasterFit,
  type RasterNodes,
} from './raster'
import { packShapes } from './shape-pack'
import MinimapWorker from './worker?worker&inline'

/** Corner of the graph element that holds a minimap. */
export type MinimapCorner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

/** Options of `createMinimap`. Every color is a CSS color, resolved with the current theme. */
export interface MinimapOptions {
  /**
   * Corner of the graph element where the minimap sits, or `null` to leave the element for the
   * application to place anywhere in the page.
   * @default 'bottomRight'
   */
  readonly corner?: MinimapCorner | null | undefined
  /**
   * Width of the minimap, in CSS pixels. A value that is not above 0 falls back to the default.
   * @default 200
   */
  readonly width?: number | undefined
  /**
   * Height of the minimap, in CSS pixels. A value that is not above 0 falls back to the default.
   * @default 150
   */
  readonly height?: number | undefined
  /**
   * Space between the minimap and the edges of the graph element, in CSS pixels. Applies to a
   * minimap in a corner.
   * @default 12
   */
  readonly margin?: number | undefined
  /**
   * Space between the graph and the edges of the minimap, in CSS pixels.
   * @default 8
   */
  readonly padding?: number | undefined
  /**
   * Draws the edges while the graph shows at most this many, `0` for never. Past it, the minimap
   * draws nodes only.
   * @default 20000
   */
  readonly maxEdges?: number | undefined
  /**
   * Most points of the outlines of shapes drawn in all, `0` for no shapes. Shapes are simplified
   * to the size of the minimap first; past it, the next ones draw as their bounding boxes.
   * @default 200000
   */
  readonly maxShapePoints?: number | undefined
  /**
   * Smallest diameter of a node in the minimap, in CSS pixels. Nodes keep their size up to a cap
   * that shrinks as nodes get more numerous.
   * @default 2
   */
  readonly nodeSize?: number | undefined
  /** One color for every node, or `null` for the colors of the graph. */
  readonly nodeColor?: string | null | undefined
  /**
   * Color of the selected nodes, drawn above the others, or `null` to draw them like the others.
   * @default 'var(--graph-accent)'
   */
  readonly selectionColor?: string | null | undefined
  /**
   * Background of the minimap.
   * @default 'var(--graph-paper-raised)'
   */
  readonly background?: string | undefined
  /**
   * Color laid over the parts of the minimap outside the view.
   * @default 'color-mix(in srgb, var(--graph-ink) 10%, transparent)'
   */
  readonly mask?: string | undefined
  /**
   * Color of the rectangle of the view, drawn at least 8 pixels wide and high.
   * @default 'var(--graph-ink)'
   */
  readonly viewColor?: string | undefined
  /**
   * Dragging the rectangle moves the view, and pressing elsewhere centers the view there.
   * @default true
   */
  readonly pan?: boolean | undefined
  /**
   * The wheel over the minimap zooms the view around its center.
   * @default true
   */
  readonly zoom?: boolean | undefined
}

/** A minimap made by `createMinimap`. */
export interface Minimap {
  /** The element of the minimap: in a corner of the graph, or for the application to place. */
  readonly element: HTMLElement
  /**
   * Changes the options: an option left out keeps its current value, an option set to `undefined`
   * returns to its default.
   */
  update(options?: MinimapOptions): void
  /** Removes the element and stops following the graph. Destroying the graph destroys it too. */
  destroy(): void
}

interface Settings {
  readonly corner: MinimapCorner | null
  readonly width: number
  readonly height: number
  readonly margin: number
  readonly padding: number
  readonly maxEdges: number
  readonly maxShapePoints: number
  readonly nodeSize: number
  readonly nodeColor: string | null
  readonly selectionColor: string | null
  readonly background: string
  readonly mask: string
  readonly viewColor: string
  readonly pan: boolean
  readonly zoom: boolean
}

interface Drag {
  readonly id: number
  readonly grab: Point
}

interface Pending {
  scene: boolean
  colors: boolean
  positions: boolean
  masks: boolean
  paint: boolean
}

interface Channel {
  readonly copies: boolean
  send(request: DrawRequest, transfer: Transferable[]): void
  destroy(): void
}

const minInterval = 32
const costRatio = 10
const edgeAlpha = 0.5
const selectedDiameter = 5
const minView = 8
const borderColor = `color-mix(in srgb, ${themeColor('ink')} 16%, transparent)`

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback
}

function size(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback
}

function settle(options: MinimapOptions): Settings {
  return {
    corner: options.corner === undefined ? 'bottomRight' : options.corner,
    width: size(options.width, 200),
    height: size(options.height, 150),
    margin: positive(options.margin, 12),
    padding: positive(options.padding, 8),
    maxEdges: positive(options.maxEdges, 20_000),
    maxShapePoints: positive(options.maxShapePoints, 200_000),
    nodeSize: positive(options.nodeSize, 2),
    nodeColor: options.nodeColor ?? null,
    selectionColor:
      options.selectionColor === undefined ? themeColor('accent') : options.selectionColor,
    background: options.background ?? themeColor('paper-raised'),
    mask: options.mask ?? `color-mix(in srgb, ${themeColor('ink')} 10%, transparent)`,
    viewColor: options.viewColor ?? themeColor('ink'),
    pan: options.pan ?? true,
    zoom: options.zoom ?? true,
  }
}

function fewerThan(alive: Uint8Array, capacity: number, limit: number): boolean {
  let count = 0
  for (let index = 0; index < capacity; index++) {
    if (alive[index] === 1 && ++count > limit) return false
  }
  return true
}

function shownNodes(internals: GraphInternals, sight: Sight): Uint8Array {
  const nodes = internals.scene.nodes
  const alive = nodes.alive.slice(0, nodes.capacity)
  for (let index = 0; index < alive.length; index++) {
    if (alive[index] === 1 && !nodeShown(nodes, index, sight)) alive[index] = 2
  }
  return alive
}

function shownEdges(internals: GraphInternals, sight: Sight): Uint8Array {
  const { nodes, edges } = internals.scene
  const alive = edges.alive.slice(0, edges.capacity)
  for (let index = 0; index < alive.length; index++) {
    if (alive[index] === 1 && !edgeShown(nodes, edges, index, sight)) alive[index] = 0
  }
  return alive
}

function nodesOf(internals: GraphInternals, copy: boolean, sight: Sight): RasterNodes {
  const nodes = internals.scene.nodes
  const capacity = nodes.capacity
  const take = <A extends { slice(start: number, end: number): A }>(array: A): A =>
    copy ? array.slice(0, capacity) : array
  return {
    capacity,
    alive: filtered(nodes, sight) ? shownNodes(internals, sight) : take(nodes.alive),
    shape: take(nodes.shape),
    size: take(nodes.size),
    width: take(nodes.width),
    fill: take(nodes.fill),
    stroke: take(nodes.stroke),
    strokeWidth: take(nodes.strokeWidth),
    opacity: take(nodes.opacity),
    screenUnits: take(nodes.screenUnits),
    container: take(nodes.container),
  }
}

function edgesOf(internals: GraphInternals, copy: boolean, sight: Sight): RasterEdges {
  const { nodes, edges } = internals.scene
  const capacity = edges.capacity
  const take = <A extends { slice(start: number, end: number): A }>(array: A): A =>
    copy ? array.slice(0, capacity) : array
  const ranged = filtered(nodes, sight) || filtered(edges, sight)
  return {
    capacity,
    alive: ranged ? shownEdges(internals, sight) : take(edges.alive),
    source: take(edges.source),
    target: take(edges.target),
    color: take(edges.color),
    opacity: take(edges.opacity),
  }
}

function containersOf(internals: GraphInternals, copy: boolean): RasterContainers | null {
  const frame = internals.containers()
  if (!frame) return null
  return copy
    ? {
        boxes: frame.boxes.slice(0, internals.scene.nodes.capacity * 4),
        order: frame.order.slice(0, frame.count),
        count: frame.count,
      }
    : frame
}

function buffersOf(request: DrawRequest): Transferable[] {
  const transfer = new Set<ArrayBufferLike>()
  const add = (value: unknown) => {
    if (ArrayBuffer.isView(value)) transfer.add(value.buffer)
  }
  for (const part of [request.nodes, request.edges, request.containers, request.shapes]) {
    if (part) for (const value of Object.values(part)) add(value)
  }
  add(request.colors)
  add(request.xy)
  add(request.masks)
  return [...transfer].filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer)
}

function workerChannel(
  canvas: HTMLCanvasElement,
  drawn: (fit: RasterFit | null) => void,
  failed: () => void,
): Channel | null {
  if (
    typeof Worker === 'undefined' ||
    typeof OffscreenCanvas === 'undefined' ||
    typeof ImageBitmapRenderingContext === 'undefined'
  ) {
    return null
  }
  let worker: Worker
  try {
    worker = new MinimapWorker({ name: 'graph-minimap' })
  } catch {
    return null
  }
  const renderer = canvas.getContext('bitmaprenderer')
  if (!renderer) {
    worker.terminate()
    return null
  }
  worker.onmessage = (event: MessageEvent<DrawnMessage>) => {
    const { fit, frame } = event.data
    if (canvas.width !== frame.width || canvas.height !== frame.height) {
      canvas.width = frame.width
      canvas.height = frame.height
    }
    renderer.transferFromImageBitmap(frame)
    drawn(fit)
  }
  worker.onerror = (event) => {
    event.preventDefault()
    worker.terminate()
    failed()
  }
  return {
    copies: true,
    send: (request, transfer) => worker.postMessage(request, transfer),
    destroy: () => worker.terminate(),
  }
}

function localChannel(canvas: HTMLCanvasElement, drawn: (fit: RasterFit | null) => void): Channel {
  const painter = new MinimapPainter(canvas, canvas.getContext('2d'))
  return {
    copies: false,
    send: (request) => drawn(painter.draw(request)),
    destroy: () => {},
  }
}

const warnedOnMap = new WeakSet<object>()

function offMap(graph: object, internals: GraphInternals): Minimap {
  if (dev && !warnedOnMap.has(graph)) {
    warnedOnMap.add(graph)
    console.warn('graph: the minimap does not work on a map')
  }
  const element = document.createElement('div')
  element.setAttribute('data-graph-minimap', '')
  element.setAttribute('aria-hidden', 'true')
  let destroyed = false
  let stopWatch: (() => void) | null = null
  const destroy = () => {
    if (destroyed) return
    destroyed = true
    stopWatch?.()
    element.remove()
  }
  stopWatch = internals.watch({ frame: () => {}, destroy })
  return { element, update: () => {}, destroy }
}

/**
 * Draws an overview of the whole graph with the rectangle of the current view, and moves the view
 * from it. It follows positions, data, theme and view, and draws in a worker when the browser
 * allows it, at a pace bounded by its cost on the page. On a graph drawn on a map, it draws
 * nothing and warns once in development: its element stays empty and its methods do nothing.
 */
export function createMinimap<S extends string, M extends Mark>(
  graph: GraphInstance<S, M>,
  options: MinimapOptions = {},
): Minimap {
  const internals = internalsOf(graph, 'createMinimap')
  if (internals.onMap) return offMap(graph, internals)
  let given = options
  let settings = settle(given)
  const element = document.createElement('div')
  element.setAttribute('data-graph-minimap', '')
  element.setAttribute('aria-hidden', 'true')
  const frame = document.createElement('div')
  frame.setAttribute('data-view', '')
  frame.style.cssText =
    'position:absolute;left:0;top:0;box-sizing:border-box;pointer-events:none;visibility:hidden;border-radius:2px'
  let canvas = createCanvas()
  element.append(canvas, frame)
  const resolver = new ThemeResolver(element)
  const pending: Pending = { scene: true, colors: true, positions: true, masks: true, paint: true }
  let channel = openChannel()
  let fit: RasterFit | null = null
  let ratio = 1
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight = false
  let lastSent = Number.NEGATIVE_INFINITY
  let cooldown = minInterval
  let drawn = internals.stamp()
  let drawnSelection: unknown = graph.store.state.selection
  let drag: Drag | null = null
  let destroyed = false
  let nodeColor: number | null = null
  let selectionColor: number | null = null

  function createCanvas(): HTMLCanvasElement {
    const next = document.createElement('canvas')
    next.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
    return next
  }

  function openChannel(): Channel {
    return (
      workerChannel(canvas, onDrawn, () => {
        const next = createCanvas()
        canvas.replaceWith(next)
        canvas = next
        channel = localChannel(canvas, onDrawn)
        inFlight = false
        invalidateAll()
      }) ?? localChannel(canvas, onDrawn)
    )
  }

  function style(): void {
    const corner = settings.corner
    const place = corner
      ? `position:absolute;z-index:1;${corner.startsWith('top') ? 'top' : 'bottom'}:${settings.margin}px;${corner.endsWith('Left') ? 'left' : 'right'}:${settings.margin}px`
      : 'position:relative'
    element.style.cssText = `${place};width:${settings.width}px;height:${settings.height}px;overflow:hidden;box-sizing:border-box;border:1px solid ${borderColor};border-radius:4px;background:${settings.background};touch-action:none;user-select:none;cursor:${settings.pan ? 'pointer' : 'default'}`
    frame.style.border = `1.5px solid ${settings.viewColor}`
    frame.style.boxShadow = `0 0 0 100vmax ${settings.mask}`
    if (corner) {
      if (element.parentElement !== graph.element) graph.element.append(element)
    } else if (element.parentElement === graph.element) {
      element.remove()
    }
  }

  function resolveColors(): void {
    const toPacked = (css: string | null): number | null => {
      if (css === null) return null
      const [r, g, b, a] = resolver.color(css)
      return packColor(r, g, b, a)
    }
    nodeColor = toPacked(settings.nodeColor)
    selectionColor = toPacked(settings.selectionColor)
  }

  function invalidateAll(): void {
    pending.scene = pending.colors = pending.positions = pending.masks = pending.paint = true
    schedule()
  }

  function schedule(): void {
    if (timer !== undefined || inFlight || destroyed) return
    if (!pending.scene && !pending.colors && !pending.positions && !pending.masks && !pending.paint)
      return
    const wait = Math.max(0, lastSent + cooldown - performance.now())
    timer = setTimeout(send, wait)
  }

  function paint(): MinimapPaint {
    ratio = window.devicePixelRatio || 1
    const width = (element.clientWidth || settings.width) * ratio
    const height = (element.clientHeight || settings.height) * ratio
    return {
      width,
      height,
      padding: settings.padding * ratio,
      minRadius: (settings.nodeSize * ratio) / 2,
      selectedRadius: (Math.max(settings.nodeSize, selectedDiameter) * ratio) / 2,
      edgeAlpha,
      nodeColor,
      selectedColor: selectionColor,
    }
  }

  function send(): void {
    timer = undefined
    if (destroyed || inFlight) return
    const start = performance.now()
    const copy = channel.copies
    const stamp = internals.stamp()
    if (pending.colors) resolveColors()
    const painted = paint()
    let request: DrawRequest = { type: 'draw', paint: painted }
    if (pending.scene) {
      const edges = internals.scene.edges
      const withEdges =
        settings.maxEdges > 0 && fewerThan(edges.alive, edges.capacity, settings.maxEdges)
      const sight = internals.sight()
      const inset = painted.padding * 2
      request = {
        ...request,
        nodes: nodesOf(internals, copy, sight),
        edges: withEdges ? edgesOf(internals, copy, sight) : null,
        shapes: packShapes(internals.scene.shapes, internals.positions, sight, {
          width: Math.max(1, painted.width - inset),
          height: Math.max(1, painted.height - inset),
          maxPoints: settings.maxShapePoints,
        }),
      }
    }
    if (pending.colors || pending.scene) {
      const count = internals.scene.palette.colors.length
      request = { ...request, colors: packPalette(internals.palette(), count, new Uint32Array(0)) }
    }
    if (pending.positions || pending.scene) {
      const xy = internals.positions.xy
      const length = Math.min(xy.length, internals.scene.nodes.capacity * 2)
      request = {
        ...request,
        xy: copy ? xy.slice(0, length) : xy,
        containers: containersOf(internals, copy),
      }
    }
    if (pending.masks || pending.scene) {
      const masks = internals.masks()
      request = {
        ...request,
        masks:
          settings.selectionColor === null
            ? null
            : copy
              ? masks.slice(0, internals.scene.nodes.capacity)
              : masks,
      }
    }
    pending.scene = pending.colors = pending.positions = pending.masks = pending.paint = false
    drawn = stamp
    drawnSelection = graph.store.state.selection
    inFlight = true
    lastSent = start
    channel.send(request, copy ? buffersOf(request) : [])
    cooldown = Math.max(minInterval, (performance.now() - start) * costRatio)
  }

  function onDrawn(next: RasterFit | null): void {
    inFlight = false
    if (destroyed) return
    fit = next
      ? {
          minX: next.minX,
          minY: next.minY,
          scale: next.scale / ratio,
          offsetX: next.offsetX / ratio,
          offsetY: next.offsetY / ratio,
        }
      : null
    placeView()
    schedule()
  }

  function placeView(): void {
    const { view, width: viewWidth, height: viewHeight } = graph.store.state
    if (!fit || viewWidth === 0 || viewHeight === 0) {
      frame.style.visibility = 'hidden'
      return
    }
    const halfWidth = viewWidth / 2 / view.zoom
    const halfHeight = viewHeight / 2 / view.zoom
    const width = Math.max(minView, halfWidth * 2 * fit.scale)
    const height = Math.max(minView, halfHeight * 2 * fit.scale)
    const left = (view.x - fit.minX) * fit.scale + fit.offsetX - width / 2
    const top = (view.y - fit.minY) * fit.scale + fit.offsetY - height / 2
    frame.style.visibility = 'visible'
    frame.style.transform = `translate(${left}px,${top}px)`
    frame.style.width = `${width}px`
    frame.style.height = `${height}px`
  }

  function toWorld(event: MouseEvent): Point | null {
    if (!fit) return null
    const rect = element.getBoundingClientRect()
    const x = event.clientX - rect.left - element.clientLeft
    const y = event.clientY - rect.top - element.clientTop
    return {
      x: fit.minX + (x - fit.offsetX) / fit.scale,
      y: fit.minY + (y - fit.offsetY) / fit.scale,
    }
  }

  function insideView(point: Point): boolean {
    const { view, width: viewWidth, height: viewHeight } = graph.store.state
    const least = fit ? minView / 2 / fit.scale : 0
    return (
      Math.abs(point.x - view.x) <= Math.max(least, viewWidth / 2 / view.zoom) &&
      Math.abs(point.y - view.y) <= Math.max(least, viewHeight / 2 / view.zoom)
    )
  }

  function moveTo(point: Point, grab: Point): void {
    const zoom = graph.store.state.view.zoom
    graph.view.set({ x: point.x - grab.x, y: point.y - grab.y, zoom })
  }

  function onPointerDown(event: PointerEvent): void {
    if (!settings.pan || event.button !== 0 || drag) return
    const point = toWorld(event)
    if (!point) return
    event.preventDefault()
    const view = graph.store.state.view
    const inside = insideView(point)
    const grab = inside ? { x: point.x - view.x, y: point.y - view.y } : { x: 0, y: 0 }
    drag = { id: event.pointerId, grab }
    element.setPointerCapture?.(event.pointerId)
    element.style.cursor = 'grabbing'
    if (!inside) moveTo(point, grab)
  }

  function onPointerMove(event: PointerEvent): void {
    const point = toWorld(event)
    if (!drag) {
      if (settings.pan && point) element.style.cursor = insideView(point) ? 'grab' : 'pointer'
      return
    }
    if (event.pointerId !== drag.id || !point) return
    moveTo(point, drag.grab)
  }

  function onPointerUp(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.id) return
    drag = null
    if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId)
    element.style.cursor = settings.pan ? 'pointer' : 'default'
  }

  function onWheel(event: WheelEvent): void {
    if (!settings.zoom) return
    event.preventDefault()
    if (event.ctrlKey && pinchGestures.active) return
    const height = graph.store.state.height
    graph.view.zoomBy(wheelFactor(event.deltaY, event.deltaMode, height, 1, event.ctrlKey))
  }

  const listeners: ReadonlyArray<readonly [string, (event: never) => void]> = [
    ['pointerdown', onPointerDown],
    ['pointermove', onPointerMove],
    ['pointerup', onPointerUp],
    ['pointercancel', onPointerUp],
  ]
  for (const [name, listener] of listeners) {
    element.addEventListener(name, listener as EventListener)
  }
  element.addEventListener('wheel', onWheel, { passive: false })
  const pinchGestures = listenPinch(element, {
    start: () => settings.zoom,
    change: ({ factor }) => graph.view.zoomBy(factor),
  })

  const resizeObserver = new ResizeObserver(() => {
    pending.paint = true
    schedule()
  })
  resizeObserver.observe(element)

  const subscription = graph.store.subscribe(() => placeView())
  let stopWatch: (() => void) | null = null

  function destroy(): void {
    if (destroyed) return
    destroyed = true
    clearTimeout(timer)
    stopWatch?.()
    subscription.unsubscribe()
    resizeObserver.disconnect()
    for (const [name, listener] of listeners) {
      element.removeEventListener(name, listener as EventListener)
    }
    element.removeEventListener('wheel', onWheel)
    pinchGestures.stop()
    channel.destroy()
    resolver.destroy()
    element.remove()
  }

  style()
  schedule()
  stopWatch = internals.watch({
    frame() {
      const stamp = internals.stamp()
      if (stamp.scene !== drawn.scene || stamp.detail !== drawn.detail) pending.scene = true
      if (stamp.palette !== drawn.palette) pending.colors = true
      if (stamp.positions !== drawn.positions || stamp.containers !== drawn.containers) {
        pending.positions = true
      }
      if (graph.store.state.selection !== drawnSelection) pending.masks = true
      schedule()
    },
    destroy: () => destroy(),
  })

  return {
    element,
    update(next = {}) {
      if (destroyed) return
      const previous = settings
      given = { ...given, ...next }
      settings = settle(given)
      style()
      if (
        previous.maxEdges !== settings.maxEdges ||
        previous.maxShapePoints !== settings.maxShapePoints
      ) {
        pending.scene = true
      }
      if (
        previous.nodeColor !== settings.nodeColor ||
        previous.selectionColor !== settings.selectionColor
      ) {
        pending.colors = true
        pending.masks = true
      }
      pending.paint = true
      schedule()
    },
    destroy,
  }
}
