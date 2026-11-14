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
  readonly error: number
  readonly points: Float64Array
  readonly rings: Uint32Array
  readonly triangles: Uint32Array
}

export interface Filled {
  readonly triangles: Uint32Array
  readonly bad: boolean
  readonly levels: FillLevel[]
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
    error: level.error,
    points: level.points,
    rings: level.rings,
    triangles: polygon
      ? cover(level.points, level.rings, polygons, level.kept, false).triangles
      : new Uint32Array(0),
  }))
  return { triangles: full.triangles, bad: full.bad, levels }
}

export interface PackedJob {
  readonly id: number
  readonly points: Float64Array
  readonly rings: Uint32Array
  readonly polygons: Uint32Array
  readonly shapes: Uint32Array
}

export interface PackedAnswer {
  readonly id: number
  readonly points: Float64Array
  readonly rings: Uint32Array
  readonly triangles: Uint32Array
  readonly entries: Float64Array
}

const jobStride = 7
const levelStride = 8

export function packJob(id: number, shapes: readonly FillInput[]): PackedJob {
  let points = 0
  let rings = 0
  let polygons = 0
  for (const shape of shapes) {
    points += shape.points.length
    rings += shape.rings.length
    polygons += shape.polygons.length
  }
  const job = {
    id,
    points: new Float64Array(points),
    rings: new Uint32Array(rings),
    polygons: new Uint32Array(polygons),
    shapes: new Uint32Array(shapes.length * jobStride),
  }
  points = 0
  rings = 0
  polygons = 0
  shapes.forEach((shape, at) => {
    job.points.set(shape.points, points)
    job.rings.set(shape.rings, rings)
    job.polygons.set(shape.polygons, polygons)
    job.shapes.set(
      [
        points,
        shape.points.length,
        rings,
        shape.rings.length,
        polygons,
        shape.polygons.length,
        (shape.polygon ? 1 : 0) | (shape.closed ? 2 : 0),
      ],
      at * jobStride,
    )
    points += shape.points.length
    rings += shape.rings.length
    polygons += shape.polygons.length
  })
  return job
}

export function jobTransfers(job: PackedJob): ArrayBuffer[] {
  return [job.points, job.rings, job.polygons, job.shapes].map(
    (array) => array.buffer as ArrayBuffer,
  )
}

export function unpackJob(job: PackedJob): FillInput[] {
  const inputs: FillInput[] = []
  const meta = job.shapes
  for (let at = 0; at < meta.length; at += jobStride) {
    const point = meta[at] ?? 0
    const ring = meta[at + 2] ?? 0
    const polygon = meta[at + 4] ?? 0
    const flags = meta[at + 6] ?? 0
    inputs.push({
      points: job.points.subarray(point, point + (meta[at + 1] ?? 0)),
      rings: job.rings.subarray(ring, ring + (meta[at + 3] ?? 0)),
      polygons: job.polygons.subarray(polygon, polygon + (meta[at + 5] ?? 0)),
      polygon: (flags & 1) !== 0,
      closed: (flags & 2) !== 0,
    })
  }
  return inputs
}

export function packAnswer(id: number, filled: readonly Filled[]): PackedAnswer {
  let points = 0
  let rings = 0
  let triangles = 0
  let entries = 0
  for (const shape of filled) {
    triangles += shape.triangles.length
    entries += 4 + shape.levels.length * levelStride
    for (const level of shape.levels) {
      points += level.points.length
      rings += level.rings.length
      triangles += level.triangles.length
    }
  }
  const answer = {
    id,
    points: new Float64Array(points),
    rings: new Uint32Array(rings),
    triangles: new Uint32Array(triangles),
    entries: new Float64Array(entries),
  }
  points = 0
  rings = 0
  triangles = 0
  entries = 0
  const put = (array: Uint32Array) => {
    answer.triangles.set(array, triangles)
    triangles += array.length
    return triangles - array.length
  }
  for (const shape of filled) {
    answer.entries.set(
      [shape.bad ? 1 : 0, put(shape.triangles), shape.triangles.length, shape.levels.length],
      entries,
    )
    entries += 4
    for (const level of shape.levels) {
      answer.points.set(level.points, points)
      answer.rings.set(level.rings, rings)
      answer.entries.set(
        [
          level.area,
          level.error,
          points,
          level.points.length,
          rings,
          level.rings.length,
          put(level.triangles),
          level.triangles.length,
        ],
        entries,
      )
      entries += levelStride
      points += level.points.length
      rings += level.rings.length
    }
  }
  return answer
}

export function answerTransfers(answer: PackedAnswer): ArrayBuffer[] {
  return [answer.points, answer.rings, answer.triangles, answer.entries].map(
    (array) => array.buffer as ArrayBuffer,
  )
}

export function unpackAnswer(answer: PackedAnswer): Filled[] {
  const filled: Filled[] = []
  const meta = answer.entries
  let at = 0
  while (at < meta.length) {
    const start = meta[at + 1] ?? 0
    const count = meta[at + 3] ?? 0
    const shape: Filled = {
      bad: meta[at] === 1,
      triangles: answer.triangles.subarray(start, start + (meta[at + 2] ?? 0)),
      levels: [],
    }
    at += 4
    for (let level = 0; level < count; level++, at += levelStride) {
      const point = meta[at + 2] ?? 0
      const ring = meta[at + 4] ?? 0
      const triangle = meta[at + 6] ?? 0
      shape.levels.push({
        area: meta[at] ?? 0,
        error: meta[at + 1] ?? 0,
        points: answer.points.subarray(point, point + (meta[at + 3] ?? 0)),
        rings: answer.rings.subarray(ring, ring + (meta[at + 5] ?? 0)),
        triangles: answer.triangles.subarray(triangle, triangle + (meta[at + 7] ?? 0)),
      })
    }
    filled.push(shape)
  }
  return filled
}
