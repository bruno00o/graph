import { describe, expect, it } from 'vitest'
import type { ShapeGeometryData } from '../core/shape-engine'
import { readShape } from './read'
import { withCopies, wrapShifts } from './wrap'

function read(value: unknown): ShapeGeometryData {
  const shape = readShape(value)
  if (!shape) throw new Error('no shape')
  return shape
}

const across = {
  type: 'Polygon',
  coordinates: [
    [
      [170, -20],
      [-170, -20],
      [-170, 0],
      [170, 0],
      [170, -20],
    ],
  ],
}

describe('wrap', () => {
  it('copies a shape in degrees to the other side of the antimeridian it crosses', () => {
    expect(wrapShifts(read(across))).toEqual([-512])
    const west = read({
      ...across,
      coordinates: [across.coordinates[0]?.map(([x = 0, y = 0]) => [-x, y])],
    })
    expect(wrapShifts(west)).toEqual([512])
    expect(
      wrapShifts(
        read({
          type: 'LineString',
          coordinates: [
            [10, 0],
            [20, 5],
          ],
        }),
      ),
    ).toEqual([])
    expect(
      wrapShifts(
        read({
          rings: [
            [
              [-20, 0],
              [600, 0],
              [600, 50],
            ],
          ],
        }),
      ),
    ).toEqual([])
    expect(
      wrapShifts(read({ center: { longitude: 179.9, latitude: 0 }, radius: 100_000 })),
    ).toEqual([-512])
  })

  it('appends the copy as more rings and triangles, once per geometry', () => {
    const shape = read(across)
    const both = withCopies(shape)
    expect(withCopies(shape)).toBe(both)
    expect(both.points.length).toBe(shape.points.length * 2)
    expect(Array.from(both.rings)).toEqual([4, 8])
    expect(both.triangles.length).toBe(shape.triangles.length * 2)
    expect(both.points[8]).toBeCloseTo((shape.points[0] ?? 0) - 512)
    expect(both.points[9]).toBe(shape.points[1])
    expect(both.triangles[shape.triangles.length]).toBe((shape.triangles[0] ?? 0) + 4)
    expect(both.minX).toBeCloseTo(shape.minX - 512)
    expect(both.maxX).toBe(shape.maxX)
    const flat = read({
      rings: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
        ],
      ],
    })
    expect(withCopies(flat)).toBe(flat)
  })
})
