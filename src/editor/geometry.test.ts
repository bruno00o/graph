import { describe, expect, it } from 'vitest'
import { geoToWorld } from '../core/geo'
import {
  boundsOf,
  insertVertex,
  moveVertex,
  type Outline,
  type PathOutline,
  readEditable,
  removeVertex,
  scaleOutline,
  translateOutline,
  writeEditable,
} from './geometry'

function pathOf(value: unknown): PathOutline {
  const outline = readEditable(value)
  if (outline?.kind !== 'path') throw new Error('not a path')
  return outline
}

function read(value: unknown): Outline {
  const outline = readEditable(value)
  if (!outline) throw new Error('not editable')
  return outline
}

describe('readEditable and writeEditable', () => {
  it('writes back what it read, point for point', () => {
    const inputs = [
      {
        rings: [
          [
            { x: 0, y: 0, tag: 'a' },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
          ],
        ],
      },
      {
        points: [
          [0, 0, 7],
          [5, 5],
          [9, 0],
        ],
        closed: false,
      },
      {
        type: 'Polygon',
        coordinates: [
          [
            [2, 48],
            [3, 48],
            [3, 49],
            [2, 48],
          ],
        ],
      },
      {
        type: 'MultiLineString',
        coordinates: [
          [
            [0, 0],
            [1, 1],
          ],
          [
            [2, 2],
            [3, 3],
          ],
        ],
      },
      { center: { x: 4, y: 5 }, radius: 3, inner: 1 },
      { x: 1, y: 2, width: 3, height: 4, cornerRadius: 1 },
    ]
    for (const input of inputs) expect(writeEditable(read(input))).toEqual(input)
  })

  it('keeps the closing point, extra coordinates and other fields of GeoJSON', () => {
    const polygon = {
      type: 'Polygon',
      bbox: [2, 48, 3, 49],
      id: 'zone',
      coordinates: [
        [
          [2, 48, 120],
          [3, 48, 130],
          [3, 49, 140],
          [2, 48, 120],
        ],
      ],
    }
    const moved = writeEditable(translateOutline(read(polygon), 1, 0)) as unknown as {
      readonly bbox?: unknown
      readonly id: string
      readonly coordinates: number[][][]
    }
    expect(moved.bbox).toBeUndefined()
    expect(moved.id).toBe('zone')
    const ring = moved.coordinates[0] ?? []
    expect(ring).toHaveLength(4)
    expect(ring[3]).toEqual(ring[0])
    expect(ring.map((point) => point[2])).toEqual([120, 130, 140, 120])
    const west = geoToWorld({ longitude: 2, latitude: 48 })
    const back = read(moved) as PathOutline
    expect(back.parts[0]?.points[0]?.x).toBeCloseTo(west.x + 1, 9)
    expect(back.parts[0]?.points[0]?.y).toBeCloseTo(west.y, 9)
  })

  it('unrolls longitudes across the antimeridian and wraps them back into [-180, 180]', () => {
    const line = {
      type: 'LineString',
      coordinates: [
        [179, 0],
        [-179, 0],
      ],
    }
    const outline = pathOf(line)
    const [a, b] = outline.parts[0]?.points ?? []
    expect((b?.x ?? 0) - (a?.x ?? 0)).toBeCloseTo((2 / 360) * 512, 9)
    const written = writeEditable(translateOutline(outline, 0.5, 0)) as unknown as {
      readonly coordinates: number[][]
    }
    for (const [longitude] of written.coordinates) {
      expect(longitude).toBeGreaterThanOrEqual(-180)
      expect(longitude).toBeLessThanOrEqual(180)
    }
  })

  it('leaves out what it cannot edit', () => {
    expect(readEditable(null)).toBeNull()
    expect(readEditable({})).toBeNull()
    expect(readEditable({ rings: [[{ x: 0, y: 0 }]] })).toBeNull()
    expect(readEditable({ center: { x: 0, y: 0 }, radius: 1, inner: 2 })).toBeNull()
    expect(readEditable({ x: 0, y: 0, width: 0, height: 1 })).toBeNull()
  })
})

describe('outline edits', () => {
  const square = {
    rings: [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
    ],
  }

  it('moves one vertex and keeps the other points as they were', () => {
    const outline = pathOf(square)
    const written = writeEditable(moveVertex(outline, 0, 2, 20, 15)) as unknown as {
      readonly rings: unknown[][]
    }
    const ring = written.rings[0] ?? []
    expect(ring[2]).toEqual({ x: 20, y: 15 })
    expect(ring[0]).toBe(square.rings[0]?.[0])
    expect(ring[3]).toBe(square.rings[0]?.[3])
  })

  it('inserts a vertex in the form of its neighbour, and removes down to three', () => {
    const outline = insertVertex(pathOf(square), 0, 0, 5, -2)
    expect(writeEditable(outline)).toEqual({
      rings: [
        [
          { x: 0, y: 0 },
          { x: 5, y: -2 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
      ],
    })
    const pairs = insertVertex(
      pathOf({
        points: [
          [0, 0, 1],
          [4, 0],
        ],
      }),
      0,
      0,
      2,
      1,
    )
    expect(writeEditable(pairs)).toEqual({
      points: [
        [0, 0, 1],
        [2, 1],
        [4, 0],
      ],
    })
    const triangle = removeVertex(pathOf(square), 0, 1)
    expect(triangle.parts[0]?.points).toHaveLength(3)
    expect(removeVertex(triangle, 0, 0)).toBe(triangle)
  })

  it('scales circles by the root of the area factor and rectangles by their corners', () => {
    const circle = scaleOutline(read({ center: { x: 0, y: 0 }, radius: 2, inner: 1 }), 0, 0, 4, 1)
    expect(writeEditable(circle)).toEqual({ center: { x: 0, y: 0 }, radius: 4, inner: 2 })
    const box = scaleOutline(read({ x: 0, y: 0, width: 10, height: 4 }), 10, 4, -1, 2)
    expect(writeEditable(box)).toEqual({ x: 10, y: -4, width: 10, height: 8 })
    expect(boundsOf(box)).toEqual([10, -4, 20, 4])
  })
})
