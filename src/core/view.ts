import type { Point, View } from '../types'

export interface Viewport {
  readonly width: number
  readonly height: number
}

export interface Bounds {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

export interface ZoomLimits {
  readonly min: number
  readonly max: number
}

export const defaultZoomLimits: ZoomLimits = { min: 1e-3, max: 64 }

export function clampZoom(zoom: number, limits: ZoomLimits = defaultZoomLimits): number {
  return Math.min(limits.max, Math.max(limits.min, zoom))
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

export function fitBounds(
  bounds: Bounds,
  viewport: Viewport,
  padding: number,
  limits: ZoomLimits = defaultZoomLimits,
): View {
  const width = Math.max(1, viewport.width - padding * 2)
  const height = Math.max(1, viewport.height - padding * 2)
  const spanX = Math.max(1e-9, bounds.maxX - bounds.minX)
  const spanY = Math.max(1e-9, bounds.maxY - bounds.minY)
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    zoom: clampZoom(Math.min(width / spanX, height / spanY), limits),
  }
}

export function wheelFactor(
  deltaY: number,
  deltaMode: number,
  viewportHeight: number,
  speed: number,
): number {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? viewportHeight : 1
  const delta = Math.max(-120, Math.min(120, deltaY * unit))
  return Math.exp(-delta * 0.0025 * speed)
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
