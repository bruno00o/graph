import { describe, expect, it } from 'vitest'
import type { ShapeGeometryData } from '../core/shape-engine'
import type { ShapeGeometry } from '../types'
import { polygonCenter, shapeAnchor, signedDistance } from './anchor'
import { readShape } from './read'

function read(geometry: ShapeGeometry): ShapeGeometryData {
  const data = readShape(geometry)
  if (!data) throw new Error('unreadable geometry')
  return data
}

const square = (x: number, y: number, size: number): [number, number][] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
]

describe('shape label anchors', () => {
  it('centers circles and rectangles, and puts a ring label at the top of its band', () => {
    expect(shapeAnchor(read({ center: { x: 10, y: 20 }, radius: 5 }))).toEqual({ x: 10, y: 20 })
    expect(shapeAnchor(read({ x: 0, y: 0, width: 40, height: 10 }))).toEqual({ x: 20, y: 5 })
    expect(shapeAnchor(read({ center: { x: 0, y: 0 }, radius: 30, inner: 10 }))).toEqual({
      x: 0,
      y: -20,
    })
  })

  it('puts a line label in the middle of its longest segment', () => {
    const line = read({
      points: [
        [0, 0],
        [10, 0],
        [10, 100],
        [20, 100],
      ],
    })
    expect(shapeAnchor(line)).toEqual({ x: 10, y: 50 })
  })

  it('finds the center of a convex polygon', () => {
    const point = shapeAnchor(read({ rings: [square(0, 0, 100)] }))
    expect(point.x).toBeCloseTo(50, 0)
    expect(point.y).toBeCloseTo(50, 0)
  })

  it('stays inside a concave polygon whose centroid falls outside', () => {
    const shape = read({
      rings: [
        [
          [0, 0],
          [100, 0],
          [100, 20],
          [20, 20],
          [20, 80],
          [100, 80],
          [100, 100],
          [0, 100],
        ],
      ],
    })
    const point = shapeAnchor(shape)
    const distance = signedDistance(shape, point.x, point.y)
    expect(distance).toBeGreaterThan(9)
    expect(point.x).toBeLessThan(20)
  })

  it('keeps out of the holes', () => {
    const shape = read({ rings: [square(0, 0, 100), square(20, 20, 60)] })
    const point = shapeAnchor(shape)
    const distance = signedDistance(shape, point.x, point.y)
    const corner = (20 * Math.SQRT2) / (1 + Math.SQRT2)
    expect(distance).toBeGreaterThan(corner - 1)
    expect(distance).toBeLessThanOrEqual(corner + 1e-9)
  })

  it('finds the middle line of a thin polygon', () => {
    const shape = read({
      rings: [
        [
          [0, 0],
          [1000, 0],
          [1000, 2],
          [0, 2],
        ],
      ],
    })
    const point = polygonCenter(shape)
    expect(point.y).toBeCloseTo(1, 1)
    expect(point.x).toBeGreaterThan(0)
    expect(point.x).toBeLessThan(1000)
  })

  it('returns a finite point for degenerate rings without looping', () => {
    const flat: ShapeGeometryData = {
      kind: 0,
      points: Float64Array.from([0, 0, 10, 0, 20, 0]),
      rings: Uint32Array.from([3]),
      closed: true,
      triangles: new Uint32Array(0),
      minX: 0,
      minY: 0,
      maxX: 20,
      maxY: 0,
      round: null,
      invalid: null,
    }
    expect(polygonCenter(flat)).toEqual({ x: 10, y: 0 })
    const spike: ShapeGeometryData = {
      ...flat,
      points: Float64Array.from([0, 0, 10, 1e-12, 20, 0]),
      maxY: 1e-12,
    }
    const point = polygonCenter(spike)
    expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
    const far: ShapeGeometryData = {
      ...flat,
      points: Float64Array.from([1e12, 0, 1e12 + 1, 1e-9, 1e12 + 2, 0]),
      minX: 1e12,
      maxX: 1e12 + 2,
      maxY: 1e-9,
    }
    const away = polygonCenter(far)
    expect(away.x).toBeGreaterThanOrEqual(1e12)
    expect(away.x).toBeLessThanOrEqual(1e12 + 2)
  })

  it('bounds its work on outlines with many points', () => {
    const count = 20_000
    const rings = [
      Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2
        const radius = 100 + (index % 2) * 3
        return [Math.cos(angle) * radius, Math.sin(angle) * radius] as [number, number]
      }),
    ]
    const point = shapeAnchor(read({ rings }))
    expect(Math.hypot(point.x, point.y)).toBeLessThan(10)
  })
})
