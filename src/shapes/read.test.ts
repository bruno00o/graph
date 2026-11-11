import { describe, expect, it } from 'vitest'
import { projectLatitude, projectLongitude } from '../core/geo'
import { shapeKinds } from '../core/shape-engine'
import { readShape } from './read'

function read(value: unknown) {
  const shape = readShape(value)
  if (!shape) throw new Error('no shape')
  return shape
}

function pointsOf(value: unknown): number[][] {
  const points = read(value).points
  const out: number[][] = []
  for (let k = 0; k < points.length; k += 2) out.push([points[k] ?? 0, points[k + 1] ?? 0])
  return out
}

function area(value: unknown): number {
  const shape = read(value)
  let sum = 0
  const { points, triangles } = shape
  for (let k = 0; k < triangles.length; k += 3) {
    const a = (triangles[k] ?? 0) * 2
    const b = (triangles[k + 1] ?? 0) * 2
    const c = (triangles[k + 2] ?? 0) * 2
    const ax = points[a] ?? 0
    const ay = points[a + 1] ?? 0
    sum +=
      ((points[b] ?? 0) - ax) * ((points[c + 1] ?? 0) - ay) -
      ((points[b + 1] ?? 0) - ay) * ((points[c] ?? 0) - ax)
  }
  return Math.abs(sum) / 2
}

const square = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
]

