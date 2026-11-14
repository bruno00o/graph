import { worldSize, worldToGeo } from '../core/geo'
import { effectiveAreas } from '../shapes/simplify'
import type { Point, ShapeGeometry } from '../types'

/**
 * A tool that draws new shapes: `'rectangle'`, `'circle'`, `'line'`, `'polygon'`, `'freehand'`, or
 * `'text'`, which draws a box and opens a text input in it.
 */
export type ShapeDrawTool = 'rectangle' | 'circle' | 'line' | 'polygon' | 'freehand' | 'text'

/**
 * What a press of a shape editor does: `'select'` selects, moves and reshapes shapes; the other
 * tools draw new shapes.
 */
export type ShapeEditorTool = 'select' | ShapeDrawTool

/** Snapping of a shape editor. */
export interface ShapeEditorSnap {
  /**
   * Grid that drawn and dragged points snap to: `'background'` for the lines of the background grid
   * shown at the current zoom, or a spacing in world units. Defaults to no grid.
   */
  readonly grid?: 'background' | number | null | undefined
  /**
   * Step, in degrees, that Shift turns the segments of a line or a polygon by, 0 for none.
   * @default 15
   */
  readonly angle?: number | undefined
}

export const drawTools: ReadonlySet<string> = new Set<ShapeEditorTool>([
  'select',
  'rectangle',
  'circle',
  'line',
  'polygon',
  'freehand',
  'text',
])

const earthRadius = 6_371_008.8

function hex(bytes: Uint8Array, from: number, to: number): string {
  let text = ''
  for (let at = from; at < to; at++) text += (bytes[at] ?? 0).toString(16).padStart(2, '0')
  return text
}

export function randomKey(): string {
  const source = globalThis.crypto
  if (typeof source?.randomUUID === 'function') return source.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof source?.getRandomValues === 'function') source.getRandomValues(bytes)
  else for (let at = 0; at < 16; at++) bytes[at] = Math.floor(Math.random() * 256)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  return `${hex(bytes, 0, 4)}-${hex(bytes, 4, 6)}-${hex(bytes, 6, 8)}-${hex(bytes, 8, 10)}-${hex(bytes, 10, 16)}`
}

function wrapped(longitude: number): number {
  return longitude > 180 || longitude < -180
    ? longitude - 360 * Math.round(longitude / 360)
    : longitude
}

function position(point: Point): number[] {
  const place = worldToGeo(point)
  return [wrapped(place.longitude), place.latitude]
}

function polygon(points: readonly Point[]): ShapeGeometry {
  let area = 0
  for (let at = 0; at < points.length; at++) {
    const a = points[at]
    const b = points[(at + 1) % points.length]
    if (a && b) area += (b.x - a.x) * (b.y + a.y)
  }
  const ring = (area < 0 ? [...points].reverse() : points).map(position)
  const first = ring[0]
  if (first) ring.push([...first])
  return { type: 'Polygon', coordinates: [ring] }
}

export function worldToMeters(distance: number, y: number): number {
  const latitude = Math.atan(Math.sinh(Math.PI - (y / worldSize) * 2 * Math.PI))
  return (distance * 2 * Math.PI * earthRadius * Math.cos(latitude)) / worldSize
}

export function rectangleGeometry(a: Point, b: Point, degrees: boolean): ShapeGeometry | null {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const width = Math.abs(a.x - b.x)
  const height = Math.abs(a.y - b.y)
  if (!(width > 0) || !(height > 0)) return null
  if (!degrees) return { x, y, width, height }
  return polygon([
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ])
}

export function circleGeometry(center: Point, edge: Point, degrees: boolean): ShapeGeometry | null {
  const radius = Math.hypot(edge.x - center.x, edge.y - center.y)
  if (!(radius > 0)) return null
  if (!degrees) return { center: { x: center.x, y: center.y }, radius }
  const place = worldToGeo(center)
  return {
    center: { longitude: wrapped(place.longitude), latitude: place.latitude },
    radius: worldToMeters(radius, center.y),
  }
}

