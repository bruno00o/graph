import { noColor } from '../core/columns'

export interface RasterShapes {
  readonly count: number
  readonly boxes: Float32Array
  readonly node: Int32Array
  readonly shown: Uint8Array
  readonly fill: Uint32Array
  readonly stroke: Uint32Array
  readonly opacity: Float32Array
  readonly firstRing: Uint32Array
  readonly rings: Uint32Array
  readonly closed: Uint8Array
  readonly points: Float32Array
}

export interface ShapeCanvas {
  readonly width: number
  readonly height: number
  span(y: number, from: number, to: number, color: number, alpha: number): void
  line(x0: number, y0: number, x1: number, y1: number, color: number, alpha: number): void
}

export interface ShapeFit {
  readonly minX: number
  readonly minY: number
  readonly scale: number
  readonly offsetX: number
  readonly offsetY: number
}

export const fillAlpha = 0.35
export const lineAlpha = 0.5

let xs = new Float64Array(256)
let ys = new Float64Array(256)
let counts = new Int32Array(256)
let crossings = new Float64Array(1024)

function room(points: number): void {
  if (xs.length >= points) return
  const length = Math.max(points, xs.length * 2)
  xs = new Float64Array(length)
  ys = new Float64Array(length)
}

function sortRow(from: number, to: number): void {
  for (let i = from + 1; i < to; i++) {
    const value = crossings[i] ?? 0
    let j = i - 1
    while (j >= from && (crossings[j] ?? 0) > value) {
      crossings[j + 1] = crossings[j] ?? 0
      j--
    }
    crossings[j + 1] = value
  }
}

export function fillRings(
  canvas: ShapeCanvas,
  ends: ArrayLike<number>,
  firstRing: number,
  lastRing: number,
  start: number,
  color: number,
  alpha: number,
): void {
  const end = ends[lastRing - 1] ?? start
  const pointCount = end - start
  if (pointCount < 3) return
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  let left = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  for (let k = 0; k < pointCount; k++) {
    const x = xs[k] ?? 0
    const y = ys[k] ?? 0
    if (y < top) top = y
    if (y > bottom) bottom = y
    if (x < left) left = x
    if (x > right) right = x
  }
  const first = Math.max(0, Math.ceil(top - 0.5))
  const last = Math.min(canvas.height - 1, Math.ceil(bottom - 0.5) - 1)
  if (last < first) {
    if (bottom - top < 1 && right - left < 1 && right >= 0 && left < canvas.width) {
      const y = Math.floor((top + bottom) / 2)
      const x = Math.floor((left + right) / 2)
      if (y >= 0 && y < canvas.height) canvas.span(y, x, x + 1, color, alpha)
    }
    return
  }
  const rows = last - first + 1
  if (counts.length < rows + 1) counts = new Int32Array(Math.max(rows + 1, counts.length * 2))
  counts.fill(0, 0, rows + 1)
  let total = 0
  const visit = (write: boolean) => {
    let ringStart = 0
    for (let ring = firstRing; ring < lastRing; ring++) {
      const ringEnd = (ends[ring] ?? start) - start
      for (let k = ringStart; k < ringEnd; k++) {
        const next = k + 1 < ringEnd ? k + 1 : ringStart
        const y0 = ys[k] ?? 0
        const y1 = ys[next] ?? 0
        if (y0 === y1) continue
        const low = Math.min(y0, y1)
        const high = Math.max(y0, y1)
        const from = Math.max(first, Math.ceil(low - 0.5))
        const to = Math.min(last, Math.ceil(high - 0.5) - 1)
        if (to < from) continue
        if (!write) {
          for (let row = from; row <= to; row++)
            counts[row - first + 1] = (counts[row - first + 1] ?? 0) + 1
          total += to - from + 1
          continue
        }
        const x0 = xs[k] ?? 0
        const slope = ((xs[next] ?? 0) - x0) / (y1 - y0)
        for (let row = from; row <= to; row++) {
          const at = counts[row - first] ?? 0
          counts[row - first] = at + 1
          crossings[at] = x0 + (row + 0.5 - y0) * slope
        }
      }
      ringStart = ringEnd
    }
  }
  visit(false)
  if (total === 0) return
  if (crossings.length < total) crossings = new Float64Array(Math.max(total, crossings.length * 2))
  for (let row = 1; row <= rows; row++) counts[row] = (counts[row] ?? 0) + (counts[row - 1] ?? 0)
  visit(true)
  let from = 0
  for (let row = 0; row < rows; row++) {
    const to = counts[row] ?? from
    if (to - from > 1) {
      if (to - from > 32) crossings.subarray(from, to).sort()
      else sortRow(from, to)
      for (let at = from; at + 1 < to; at += 2) {
        const a = Math.round(crossings[at] ?? 0)
        const b = Math.round(crossings[at + 1] ?? 0)
        if (b > a) canvas.span(first + row, a, b, color, alpha)
      }
    }
    from = to
  }
}

