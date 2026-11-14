import { projectLatitude, projectLongitude, worldSize, worldToGeo } from '../core/geo'
import type { ShapeGeometry } from '../types'

export const objectPoint = 0
export const pairPoint = 1
export const placePoint = 2
export const positionPoint = 3

export type PointForm = 0 | 1 | 2 | 3

export interface EditPoint {
  readonly x: number
  readonly y: number
  readonly source: unknown
  readonly form: PointForm
  readonly exact: boolean
}

export interface Part {
  readonly points: readonly EditPoint[]
  readonly close: EditPoint | null
  readonly group: number
}

export type PathForm =
  | 'rings'
  | 'points'
  | 'Polygon'
  | 'MultiPolygon'
  | 'LineString'
  | 'MultiLineString'

export interface PathOutline {
  readonly kind: 'path'
  readonly source: object
  readonly form: PathForm
  readonly closed: boolean
  readonly parts: readonly Part[]
}

export interface CircleOutline {
  readonly kind: 'circle'
  readonly source: object
  readonly center: EditPoint
  readonly radius: number
  readonly inner: number
}

export interface RectangleOutline {
  readonly kind: 'rectangle'
  readonly source: object
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type Outline = PathOutline | CircleOutline | RectangleOutline

export type Bounds = readonly [number, number, number, number]

const earthRadius = 6_371_008.8

interface Fields {
  readonly x?: unknown
  readonly y?: unknown
  readonly longitude?: unknown
  readonly latitude?: unknown
  readonly type?: unknown
  readonly coordinates?: unknown
  readonly rings?: unknown
  readonly points?: unknown
  readonly closed?: unknown
  readonly center?: unknown
  readonly radius?: unknown
  readonly inner?: unknown
  readonly width?: unknown
  readonly height?: unknown
  readonly bbox?: unknown
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function iterable(value: unknown): value is Iterable<unknown> {
  return typeof value === 'object' && value !== null && Symbol.iterator in value
}

class Reader {
  #anchor = Number.NaN
  #previous = Number.NaN

  begin(): void {
    this.#previous = Number.NaN
  }

