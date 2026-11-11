import { worldSize } from '../core/geo'
import type { ShapeGeometryData } from '../core/shape-engine'

const none: readonly number[] = []
const west: readonly number[] = [-worldSize]
const east: readonly number[] = [worldSize]
const both: readonly number[] = [-worldSize, worldSize]

export function wrapShifts(geometry: ShapeGeometryData): readonly number[] {
  if (!geometry.geo || geometry.round) return none
  const past = geometry.maxX > worldSize
  const before = geometry.minX < 0
  if (past && before) return both
  return past ? west : before ? east : none
}

const copied = new WeakMap<ShapeGeometryData, ShapeGeometryData>()

export function withCopies(geometry: ShapeGeometryData): ShapeGeometryData {
  const shifts = wrapShifts(geometry)
  if (shifts.length === 0) return geometry
  const known = copied.get(geometry)
  if (known) return known
  const { points, rings, triangles } = geometry
  const count = points.length / 2
  const copies = shifts.length + 1
  const xs = new Float64Array(points.length * copies)
  const ends = new Uint32Array(rings.length * copies)
  const corners = new Uint32Array(triangles.length * copies)
  for (let copy = 0; copy < copies; copy++) {
    const shift = copy === 0 ? 0 : (shifts[copy - 1] ?? 0)
    const base = copy * count
    for (let k = 0; k < count; k++) {
      xs[(base + k) * 2] = (points[k * 2] ?? 0) + shift
      xs[(base + k) * 2 + 1] = points[k * 2 + 1] ?? 0
    }
    for (let k = 0; k < rings.length; k++) ends[copy * rings.length + k] = base + (rings[k] ?? 0)
    for (let k = 0; k < triangles.length; k++) {
      corners[copy * triangles.length + k] = base + (triangles[k] ?? 0)
    }
  }
  const made: ShapeGeometryData = {
    ...geometry,
    points: xs,
    rings: ends,
    triangles: corners,
    minX: geometry.minX + Math.min(0, ...shifts),
    maxX: geometry.maxX + Math.max(0, ...shifts),
  }
  copied.set(geometry, made)
  return made
}