describe('readShape', () => {
  it('reads rings of points in world units, with holes', () => {
    const shape = read({
      rings: [
        [...square, [0, 0]],
        [
          { x: 4, y: 4 },
          { x: 6, y: 4 },
          { x: 6, y: 6 },
          { x: 4, y: 6 },
        ],
      ],
    })
    expect(shape.kind).toBe(shapeKinds.polygon)
    expect(shape.invalid).toBeNull()
    expect(Array.from(shape.rings)).toEqual([4, 8])
    expect([shape.minX, shape.minY, shape.maxX, shape.maxY]).toEqual([0, 0, 10, 10])
    expect(
      area({
        rings: [
          square,
          [
            [4, 4],
            [6, 4],
            [6, 6],
            [4, 6],
          ],
        ],
      }),
    ).toBe(96)
    expect(area({ rings: [square, [4, 4, 6, 4]] })).toBe(100)
  })

  it('draws the same area whatever the direction of the rings', () => {
    const hole = [
      [2, 2],
      [2, 8],
      [8, 8],
      [8, 2],
    ]
    const forward = area({ rings: [square, hole] })
    const backward = area({ rings: [[...square].reverse(), [...hole].reverse()] })
    expect(forward).toBe(64)
    expect(backward).toBe(64)
  })

  it('reads GeoJSON polygons and multipolygons in degrees', () => {
    const polygon = read({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    })
    expect(polygon.rings.length).toBe(1)
    expect(polygon.minX).toBeCloseTo(projectLongitude(0))
    expect(polygon.maxY).toBeCloseTo(projectLatitude(0))
    expect(polygon.minY).toBeCloseTo(projectLatitude(10))
    const multi = read({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
        ],
        [
          [
            [5, 5],
            [6, 5],
            [6, 6],
          ],
        ],
      ],
    })
    expect(Array.from(multi.rings)).toEqual([3, 6])
    expect(multi.triangles.length).toBe(6)
    expect(Math.max(...multi.triangles)).toBe(5)
  })

  it('reads GeoJSON lines and unwraps them across the antimeridian', () => {
    const line = read({
      type: 'LineString',
      coordinates: [
        [170, 0],
        [-170, 0],
      ],
    })
    expect(line.kind).toBe(shapeKinds.line)
    expect(line.closed).toBe(false)
    expect(line.triangles.length).toBe(0)
    expect(line.points[2]).toBeCloseTo(projectLongitude(190))
    const multi = read({
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
        [[2, 2]],
        [
          [3, 3],
          [4, 4],
        ],
      ],
    })
    expect(Array.from(multi.rings)).toEqual([2, 4])
  })

  it('reads open and closed paths', () => {
    const open = read({ points: square })
    expect(open.kind).toBe(shapeKinds.line)
    expect(open.closed).toBe(false)
    const closed = read({ points: [...square, [0, 0]], closed: true })
    expect(closed.closed).toBe(true)
    expect(closed.rings[0]).toBe(4)
    expect(
      read({
        points: [
          [0, 0],
          [1, 1],
        ],
        closed: true,
      }).closed,
    ).toBe(false)
  })

  it('skips repeated and unreadable points', () => {
    expect(pointsOf({ points: [[0, 0], [0, 0], null, [1, Number.NaN], { x: 2, y: 2 }] })).toEqual([
      [0, 0],
      [2, 2],
    ])
  })

  it('reads circles and rings in world units as round shapes', () => {
    const circle = read({ center: { x: 10, y: 20 }, radius: 5 })
    expect(circle.kind).toBe(shapeKinds.circle)
    expect(Array.from(circle.round ?? [])).toEqual([10, 20, 5, 0])
    expect([circle.minX, circle.minY, circle.maxX, circle.maxY]).toEqual([5, 15, 15, 25])
    const ring = read({ center: [0, 0], radius: 5, inner: 2 })
    expect(ring.round?.[3]).toBe(2)
    expect(read({ center: [0, 0], radius: 5, inner: 6 }).invalid).toBe('empty')
    expect(read({ center: [0, 0], radius: -1 }).invalid).toBe('empty')
  })

  it('reads circles around a place as polygons with radii in meters', () => {
    const circle = read({ center: { longitude: 0, latitude: 0 }, radius: 111_195 })
    expect(circle.kind).toBe(shapeKinds.polygon)
    expect(circle.rings[0]).toBe(128)
    const unit = projectLongitude(1) - projectLongitude(0)
    expect(circle.maxX - circle.minX).toBeCloseTo(2 * unit, 2)
    const ring = read({ center: { longitude: 0, latitude: 0 }, radius: 111_195, inner: 55_000 })
    expect(Array.from(ring.rings)).toEqual([128, 256])
    expect(ring.invalid).toBeNull()
  })

  it('reads rectangles from their top left corner, with corners bounded', () => {
    const rectangle = read({ x: 10, y: 20, width: 40, height: 10, cornerRadius: 50 })
    expect(rectangle.kind).toBe(shapeKinds.rectangle)
    expect(Array.from(rectangle.round ?? [])).toEqual([30, 25, 20, 5, 5])
    expect([rectangle.minX, rectangle.minY, rectangle.maxX, rectangle.maxY]).toEqual([
      10, 20, 50, 30,
    ])
    expect(read({ x: 0, y: 0, width: 0, height: 1 }).invalid).toBe('empty')
  })

  it('reports geometries that cannot be read', () => {
    expect(readShape(null)).toBeNull()
    for (const value of [
      'shape',
      12,
      {},
      { rings: [] },
      {
        rings: [
          [
            [0, 0],
            [1, 1],
          ],
        ],
      },
      {
        rings: [
          [
            [0, 0],
            [1, 0],
            [2, 0],
          ],
        ],
      },
      { type: 'Point', coordinates: [0, 0] },
      { type: 'LineString', coordinates: [[0, 0]] },
      { points: [[1, 1]] },
    ]) {
      expect(read(value).invalid, JSON.stringify(value)).toBe('empty')
    }
  })

  it('reports outlines that cross themselves', () => {
    const bowtie = read({
      rings: [
        [
          [0, 0],
          [10, 10],
          [10, 0],
          [0, 10],
        ],
      ],
    })
    expect(bowtie.invalid).toBe('self-intersecting')
    const uneven = read({
      rings: [
        [
          [0, 0],
          [20, 20],
          [20, 0],
          [0, 10],
        ],
      ],
    })
    expect(uneven.invalid).toBe('self-intersecting')
    expect(uneven.triangles.length).toBeGreaterThan(0)
    expect(
      read({
        rings: [
          square,
          [
            [20, 20],
            [30, 20],
            [30, 30],
          ],
        ],
      }).invalid,
    ).toBe('self-intersecting')
  })
})