  place(longitude: number, latitude: number, source: unknown, form: PointForm): EditPoint {
    const known = Number.isNaN(this.#previous) ? this.#anchor : this.#previous
    const lon = Number.isNaN(known)
      ? longitude
      : longitude - 360 * Math.round((longitude - known) / 360)
    if (Number.isNaN(this.#anchor)) this.#anchor = lon
    this.#previous = lon
    return { x: projectLongitude(lon), y: projectLatitude(latitude), source, form, exact: true }
  }

  point(value: unknown, positions: boolean): EditPoint | null {
    if (typeof value !== 'object' || value === null) return null
    if (Array.isArray(value)) {
      const [a, b] = value as unknown[]
      if (!finite(a) || !finite(b)) return null
      if (positions) return this.place(a, b, value, positionPoint)
      return { x: a, y: b, source: value, form: pairPoint, exact: true }
    }
    if (positions) return null
    const fields = value as Fields
    if (fields.longitude !== undefined || fields.latitude !== undefined) {
      const { longitude, latitude } = fields
      return finite(longitude) && finite(latitude)
        ? this.place(longitude, latitude, value, placePoint)
        : null
    }
    const { x, y } = fields
    return finite(x) && finite(y) ? { x, y, source: value, form: objectPoint, exact: true } : null
  }

  part(value: unknown, positions: boolean, closed: boolean, group: number): Part | null {
    if (!iterable(value)) return null
    this.begin()
    const points: EditPoint[] = []
    for (const entry of value) {
      const point = this.point(entry, positions)
      if (point) points.push(point)
    }
    const first = points[0]
    const last = points[points.length - 1]
    const repeat =
      closed && points.length > 1 && first !== undefined && last !== undefined && same(first, last)
    if (repeat) points.pop()
    if (points.length < (closed ? 3 : 2)) return null
    return { points, close: repeat ? (last ?? null) : null, group }
  }
}

function same(a: EditPoint, b: EditPoint): boolean {
  if (a.form !== b.form) return false
  if (a.form === pairPoint || a.form === positionPoint) {
    const [ax, ay] = a.source as readonly unknown[]
    const [bx, by] = b.source as readonly unknown[]
    return ax === bx && ay === by
  }
  const sa = a.source as Fields
  const sb = b.source as Fields
  if (a.form === placePoint) return sa.longitude === sb.longitude && sa.latitude === sb.latitude
  return sa.x === sb.x && sa.y === sb.y
}

function path(source: object, form: PathForm, closed: boolean, parts: Part[]): PathOutline | null {
  return parts.length > 0 ? { kind: 'path', source, form, closed, parts } : null
}

function rings(reader: Reader, value: unknown, positions: boolean, group: number, into: Part[]) {
  if (!iterable(value)) return
  for (const ring of value) {
    const part = reader.part(ring, positions, true, group)
    if (part) into.push(part)
  }
}

export function readEditable(value: unknown): Outline | null {
  if (typeof value !== 'object' || value === null) return null
  const fields = value as Fields
  const reader = new Reader()
  const parts: Part[] = []
  if (typeof fields.type === 'string' && fields.coordinates !== undefined) {
    const coordinates = fields.coordinates
    switch (fields.type) {
      case 'Polygon':
        rings(reader, coordinates, true, 0, parts)
        return path(value, 'Polygon', true, parts)
      case 'MultiPolygon':
        if (iterable(coordinates)) {
          let group = 0
          for (const polygon of coordinates) rings(reader, polygon, true, group++, parts)
        }
        return path(value, 'MultiPolygon', true, parts)
      case 'LineString': {
        const part = reader.part(coordinates, true, false, 0)
        return path(value, 'LineString', false, part ? [part] : parts)
      }
      case 'MultiLineString':
        if (iterable(coordinates)) {
          let group = 0
          for (const line of coordinates) {
            const part = reader.part(line, true, false, group++)
            if (part) parts.push(part)
          }
        }
        return path(value, 'MultiLineString', false, parts)
      default:
        return null
    }
  }
  if (fields.rings !== undefined) {
    rings(reader, fields.rings, false, 0, parts)
    return path(value, 'rings', true, parts)
  }
  if (fields.points !== undefined) {
    const closed = fields.closed === true
    const part = reader.part(fields.points, false, closed, 0)
    return path(value, 'points', closed, part ? [part] : parts)
  }
  if (fields.center !== undefined && fields.radius !== undefined) {
    const center = reader.point(fields.center, false)
    const radius = fields.radius
    const inner = finite(fields.inner) && fields.inner > 0 ? fields.inner : 0
    if (!center || !finite(radius) || radius <= 0 || inner >= radius) return null
    return { kind: 'circle', source: value, center, radius, inner }
  }
  const { x, y, width, height } = fields
  if (finite(x) && finite(y) && finite(width) && finite(height) && width > 0 && height > 0) {
    return { kind: 'rectangle', source: value, x, y, width, height }
  }
  return null
}

export function isGeo(point: EditPoint): boolean {
  return point.form === placePoint || point.form === positionPoint
}

export function metersToWorld(meters: number, y: number): number {
  const latitude = Math.atan(Math.sinh(Math.PI - (y / worldSize) * 2 * Math.PI))
  return (meters * worldSize) / (2 * Math.PI * earthRadius * Math.max(Math.cos(latitude), 1e-9))
}

function wrapped(longitude: number): number {
  return longitude > 180 || longitude < -180
    ? longitude - 360 * Math.round(longitude / 360)
    : longitude
}

function writePoint(point: EditPoint): unknown {
  if (point.exact) return point.source
  const source = point.source
  if (point.form === pairPoint || point.form === positionPoint) {
    const rest = Array.isArray(source) ? source.slice(2) : []
    if (point.form === pairPoint) return [point.x, point.y, ...rest]
    const place = worldToGeo(point)
    return [wrapped(place.longitude), place.latitude, ...rest]
  }
  const fields = typeof source === 'object' && source !== null ? source : {}
  if (point.form === placePoint) {
    const place = worldToGeo(point)
    return { ...fields, longitude: wrapped(place.longitude), latitude: place.latitude }
  }
  return { ...fields, x: point.x, y: point.y }
}

function writePart(part: Part): unknown[] {
  const written = part.points.map(writePoint)
  const head = part.points[0]
  if (part.close && head) written.push(head.exact ? part.close.source : writePoint(head))
  return written
}

function groups(parts: readonly Part[]): unknown[][] {
  const grouped: unknown[][] = []
  let current = -1
  for (const part of parts) {
    if (part.group !== current) {
      current = part.group
      grouped.push([])
    }
    grouped[grouped.length - 1]?.push(writePart(part))
  }
  return grouped
}

function withCoordinates(source: object, coordinates: unknown): ShapeGeometry {
  const { bbox: _, ...rest } = source as Fields
  return { ...rest, coordinates } as unknown as ShapeGeometry
}

export function writeEditable(outline: Outline): ShapeGeometry {
  const source = outline.source
  if (outline.kind === 'circle') {
    const inner = outline.inner > 0 ? { inner: outline.inner } : {}
    const center = writePoint(outline.center)
    return { ...source, center, radius: outline.radius, ...inner } as unknown as ShapeGeometry
  }
  if (outline.kind === 'rectangle') {
    const { x, y, width, height } = outline
    return { ...source, x, y, width, height } as unknown as ShapeGeometry
  }
  const parts = outline.parts
  switch (outline.form) {
    case 'rings':
      return { ...source, rings: parts.map(writePart) } as unknown as ShapeGeometry
    case 'points':
      return { ...source, points: parts[0] ? writePart(parts[0]) : [] } as unknown as ShapeGeometry
    case 'Polygon':
      return withCoordinates(source, parts.map(writePart))
    case 'MultiPolygon':
      return withCoordinates(source, groups(parts))
    case 'LineString':
      return withCoordinates(source, parts[0] ? writePart(parts[0]) : [])
    case 'MultiLineString':
      return withCoordinates(source, parts.map(writePart))
  }
}

function moved(point: EditPoint, x: number, y: number): EditPoint {
  if (x === point.x && y === point.y) return point
  return { x, y, source: point.source, form: point.form, exact: false }
}

export function mapOutline(
  outline: Outline,
  map: (x: number, y: number) => [number, number],
): Outline {
  const move = (point: EditPoint) => {
    const [x, y] = map(point.x, point.y)
    return moved(point, x, y)
  }
  switch (outline.kind) {
    case 'path':
      return {
        ...outline,
        parts: outline.parts.map((part) => ({ ...part, points: part.points.map(move) })),
      }
    case 'circle':
      return { ...outline, center: move(outline.center) }
    case 'rectangle': {
      const [x0, y0] = map(outline.x, outline.y)
      const [x1, y1] = map(outline.x + outline.width, outline.y + outline.height)
      return {
        ...outline,
        x: Math.min(x0, x1),
        y: Math.min(y0, y1),
        width: Math.abs(x1 - x0),
        height: Math.abs(y1 - y0),
      }
    }
  }
}

export function translateOutline(outline: Outline, dx: number, dy: number): Outline {
  if (dx === 0 && dy === 0) return outline
  return mapOutline(outline, (x, y) => [x + dx, y + dy])
}

export function scaleOutline(
  outline: Outline,
  ax: number,
  ay: number,
  sx: number,
  sy: number,
): Outline {
  const mapped = mapOutline(outline, (x, y) => [ax + (x - ax) * sx, ay + (y - ay) * sy])
  if (mapped.kind !== 'circle') return mapped
  const factor = Math.sqrt(Math.abs(sx * sy))
  return { ...mapped, radius: mapped.radius * factor, inner: mapped.inner * factor }
}

function withPart(outline: PathOutline, index: number, points: EditPoint[]): PathOutline {
  const parts = outline.parts.slice()
  const part = parts[index]
  if (part) parts[index] = { ...part, points }
  return { ...outline, parts }
}

export function moveVertex(
  outline: PathOutline,
  part: number,
  index: number,
  x: number,
  y: number,
): PathOutline {
  const points = outline.parts[part]?.points.slice()
  const point = points?.[index]
  if (!points || !point) return outline
  points[index] = moved(point, x, y)
  return withPart(outline, part, points)
}

export function insertVertex(
  outline: PathOutline,
  part: number,
  after: number,
  x: number,
  y: number,
): PathOutline {
  const points = outline.parts[part]?.points.slice()
  const neighbor = points?.[after]
  if (!points || !neighbor) return outline
  const source = Array.isArray(neighbor.source) ? [] : {}
  points.splice(after + 1, 0, { x, y, source, form: neighbor.form, exact: false })
  return withPart(outline, part, points)
}

export function removeVertex(outline: PathOutline, part: number, index: number): PathOutline {
  const points = outline.parts[part]?.points.slice()
  if (!points || points.length <= (outline.closed ? 3 : 2)) return outline
  points.splice(index, 1)
  return withPart(outline, part, points)
}

export function circleRadius(outline: CircleOutline): number {
  return isGeo(outline.center) ? metersToWorld(outline.radius, outline.center.y) : outline.radius
}

export function boundsOf(outline: Outline): Bounds {
  if (outline.kind === 'rectangle') {
    return [outline.x, outline.y, outline.x + outline.width, outline.y + outline.height]
  }
  if (outline.kind === 'circle') {
    const { x, y } = outline.center
    const radius = circleRadius(outline)
    return [x - radius, y - radius, x + radius, y + radius]
  }
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const part of outline.parts) {
    for (const { x, y } of part.points) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return [minX, minY, maxX, maxY]
}

export function geoOutline(outline: Outline): boolean {
  if (outline.kind === 'circle') return isGeo(outline.center)
  if (outline.kind === 'rectangle') return false
  const first = outline.parts[0]?.points[0]
  return first !== undefined && isGeo(first)
}
