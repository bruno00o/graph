import { describe, expect, it } from 'vitest'
import type { ShapeGeometryData } from '../core/shape-engine'
import { readShape } from './read'
import { onSphere, subdivide } from './subdivide'

function read(value: unknown): ShapeGeometryData {
  const shape = readShape(value)
  if (!shape) throw new Error('no shape')
  return shape
}

function area(shape: ShapeGeometryData): number {
  const { points, triangles } = shape
  let sum = 0
  for (let k = 0; k < triangles.length; k += 3) {
    const a = (triangles[k] ?? 0) * 2
    const b = (triangles[k + 1] ?? 0) * 2
    const c = (triangles[k + 2] ?? 0) * 2
    const ax = points[a] ?? 0
    const ay = points[a + 1] ?? 0
    sum += Math.abs(
      ((points[b] ?? 0) - ax) * ((points[c + 1] ?? 0) - ay) -
        ((points[b + 1] ?? 0) - ay) * ((points[c] ?? 0) - ax),
    )
  }
  return sum / 2
}

function longestEdge(shape: ShapeGeometryData): number {
  const { points, triangles } = shape
  let longest = 0
  const length = (u: number, v: number) =>
    Math.hypot(
      (points[u * 2] ?? 0) - (points[v * 2] ?? 0),
      (points[u * 2 + 1] ?? 0) - (points[v * 2 + 1] ?? 0),
    )
  for (let k = 0; k < triangles.length; k += 3) {
    const a = triangles[k] ?? 0
    const b = triangles[k + 1] ?? 0
    const c = triangles[k + 2] ?? 0
    longest = Math.max(longest, length(a, b), length(b, c), length(c, a))
  }
  return longest
}

function longestSegment(shape: ShapeGeometryData): number {
  const { points, rings, closed } = shape
  let longest = 0
  let start = 0
  for (const end of rings) {
    for (let k = start; k < end; k++) {
      const next = k + 1 < end ? k + 1 : closed ? start : -1
      if (next < 0) continue
      longest = Math.max(
        longest,
        Math.hypot(
          (points[k * 2] ?? 0) - (points[next * 2] ?? 0),
          (points[k * 2 + 1] ?? 0) - (points[next * 2 + 1] ?? 0),
        ),
      )
    }
    start = end
  }
  return longest
}

function key(x: number, y: number): string {
  return `${x.toFixed(9)},${y.toFixed(9)}`
}

function edgeUses(shape: ShapeGeometryData): Map<string, number> {
  const { points, triangles } = shape
  const uses = new Map<string, number>()
  const at = (v: number) => key(points[v * 2] ?? 0, points[v * 2 + 1] ?? 0)
  for (let k = 0; k < triangles.length; k += 3) {
    const corners = [triangles[k] ?? 0, triangles[k + 1] ?? 0, triangles[k + 2] ?? 0]
    for (let e = 0; e < 3; e++) {
      const a = at(corners[e] ?? 0)
      const b = at(corners[(e + 1) % 3] ?? 0)
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`
      uses.set(edge, (uses.get(edge) ?? 0) + 1)
    }
  }
  return uses
}

function boundaryOf(shape: ShapeGeometryData): Set<string> {
  const { points, rings } = shape
  const edges = new Set<string>()
  let start = 0
  for (const end of rings) {
    for (let k = start; k < end; k++) {
      const next = k + 1 < end ? k + 1 : start
      const a = key(points[k * 2] ?? 0, points[k * 2 + 1] ?? 0)
      const b = key(points[next * 2] ?? 0, points[next * 2 + 1] ?? 0)
      edges.add(a < b ? `${a}|${b}` : `${b}|${a}`)
    }
    start = end
  }
  return edges
}

function random(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

function blob(seed: number, count: number, size: number): number[][] {
  const next = random(seed)
  return Array.from({ length: count }, (_, k) => {
    const angle = (k / count) * Math.PI * 2
    const reach = size * (0.5 + next() * 0.5)
    return [Math.cos(angle) * reach + 100, Math.sin(angle) * reach + 100]
  })
}

describe('subdivide', () => {
  it('leaves shapes smaller than the step as they are', () => {
    const small = read({ rings: [blob(1, 12, 3)] })
    expect(subdivide(small, 8)).toBe(small)
    const round = read({ center: { x: 0, y: 0 }, radius: 100 })
    expect(subdivide(round, 8)).toBe(round)
  })

  it('splits every triangle edge down to the step, and keeps the area', () => {
    const large = read({
      rings: [
        [
          [0, 0],
          [200, 0],
          [200, 120],
          [0, 120],
        ],
        [
          [40, 40],
          [80, 40],
          [80, 80],
          [40, 80],
        ],
      ],
    })
    const fine = subdivide(large, 8)
    expect(longestEdge(fine)).toBeLessThanOrEqual(8)
    expect(area(fine)).toBeCloseTo(area(large), 6)
    expect(fine.triangles.length).toBeGreaterThan(large.triangles.length)
    expect([fine.minX, fine.minY, fine.maxX, fine.maxY]).toEqual([0, 0, 200, 120])
  })

  it('keeps the mesh conforming: inner edges shared by two triangles, outline edges by one', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const shape = read({ rings: [blob(seed, 7 + (seed % 13), 60 + seed * 4)] })
      const fine = subdivide(shape, 8)
      expect(longestEdge(fine)).toBeLessThanOrEqual(8)
      expect(area(fine)).toBeCloseTo(area(shape), 4)
      const outline = boundaryOf(fine)
      for (const [edge, uses] of edgeUses(fine)) {
        expect(uses).toBe(outline.has(edge) ? 1 : 2)
      }
    }
  })

  it('splits the outline the way the triangles split it, so strokes meet fills', () => {
    const shape = read({ rings: [blob(7, 9, 90)] })
    const fine = subdivide(shape, 8)
    expect(longestSegment(fine)).toBeLessThanOrEqual(8)
    const outline = boundaryOf(fine)
    const uses = edgeUses(fine)
    for (const edge of outline) expect(uses.get(edge)).toBe(1)
    expect(fine.rings.length).toBe(shape.rings.length)
  })

  it('splits lines into segments no longer than the step', () => {
    const line = read({
      points: [
        [0, 0],
        [50, 0],
        [50, 3],
      ],
    })
    const fine = subdivide(line, 8)
    expect(longestSegment(fine)).toBeLessThanOrEqual(8)
    expect(fine.points[0]).toBe(0)
    expect(fine.points[fine.points.length - 2]).toBe(50)
    expect(fine.points[fine.points.length - 1]).toBe(3)
    expect(fine.rings[0]).toBe(fine.points.length / 2)
  })

  it('follows the sphere for degrees, once per geometry', () => {
    const zone = read({
      type: 'Polygon',
      coordinates: [
        [
          [-60, -30],
          [60, -30],
          [60, 50],
          [-60, 50],
          [-60, -30],
        ],
      ],
    })
    const fine = onSphere(zone)
    expect(onSphere(zone)).toBe(fine)
    expect(fine.geo).toBe(true)
    expect(longestEdge(fine)).toBeLessThanOrEqual(8)
    expect(area(fine)).toBeCloseTo(area(zone), 4)
  })
})
