import { toWorld, type Viewport } from '../core/view'
import type { Point, View } from '../types'
import type { LensFrame } from './renderer'

/** What a lens follows: `'pointer'`, `'focus'` (the focused node) or `null` to stay in place. */
export type LensFollow = 'pointer' | 'focus' | null

/** A shown magnifying lens. */
export interface GraphLensState {
  /** Center of the lens, in screen pixels relative to the graph element. */
  readonly at: Point
  /** Radius, in screen pixels. */
  readonly radius: number
  /** Magnification, relative to the view zoom. */
  readonly zoom: number
  /** What the lens follows: `'pointer'`, `'focus'` (the focused node) or `null` to stay put. */
  readonly follow: LensFollow
}

/**
 * Lens shown by `lens.set`. Omitted fields keep those of the shown lens, then the
 * `interaction.lens` options.
 */
export interface LensInput {
  /**
   * Center in screen pixels relative to the graph element, `'pointer'` to follow the pointer over
   * the graph, or `'focus'` to follow the focused node. Defaults to the center of the element.
   */
  readonly at?: Point | 'pointer' | 'focus'
  /** Radius, in screen pixels. */
  readonly radius?: number
  /** Magnification relative to the view zoom, from 1 to 32. */
  readonly zoom?: number
}

/**
 * The magnifying lens: a circle that draws the graph under it at a higher zoom, without moving the
 * view. Picking inside it hits what it shows. It never enters exports, and does not work on a map.
 */
export interface GraphLens {
  /** Current lens, or `null` when hidden. */
  get(): GraphLensState | null
  /** Shows, moves or resizes the lens, or hides it with `null`. */
  set(lens: LensInput | null): void
  /** Converts a screen point to world units, through the lens inside it and the view elsewhere. */
  toWorld(point: Point): Point
}

export const minLensZoom = 1
export const maxLensZoom = 32

export function clampLensZoom(zoom: number): number {
  return Math.min(maxLensZoom, Math.max(minLensZoom, zoom))
}

export function lensContains(lens: GraphLensState, point: Point): boolean {
  return Math.hypot(point.x - lens.at.x, point.y - lens.at.y) <= lens.radius
}

export function lensView(view: View, size: Viewport, lens: GraphLensState): View {
  const center = toWorld(view, size, lens.at)
  const zoom = view.zoom * lens.zoom
  return {
    x: center.x - (lens.at.x - size.width / 2) / zoom,
    y: center.y - (lens.at.y - size.height / 2) / zoom,
    zoom,
  }
}

export function lensFrame(view: View, size: Viewport, lens: GraphLensState): LensFrame {
  const center = toWorld(view, size, lens.at)
  return {
    x: lens.at.x,
    y: lens.at.y,
    radius: lens.radius,
    view: { x: center.x, y: center.y, zoom: view.zoom * lens.zoom },
  }
}

export function sameLens(a: GraphLensState | null, b: GraphLensState | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.at.x === b.at.x &&
    a.at.y === b.at.y &&
    a.radius === b.radius &&
    a.zoom === b.zoom &&
    a.follow === b.follow
  )
}

export function editableTarget(target: EventTarget | null): boolean {
  if (!target || !('tagName' in target)) return false
  const element = target as HTMLElement
  return element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName)
}