function strokeRings(
  canvas: ShapeCanvas,
  ends: ArrayLike<number>,
  firstRing: number,
  lastRing: number,
  start: number,
  closed: boolean,
  color: number,
  alpha: number,
): void {
  let ringStart = 0
  for (let ring = firstRing; ring < lastRing; ring++) {
    const ringEnd = (ends[ring] ?? start) - start
    for (let k = ringStart; k + 1 < ringEnd; k++) {
      canvas.line(xs[k] ?? 0, ys[k] ?? 0, xs[k + 1] ?? 0, ys[k + 1] ?? 0, color, alpha)
    }
    if (closed && ringEnd - ringStart > 2) {
      const k = ringEnd - 1
      canvas.line(xs[k] ?? 0, ys[k] ?? 0, xs[ringStart] ?? 0, ys[ringStart] ?? 0, color, alpha)
    }
    ringStart = ringEnd
  }
}

export function drawShapes(
  canvas: ShapeCanvas,
  shapes: RasterShapes,
  xy: Float32Array,
  nodesAlive: Uint8Array,
  colors: Uint32Array,
  fit: ShapeFit,
): void {
  const { minX, minY, scale, offsetX, offsetY } = fit
  const { firstRing, rings, points } = shapes
  for (let shape = 0; shape < shapes.count; shape++) {
    if (shapes.shown[shape] !== 1) continue
    const ringFrom = firstRing[shape] ?? 0
    const ringTo = firstRing[shape + 1] ?? ringFrom
    if (ringTo <= ringFrom) continue
    let dx = 0
    let dy = 0
    const node = shapes.node[shape] ?? -1
    if (node >= 0) {
      if (nodesAlive[node] !== 1) continue
      dx = xy[node * 2] ?? 0
      dy = xy[node * 2 + 1] ?? 0
    }
    const start = ringFrom === 0 ? 0 : (rings[ringFrom - 1] ?? 0)
    const end = rings[ringTo - 1] ?? start
    room(end - start)
    for (let k = start; k < end; k++) {
      xs[k - start] = ((points[k * 2] ?? 0) + dx - minX) * scale + offsetX
      ys[k - start] = ((points[k * 2 + 1] ?? 0) + dy - minY) * scale + offsetY
    }
    const opacity = shapes.opacity[shape] ?? 1
    const fill = shapes.fill[shape] ?? noColor
    const fillColor = fill === noColor ? 0 : (colors[fill] ?? 0)
    if (fillColor >>> 24 !== 0) {
      fillRings(canvas, rings, ringFrom, ringTo, start, fillColor | 0xff000000, fillAlpha * opacity)
      continue
    }
    const stroke = shapes.stroke[shape] ?? noColor
    if (stroke === noColor) continue
    const color = colors[stroke] ?? 0
    const closed = shapes.closed[shape] === 1
    strokeRings(canvas, rings, ringFrom, ringTo, start, closed, color, lineAlpha * opacity)
  }
}

export function shapeBounds(
  shapes: RasterShapes,
  xy: Float32Array,
  nodesAlive: Uint8Array,
  into: { minX: number; minY: number; maxX: number; maxY: number },
): number {
  let counted = 0
  const boxes = shapes.boxes
  for (let shape = 0; shape < shapes.count; shape++) {
    let dx = 0
    let dy = 0
    const node = shapes.node[shape] ?? -1
    if (node >= 0) {
      if ((nodesAlive[node] ?? 0) === 0) continue
      dx = xy[node * 2] ?? 0
      dy = xy[node * 2 + 1] ?? 0
    }
    const at = shape * 4
    const x0 = (boxes[at] ?? 0) + dx
    const y0 = (boxes[at + 1] ?? 0) + dy
    const x1 = (boxes[at + 2] ?? 0) + dx
    const y1 = (boxes[at + 3] ?? 0) + dy
    if (x0 < into.minX) into.minX = x0
    if (y0 < into.minY) into.minY = y0
    if (x1 > into.maxX) into.maxX = x1
    if (y1 > into.maxY) into.maxY = y1
    counted++
  }
  return counted
}
