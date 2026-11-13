import { simplifiedLevels } from './simplify'
import { ringArea, triangleArea, triangulate } from './triangulate'

const areaTolerance = 1e-7

export interface FillInput {
  readonly points: Float64Array
  readonly rings: Uint32Array
  readonly polygons: Uint32Array
  readonly polygon: boolean
  readonly closed: boolean
}

export interface FillLevel {
  readonly area: number
  readonly points: Float64Array
  readonly rings: Uint32Array
  readonly triangles: Uint32Array
}

export interface Filled {
  readonly triangles: Uint32Array
  readonly bad: boolean
  readonly levels: FillLevel[]
}

export interface FillJob {
  readonly id: number
  readonly shapes: readonly FillInput[]
}

export interface FillAnswer {
  readonly id: number
  readonly filled: readonly Filled[]
}

function cover(
  points: Float64Array,
  rings: Uint32Array,
  polygons: Uint32Array,
  map: Uint32Array | null,
  check: boolean,
): { triangles: Uint32Array; bad: boolean } {
  const parts: Uint32Array[] = []
  let total = 0
  let bad = false
  for (let p = 0; p < polygons.length; p++) {
    const firstRing = polygons[p] ?? 0
    const lastRing = p + 1 < polygons.length ? (polygons[p + 1] ?? 0) : rings.length
    const first = firstRing === 0 ? 0 : (rings[firstRing - 1] ?? 0)
    const ends: number[] = []
    for (let r = firstRing; r < lastRing; r++) ends.push(rings[r] ?? 0)
    const result = triangulate(points, first, ends)
    const part = result.indices.subarray(0, result.count)
    if (check) {
      let minX = Number.POSITIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      let maxY = Number.NEGATIVE_INFINITY
      const last = ends[ends.length - 1] ?? first
      for (let k = first; k < last; k++) {
        minX = Math.min(minX, points[k * 2] ?? 0)
        minY = Math.min(minY, points[k * 2 + 1] ?? 0)
        maxX = Math.max(maxX, points[k * 2] ?? 0)
        maxY = Math.max(maxY, points[k * 2 + 1] ?? 0)
      }
      let expected = 0
      let start = first
      ends.forEach((end, ring) => {
        const area = Math.abs(ringArea(points, start, end))
        expected += ring === 0 ? area : -area
        start = end
      })
      const drawn = triangleArea(points, part, part.length, minX, minY)
      if (Math.abs(drawn - expected) > areaTolerance * (maxX - minX) * (maxY - minY)) bad = true
    }
    parts.push(part)
    total += part.length
  }
  const triangles = new Uint32Array(total)
  let at = 0
  for (const part of parts) {
    if (map) for (let k = 0; k < part.length; k++) triangles[at + k] = map[part[k] ?? 0] ?? 0
    else triangles.set(part, at)
    at += part.length
  }
  return { triangles, bad }
}

export function fillShape(input: FillInput): Filled {
  const { points, rings, polygons, polygon, closed } = input
  const full = polygon
    ? cover(points, rings, polygons, null, true)
    : { triangles: new Uint32Array(0), bad: false }
  const levels = simplifiedLevels(points, rings, closed).map((level) => ({
    area: level.area,
    points: level.points,
    rings: level.rings,
    triangles: polygon
      ? cover(level.points, level.rings, polygons, level.kept, false).triangles
      : new Uint32Array(0),
  }))
  return { triangles: full.triangles, bad: full.bad, levels }
}

export function transfers(answer: FillAnswer): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = []
  for (const filled of answer.filled) {
    buffers.push(filled.triangles.buffer as ArrayBuffer)
    for (const level of filled.levels) {
      buffers.push(
        level.points.buffer as ArrayBuffer,
        level.rings.buffer as ArrayBuffer,
        level.triangles.buffer as ArrayBuffer,
      )
    }
  }
  return buffers
}
