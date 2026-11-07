import type { Bounds, FitPadding, Point, View } from '../types'

export type { Bounds }

export interface Viewport {
  readonly width: number
  readonly height: number
}

export interface ZoomLimits {
  readonly minZoom: number
  readonly maxZoom: number
}

export interface PanLimits {
  readonly box: Bounds
  readonly margin: number
}

export const defaultZoomLimits: ZoomLimits = { minZoom: 1e-3, maxZoom: 64 }

const lineHeight = 16
const wheelLimit = 120
const wheelRate = 0.0025
const pinchLimit = 30
const pinchRate = 0.01

export function clampZoom(zoom: number, limits: ZoomLimits = defaultZoomLimits): number {
  return Math.min(limits.maxZoom, Math.max(limits.minZoom, zoom))
}

function clampCenter(center: number, min: number, max: number, half: number): number {
  const low = min + half
  const high = max - half
  return low <= high ? Math.min(high, Math.max(low, center)) : Math.min(low, Math.max(high, center))
}

export function constrainView(
  view: View,
  viewport: Viewport,
  limits: ZoomLimits,
  pan: PanLimits | null,
): View {
  const zoom = clampZoom(view.zoom, limits)
  let { x, y } = view
  if (pan) {
    const margin = pan.margin / zoom
    x = clampCenter(x, pan.box.minX - margin, pan.box.maxX + margin, viewport.width / 2 / zoom)
    y = clampCenter(y, pan.box.minY - margin, pan.box.maxY + margin, viewport.height / 2 / zoom)
  }
  return x === view.x && y === view.y && zoom === view.zoom ? view : { x, y, zoom }
}

export function toScreen(view: View, viewport: Viewport, point: Point): Point {
  return {
    x: (point.x - view.x) * view.zoom + viewport.width / 2,
    y: (point.y - view.y) * view.zoom + viewport.height / 2,
  }
}

export function toWorld(view: View, viewport: Viewport, point: Point): Point {
  return {
    x: (point.x - viewport.width / 2) / view.zoom + view.x,
    y: (point.y - viewport.height / 2) / view.zoom + view.y,
  }
}

export function panBy(view: View, dx: number, dy: number): View {
  return { x: view.x - dx / view.zoom, y: view.y - dy / view.zoom, zoom: view.zoom }
}

export function zoomAround(
  view: View,
  viewport: Viewport,
  anchor: Point,
  factor: number,
  limits: ZoomLimits = defaultZoomLimits,
): View {
  const zoom = clampZoom(view.zoom * factor, limits)
  const before = toWorld(view, viewport, anchor)
  const after = toWorld({ x: view.x, y: view.y, zoom }, viewport, anchor)
  return { x: view.x + before.x - after.x, y: view.y + before.y - after.y, zoom }
}

export interface Sides {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

export function resolvePadding(padding: number | FitPadding | undefined, fallback: Sides): Sides {
  if (padding === undefined) return fallback
  if (typeof padding === 'number') {
    return Number.isFinite(padding)
      ? { top: padding, right: padding, bottom: padding, left: padding }
      : fallback
  }
  const side = (value: number | undefined, other: number) =>
    value !== undefined && Number.isFinite(value) ? value : other
  return {
    top: side(padding.top, fallback.top),
    right: side(padding.right, fallback.right),
    bottom: side(padding.bottom, fallback.bottom),
    left: side(padding.left, fallback.left),
  }
}

export function fitBounds(
  bounds: Bounds,
  viewport: Viewport,
  padding: Sides,
  limits: ZoomLimits = defaultZoomLimits,
): View {
  const width = Math.max(1, viewport.width - padding.left - padding.right)
  const height = Math.max(1, viewport.height - padding.top - padding.bottom)
  const spanX = Math.max(1e-9, bounds.maxX - bounds.minX)
  const spanY = Math.max(1e-9, bounds.maxY - bounds.minY)
  const zoom = clampZoom(Math.min(width / spanX, height / spanY), limits)
  return {
    x: (bounds.minX + bounds.maxX) / 2 - (padding.left - padding.right) / 2 / zoom,
    y: (bounds.minY + bounds.maxY) / 2 - (padding.top - padding.bottom) / 2 / zoom,
    zoom,
  }
}

export function wheelPixels(delta: number, deltaMode: number, length: number): number {
  return delta * (deltaMode === 1 ? lineHeight : deltaMode === 2 ? length : 1)
}

export function wheelFactor(
  deltaY: number,
  deltaMode: number,
  viewportHeight: number,
  speed: number,
  pinch = false,
): number {
  const pixels = wheelPixels(deltaY, deltaMode, viewportHeight)
  const limit = pinch ? pinchLimit : wheelLimit
  const delta = Math.max(-limit, Math.min(limit, pixels))
  return Math.exp(-delta * (pinch ? pinchRate : wheelRate) * speed)
}

export function edgePush(position: number, length: number, zone: number): number {
  const size = Math.min(zone, length / 4)
  if (!(size > 0)) return 0
  if (position < size) return -Math.min(1, (size - position) / size)
  if (position > length - size) return Math.min(1, (position - length + size) / size)
  return 0
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

export function interpolateView(from: View, to: View, t: number): View {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    zoom: Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * t),
  }
}
