import { describe, expect, it } from 'vitest'
import type { LineGeometry } from './types'
import { lineWaypoints } from './waypoints'

describe('lineWaypoints', () => {
  it('drops the ends of a line string by default', () => {
    const line: LineGeometry = {
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 2],
        [3, 4, 100],
        [5, 6],
      ],
    }
    expect(lineWaypoints(line)).toEqual([
      { longitude: 1, latitude: 2 },
      { longitude: 3, latitude: 4 },
    ])
    expect(lineWaypoints(line, { keepEnds: true })).toHaveLength(4)
    expect(lineWaypoints(line, { keepEnds: undefined })).toHaveLength(2)
  })

  it('joins the lines of a multi line string and skips invalid or repeated positions', () => {
    const lines: LineGeometry = {
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
        [
          [1, 1],
          [Number.NaN, 2],
          [2, 2],
          [3, 3],
        ],
      ],
    }
    expect(lineWaypoints(lines, { keepEnds: true })).toEqual([
      { longitude: 0, latitude: 0 },
      { longitude: 1, latitude: 1 },
      { longitude: 2, latitude: 2 },
      { longitude: 3, latitude: 3 },
    ])
  })

  it('gives no waypoints for short, missing or unknown geometries', () => {
    expect(lineWaypoints(null)).toEqual([])
    expect(lineWaypoints(undefined)).toEqual([])
    expect(
      lineWaypoints({
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      }),
    ).toEqual([])
    const point = { type: 'Point', coordinates: [0, 0] } as unknown as LineGeometry
    expect(lineWaypoints(point)).toEqual([])
  })
})
