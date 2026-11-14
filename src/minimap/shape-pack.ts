import { noColor } from '../core/columns'
import { type ShapeGeometryData, shapeKinds } from '../core/shape-engine'
import type { ShapeStore } from '../core/shape-store'
import { type Sight, shapeShown } from '../core/visibility'
import type { RasterShapes } from './shape-raster'

export interface ShapeArea {
  readonly width: number
  readonly height: number
  readonly maxPoints: number
}

interface Origin {
  readonly originX: number
  readonly originY: number
}

const fineError = 0.5
const tinyShape = 3
const pixelsPerSegment = 4
const leastSegments = 8
const mostSegments = 64
const boxPoints = 4
const pixelStep = 1

class PointSink {
  points: Float32Array
  rings: Uint32Array
  pointCount = 0
  ringCount = 0

  constructor(points: number, rings: number) {
    this.points = new Float32Array(points * 2)
    this.rings = new Uint32Array(rings)
  }

  point(x: number, y: number): void {
    if (this.pointCount * 2 >= this.points.length) {
      const next = new Float32Array(Math.max(64, this.points.length * 2))
      next.set(this.points)
      this.points = next
    }
    this.points[this.pointCount * 2] = x
    this.points[this.pointCount * 2 + 1] = y
    this.pointCount++
  }

  close(): void {
    if (this.ringCount >= this.rings.length) {
      const next = new Uint32Array(Math.max(16, this.rings.length * 2))
      next.set(this.rings)
      this.rings = next
    }
    this.rings[this.ringCount++] = this.pointCount
  }
}

function scaleOf(store: ShapeStore, area: ShapeArea): number {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let index = 0; index < store.capacity; index++) {
    const data = store.geometry[index]
    if (store.alive[index] !== 1 || !data || store.pinned(index)) continue
    if (data.minX < minX) minX = data.minX
    if (data.minY < minY) minY = data.minY
    if (data.maxX > maxX) maxX = data.maxX
    if (data.maxY > maxY) maxY = data.maxY
  }
  const width = maxX - minX
  const height = maxY - minY
  if (!(width > 0) && !(height > 0)) return Number.POSITIVE_INFINITY
  return Math.min(
    width > 0 ? area.width / width : Number.POSITIVE_INFINITY,
    height > 0 ? area.height / height : Number.POSITIVE_INFINITY,
  )
}

function arcSegments(radius: number, scale: number, turn: number): number {
  const segments = Math.ceil((radius * scale * Math.PI * 2 * turn) / pixelsPerSegment)
  return Math.min(mostSegments, Math.max(Math.ceil(leastSegments * turn), segments))
}

