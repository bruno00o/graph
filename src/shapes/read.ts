import { projectLatitude, projectLongitude } from '../core/geo'
import type { InvalidShapeReason } from '../core/issues'
import { emptyShape, type ShapeGeometryData, shapeKinds } from '../core/shape-engine'
import { ringArea, triangleArea, triangulate } from './triangulate'

const earthRadius = 6_371_008.8
const circleSteps = 128
const degrees = Math.PI / 180
const areaTolerance = 1e-7

interface Field {
  readonly x?: unknown
  readonly y?: unknown
  readonly longitude?: unknown
  readonly latitude?: unknown
}

class Builder {
  xs: number[] = []
  rings: number[] = []
  triangles: number[] = []
  invalid: InvalidShapeReason | null = null
  #ringStart = 0
  #longitude = Number.NaN

  get count(): number {
    return this.xs.length / 2
  }

  begin(): void {
    this.#ringStart = this.count
    this.#longitude = Number.NaN
  }

  push(x: number, y: number): void {
    const xs = this.xs
    const n = xs.length
    if (n / 2 > this.#ringStart && xs[n - 2] === x && xs[n - 1] === y) return
    xs.push(x, y)
  }

  pushPlace(longitude: number, latitude: number): void {
    const known = this.#longitude
    const lon = Number.isNaN(known)
      ? longitude
      : longitude - 360 * Math.round((longitude - known) / 360)
    this.#longitude = lon
    this.push(projectLongitude(lon), projectLatitude(latitude))
  }

  pushPoint(point: unknown): void {
    if (typeof point !== 'object' || point === null) return
    let x: unknown
    let y: unknown
    if (Array.isArray(point)) {
      x = point[0]
      y = point[1]
    } else {
      const field = point as Field
      if (field.longitude !== undefined || field.latitude !== undefined) {
        if (finite(field.longitude) && finite(field.latitude)) {
          this.pushPlace(field.longitude, field.latitude)
        }
        return
      }
      x = field.x
      y = field.y
    }
    if (finite(x) && finite(y)) this.push(x, y)
  }

  pushPosition(position: unknown): void {
    if (!Array.isArray(position)) return
    const longitude: unknown = position[0]
    const latitude: unknown = position[1]
    if (finite(longitude) && finite(latitude)) this.pushPlace(longitude, latitude)
  }

  end(minimum: number, closed: boolean): boolean {
    const start = this.#ringStart
    const xs = this.xs
    if (closed) {
      while (
        this.count - start > 1 &&
        xs[xs.length - 2] === xs[start * 2] &&
        xs[xs.length - 1] === xs[start * 2 + 1]
      ) {
        xs.length -= 2
      }
    }
    if (this.count - start < minimum) {
      xs.length = start * 2
      return false
    }
    this.rings.push(this.count)
    return true
  }
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function iterable(value: unknown): value is Iterable<unknown> {
  return typeof value === 'object' && value !== null && Symbol.iterator in value
}

function reverseRing(points: Float64Array, from: number, to: number): void {
  for (let a = from, b = to - 1; a < b; a++, b--) {
    const ax = points[a * 2] ?? 0
    const ay = points[a * 2 + 1] ?? 0
    points[a * 2] = points[b * 2] ?? 0
    points[a * 2 + 1] = points[b * 2 + 1] ?? 0
    points[b * 2] = ax
    points[b * 2 + 1] = ay
  }
}

function finishPolygon(builder: Builder, firstRing: number): void {
  const rings = builder.rings
  if (rings.length <= firstRing) return
  const first = firstRing === 0 ? 0 : (rings[firstRing - 1] ?? 0)
  const last = rings[rings.length - 1] ?? first
  const points = new Float64Array(builder.xs.slice(first * 2, last * 2))
  const ends = rings.slice(firstRing).map((end) => end - first)
  let expected = 0
  let start = 0
  for (let ring = 0; ring < ends.length; ring++) {
    const end = ends[ring] ?? start
    const area = ringArea(points, start, end)
    const outer = ring === 0
    if (area > 0 !== outer && area !== 0) reverseRing(points, start, end)
    expected += outer ? Math.abs(area) : -Math.abs(area)
    start = end
  }
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let k = 0; k < points.length; k += 2) {
    minX = Math.min(minX, points[k] ?? 0)
    minY = Math.min(minY, points[k + 1] ?? 0)
    maxX = Math.max(maxX, points[k] ?? 0)
    maxY = Math.max(maxY, points[k + 1] ?? 0)
  }
  const box = (maxX - minX) * (maxY - minY)
  if (!(box > 0) || ringArea(points, 0, ends[0] ?? 0) === 0) {
    builder.xs.length = first * 2
    rings.length = firstRing
    if (box > 0) builder.invalid = 'self-intersecting'
    return
  }
  for (let k = 0; k < points.length; k++) builder.xs[first * 2 + k] = points[k] ?? 0
  const result = triangulate(points, 0, ends)
  for (let k = 0; k < result.count; k++) builder.triangles.push((result.indices[k] ?? 0) + first)
  const drawn = triangleArea(points, result.indices, result.count, minX, minY)
  if (Math.abs(drawn - expected) > areaTolerance * box) builder.invalid = 'self-intersecting'
}

function readRings(builder: Builder, rings: unknown, positions: boolean): void {
  if (!iterable(rings)) return
  const firstRing = builder.rings.length
  let outer = true
  for (const ring of rings) {
    if (!iterable(ring)) {
      if (outer) return
      continue
    }
    builder.begin()
    for (const point of ring) {
      if (positions) builder.pushPosition(point)
      else builder.pushPoint(point)
    }
    const kept = builder.end(3, true)
    if (outer && !kept) return
    outer = false
  }
  finishPolygon(builder, firstRing)
}

function readLine(builder: Builder, points: unknown, positions: boolean, closed: boolean): void {
  if (!iterable(points)) return
  builder.begin()
  for (const point of points) {
    if (positions) builder.pushPosition(point)
    else builder.pushPoint(point)
  }
  builder.end(2, closed)
}

function place(point: unknown): { longitude: number; latitude: number } | null {
  if (typeof point !== 'object' || point === null || Array.isArray(point)) return null
  const field = point as Field
  if (field.longitude === undefined && field.latitude === undefined) return null
  return finite(field.longitude) && finite(field.latitude)
    ? { longitude: field.longitude, latitude: field.latitude }
    : null
}

function worldPoint(point: unknown): readonly [number, number] | null {
  if (typeof point !== 'object' || point === null) return null
  const x: unknown = Array.isArray(point) ? point[0] : (point as Field).x
  const y: unknown = Array.isArray(point) ? point[1] : (point as Field).y
  return finite(x) && finite(y) ? [x, y] : null
}

function geodesicRing(builder: Builder, longitude: number, latitude: number, meters: number): void {
  const phi = latitude * degrees
  const lambda = longitude * degrees
  const delta = meters / earthRadius
  const sinPhi = Math.sin(phi)
  const cosPhi = Math.cos(phi)
  const sinDelta = Math.sin(delta)
  const cosDelta = Math.cos(delta)
  builder.begin()
  for (let step = 0; step < circleSteps; step++) {
    const bearing = (step / circleSteps) * 2 * Math.PI
    const sinLat = sinPhi * cosDelta + cosPhi * sinDelta * Math.cos(bearing)
    const lat = Math.asin(Math.max(-1, Math.min(1, sinLat)))
    const lon =
      lambda + Math.atan2(Math.sin(bearing) * sinDelta * cosPhi, cosDelta - sinPhi * Math.sin(lat))
    builder.pushPlace(lon / degrees, lat / degrees)
  }
  builder.end(3, true)
}

function readCircle(value: {
  readonly center?: unknown
  readonly radius?: unknown
  readonly inner?: unknown
}): ShapeGeometryData {
  const radius = value.radius
  const inner = finite(value.inner) && value.inner > 0 ? value.inner : 0
  if (!finite(radius) || radius <= 0 || inner >= radius) return emptyShape()
  const geo = place(value.center)
  if (geo) {
    const builder = new Builder()
    geodesicRing(builder, geo.longitude, geo.latitude, radius)
    if (inner > 0) geodesicRing(builder, geo.longitude, geo.latitude, inner)
    finishPolygon(builder, 0)
    return polygonOf(builder)
  }
  const center = worldPoint(value.center)
  if (!center) return emptyShape()
  const [x, y] = center
  return roundOf(shapeKinds.circle, x - radius, y - radius, x + radius, y + radius, [
    x,
    y,
    radius,
    inner,
  ])
}

function readRectangle(value: {
  readonly x?: unknown
  readonly y?: unknown
  readonly width?: unknown
  readonly height?: unknown
  readonly cornerRadius?: unknown
}): ShapeGeometryData {
  const { x, y, width, height } = value
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height)) return emptyShape()
  if (width <= 0 || height <= 0) return emptyShape()
  const corner = finite(value.cornerRadius)
    ? Math.max(0, Math.min(value.cornerRadius, width / 2, height / 2))
    : 0
  return roundOf(shapeKinds.rectangle, x, y, x + width, y + height, [
    x + width / 2,
    y + height / 2,
    width / 2,
    height / 2,
    corner,
  ])
}