function distinct(points: readonly Point[], closed: boolean): Point[] {
  const kept: Point[] = []
  for (const point of points) {
    const last = kept[kept.length - 1]
    if (!last || last.x !== point.x || last.y !== point.y) kept.push(point)
  }
  const first = kept[0]
  const last = kept[kept.length - 1]
  if (closed && kept.length > 1 && first && last && first.x === last.x && first.y === last.y) {
    kept.pop()
  }
  return kept
}

export function pathGeometry(
  points: readonly Point[],
  closed: boolean,
  degrees: boolean,
): ShapeGeometry | null {
  const kept = distinct(points, closed)
  if (kept.length < (closed ? 3 : 2)) return null
  if (closed) {
    return degrees ? polygon(kept) : { rings: [kept.map(({ x, y }) => ({ x, y }))] }
  }
  return degrees
    ? { type: 'LineString', coordinates: kept.map(position) }
    : { points: kept.map(({ x, y }) => ({ x, y })) }
}

export function snapToGrid(point: Point, step: number): Point {
  if (!(step > 0) || !Number.isFinite(step)) return point
  return { x: Math.round(point.x / step) * step, y: Math.round(point.y / step) * step }
}

export function backgroundStep(spacing: number, zoom: number, adaptive: boolean): number {
  if (!adaptive) return spacing
  const level = Math.ceil(Math.log(16 / (spacing * zoom)) / Math.log(4))
  return spacing * 4 ** level
}

export function turnBy(from: Point, to: Point, step: number): Point {
  if (!(step > 0)) return to
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return to
  const unit = (step * Math.PI) / 180
  const angle = Math.round(Math.atan2(dy, dx) / unit) * unit
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length }
}

export function squareFrom(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const side = Math.max(Math.abs(dx), Math.abs(dy))
  return { x: from.x + Math.sign(dx || 1) * side, y: from.y + Math.sign(dy || 1) * side }
}

function chordDistance(xy: Float64Array, k: number, a: number, b: number): number {
  const ax = xy[a * 2] ?? 0
  const ay = xy[a * 2 + 1] ?? 0
  const dx = (xy[b * 2] ?? 0) - ax
  const dy = (xy[b * 2 + 1] ?? 0) - ay
  const px = (xy[k * 2] ?? 0) - ax
  const py = (xy[k * 2 + 1] ?? 0) - ay
  const length = dx * dx + dy * dy
  const t = length > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy) / length)) : 0
  return Math.hypot(px - t * dx, py - t * dy)
}

function keptAfter(rank: Int32Array, removed: number): number[] {
  const kept: number[] = []
  for (let k = 0; k < rank.length; k++) if ((rank[k] ?? 0) >= removed) kept.push(k)
  return kept
}

function strayOf(xy: Float64Array, kept: readonly number[], closed: boolean): number {
  const count = xy.length / 2
  let worst = 0
  for (let at = 0; at < kept.length; at++) {
    const a = kept[at] ?? 0
    const last = at + 1 === kept.length
    if (last && !closed) break
    const b = last ? (kept[0] ?? 0) : (kept[at + 1] ?? 0)
    for (let k = (a + 1) % count; k !== b; k = (k + 1) % count) {
      worst = Math.max(worst, chordDistance(xy, k, a, b))
    }
  }
  return worst
}

export function simplifyStroke(xy: Float64Array, closed: boolean, tolerance: number): number[] {
  const count = xy.length / 2
  const all = Array.from({ length: count }, (_, k) => k)
  if (count <= (closed ? 3 : 2)) return all
  const steps = new Int32Array(count)
  const areas = effectiveAreas(xy, Uint32Array.of(count), closed, steps)
  const order: number[] = []
  for (let k = 0; k < count; k++) if (Number.isFinite(areas[k])) order.push(k)
  order.sort((a, b) => (areas[a] ?? 0) - (areas[b] ?? 0) || (steps[a] ?? 0) - (steps[b] ?? 0))
  const rank = new Int32Array(count).fill(count)
  order.forEach((k, at) => {
    rank[k] = at
  })
  let low = 0
  let high = order.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (strayOf(xy, keptAfter(rank, middle), closed) <= tolerance) low = middle
    else high = middle - 1
  }
  return keptAfter(rank, low)
}