function writeCircle(sink: PointSink, x: number, y: number, radius: number, scale: number): void {
  const segments = arcSegments(radius, scale, 1)
  for (let k = 0; k < segments; k++) {
    const angle = (k / segments) * Math.PI * 2
    sink.point(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
  }
  sink.close()
}

function writeRectangle(
  sink: PointSink,
  round: Float64Array,
  ox: number,
  oy: number,
  scale: number,
): void {
  const x = (round[0] ?? 0) - ox
  const y = (round[1] ?? 0) - oy
  const halfWidth = round[2] ?? 0
  const halfHeight = round[3] ?? 0
  const corner = Math.min(round[4] ?? 0, halfWidth, halfHeight)
  if (corner * scale < 1) {
    sink.point(x - halfWidth, y - halfHeight)
    sink.point(x + halfWidth, y - halfHeight)
    sink.point(x + halfWidth, y + halfHeight)
    sink.point(x - halfWidth, y + halfHeight)
    sink.close()
    return
  }
  const steps = arcSegments(corner, scale, 0.25)
  const corners = [
    [x + halfWidth - corner, y - halfHeight + corner, -Math.PI / 2],
    [x + halfWidth - corner, y + halfHeight - corner, 0],
    [x - halfWidth + corner, y + halfHeight - corner, Math.PI / 2],
    [x - halfWidth + corner, y - halfHeight + corner, Math.PI],
  ] as const
  for (const [cx, cy, from] of corners) {
    for (let k = 0; k <= steps; k++) {
      const angle = from + (k / steps) * (Math.PI / 2)
      sink.point(cx + Math.cos(angle) * corner, cy + Math.sin(angle) * corner)
    }
  }
  sink.close()
}

function writeBox(sink: PointSink, data: ShapeGeometryData, ox: number, oy: number): void {
  sink.point(data.minX - ox, data.minY - oy)
  sink.point(data.maxX - ox, data.minY - oy)
  sink.point(data.maxX - ox, data.maxY - oy)
  sink.point(data.minX - ox, data.maxY - oy)
  sink.close()
}

function writeRings(
  sink: PointSink,
  points: Float64Array,
  rings: Uint32Array,
  ox: number,
  oy: number,
  step: number,
  line: boolean,
): void {
  const least = line ? 2 : 3
  let start = 0
  for (const end of rings) {
    const first = sink.pointCount
    let lastX = Number.NaN
    let lastY = Number.NaN
    for (let k = start; k < end; k++) {
      const x = (points[k * 2] ?? 0) - ox
      const y = (points[k * 2 + 1] ?? 0) - oy
      if (k + 1 < end && Math.abs(x - lastX) < step && Math.abs(y - lastY) < step) continue
      sink.point(x, y)
      lastX = x
      lastY = y
    }
    if (sink.pointCount - first < least) sink.pointCount = first
    else sink.close()
    start = end
  }
}

function levelOf(
  data: ShapeGeometryData,
  scale: number,
  coarsest: boolean,
): { readonly points: Float64Array; readonly rings: Uint32Array } {
  let chosen: { readonly points: Float64Array; readonly rings: Uint32Array } = data
  for (const level of data.levels ?? []) {
    if (!coarsest && level.error * scale > fineError) break
    chosen = level
  }
  return chosen
}

function pointsOf(data: ShapeGeometryData, scale: number, coarsest: boolean): number {
  if (data.round) return mostSegments * 2
  return levelOf(data, scale, coarsest).points.length / 2
}

function tiny(data: ShapeGeometryData, scale: number): boolean {
  return Math.max(data.maxX - data.minX, data.maxY - data.minY) * scale < tinyShape
}

export function packShapes(
  store: ShapeStore,
  origin: Origin,
  sight: Sight,
  area: ShapeArea,
): RasterShapes | null {
  if (!store.any || area.maxPoints <= 0) return null
  const order = store.drawOrder()
  const scale = scaleOf(store, area)
  let wanted = 0
  for (const index of order) {
    const data = store.geometry[index]
    if (!data || data.invalid) continue
    wanted += tiny(data, scale) ? boxPoints : pointsOf(data, scale, false)
  }
  const coarsest = wanted > area.maxPoints
  const count = order.length
  const boxes = new Float32Array(count * 4)
  const node = new Int32Array(count)
  const shown = new Uint8Array(count)
  const fill = new Uint32Array(count)
  const stroke = new Uint32Array(count)
  const opacity = new Float32Array(count)
  const firstRing = new Uint32Array(count + 1)
  const closed = new Uint8Array(count)
  const sink = new PointSink(Math.min(wanted, area.maxPoints) + count * boxPoints, count + 16)
  let at = 0
  for (const index of order) {
    const data = store.geometry[index]
    if (!data || data.invalid || store.alive[index] !== 1) continue
    const pin = store.pinNode?.[index] ?? -1
    if (pin < -1) continue
    const ox = pin >= 0 ? 0 : origin.originX
    const oy = pin >= 0 ? 0 : origin.originY
    boxes[at * 4] = data.minX - ox
    boxes[at * 4 + 1] = data.minY - oy
    boxes[at * 4 + 2] = data.maxX - ox
    boxes[at * 4 + 3] = data.maxY - oy
    node[at] = pin
    shown[at] = shapeShown(store, index, sight) ? 1 : 0
    const line = data.kind === shapeKinds.line
    fill[at] = line ? noColor : (store.fill[index] ?? noColor)
    stroke[at] = store.stroke[index] ?? noColor
    opacity[at] = store.opacity[index] ?? 1
    closed[at] = data.closed ? 1 : 0
    firstRing[at] = sink.ringCount
    const round = data.round
    if (shown[at] === 1) {
      const budget = sink.pointCount < area.maxPoints
      if (!budget || (!line && tiny(data, scale))) writeBox(sink, data, ox, oy)
      else if (round && data.kind === shapeKinds.circle) {
        const x = (round[0] ?? 0) - ox
        const y = (round[1] ?? 0) - oy
        writeCircle(sink, x, y, round[2] ?? 0, scale)
        if ((round[3] ?? 0) > 0) writeCircle(sink, x, y, round[3] ?? 0, scale)
      } else if (round) writeRectangle(sink, round, ox, oy, scale)
      else {
        const level = levelOf(data, scale, coarsest)
        writeRings(sink, level.points, level.rings, ox, oy, pixelStep / scale, line)
      }
    }
    at++
  }
  firstRing[at] = sink.ringCount
  return {
    count: at,
    boxes,
    node,
    shown,
    fill,
    stroke,
    opacity,
    firstRing: firstRing.slice(0, at + 1),
    rings: sink.rings.slice(0, sink.ringCount),
    closed,
    points: sink.points.slice(0, sink.pointCount * 2),
  }
}