function roundOf(
  kind: typeof shapeKinds.circle | typeof shapeKinds.rectangle,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  round: readonly number[],
): ShapeGeometryData {
  return {
    kind,
    points: new Float64Array(0),
    rings: new Uint32Array(0),
    closed: true,
    triangles: new Uint32Array(0),
    minX,
    minY,
    maxX,
    maxY,
    round: Float64Array.from(round),
    invalid: null,
  }
}

function finish(builder: Builder, kind: 0 | 1, closed: boolean): ShapeGeometryData {
  if (builder.rings.length === 0) {
    const empty = emptyShape()
    return builder.invalid ? { ...empty, invalid: builder.invalid } : empty
  }
  const points = new Float64Array(builder.xs)
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let k = 0; k < points.length; k += 2) {
    const x = points[k] ?? 0
    const y = points[k + 1] ?? 0
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return {
    kind,
    points,
    rings: new Uint32Array(builder.rings),
    closed,
    triangles: new Uint32Array(builder.triangles),
    minX,
    minY,
    maxX,
    maxY,
    round: null,
    invalid: builder.invalid,
  }
}

function polygonOf(builder: Builder): ShapeGeometryData {
  return finish(builder, shapeKinds.polygon, true)
}

interface GeometryFields {
  readonly type?: unknown
  readonly coordinates?: unknown
  readonly rings?: unknown
  readonly points?: unknown
  readonly closed?: unknown
  readonly center?: unknown
  readonly radius?: unknown
  readonly inner?: unknown
  readonly x?: unknown
  readonly y?: unknown
  readonly width?: unknown
  readonly height?: unknown
  readonly cornerRadius?: unknown
}

export function readShape(value: unknown): ShapeGeometryData | null {
  if (value === null) return null
  if (typeof value !== 'object') return emptyShape()
  const fields = value as GeometryFields
  const builder = new Builder()
  if (typeof fields.type === 'string' && fields.coordinates !== undefined) {
    const coordinates = fields.coordinates
    switch (fields.type) {
      case 'Polygon':
        readRings(builder, coordinates, true)
        return polygonOf(builder)
      case 'MultiPolygon':
        if (iterable(coordinates)) {
          for (const polygon of coordinates) readRings(builder, polygon, true)
        }
        return polygonOf(builder)
      case 'LineString':
        readLine(builder, coordinates, true, false)
        return finish(builder, shapeKinds.line, false)
      case 'MultiLineString':
        if (iterable(coordinates)) {
          for (const line of coordinates) readLine(builder, line, true, false)
        }
        return finish(builder, shapeKinds.line, false)
      default:
        return emptyShape()
    }
  }
  if (fields.rings !== undefined) {
    readRings(builder, fields.rings, false)
    return polygonOf(builder)
  }
  if (fields.points !== undefined) {
    const closed = fields.closed === true
    readLine(builder, fields.points, false, closed)
    const kept = builder.rings.length > 0
    const loop = closed && kept && (builder.rings[0] ?? 0) >= 3
    return finish(builder, shapeKinds.line, loop)
  }
  if (fields.center !== undefined && fields.radius !== undefined) return readCircle(fields)
  if (fields.width !== undefined && fields.height !== undefined) return readRectangle(fields)
  return emptyShape()
}
