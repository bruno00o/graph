import { describe, expect, it } from 'vitest'
import { geoToWorld } from '../core/geo'
import {
  backgroundStep,
  circleGeometry,
  pathGeometry,
  randomKey,
  rectangleGeometry,
  simplifyStroke,
  snapToGrid,
  squareFrom,
  turnBy,
  worldToMeters,
} from './draw'
import { metersToWorld } from './geometry'

describe('drawn geometry', () => {
  it('writes world shapes, and leaves out empty ones', () => {
    expect(rectangleGeometry({ x: 10, y: 5 }, { x: 0, y: 0 }, false)).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 5,
    })
    expect(rectangleGeometry({ x: 0, y: 0 }, { x: 0, y: 5 }, false)).toBeNull()
    expect(circleGeometry({ x: 1, y: 1 }, { x: 4, y: 5 }, false)).toEqual({
      center: { x: 1, y: 1 },
      radius: 5,
    })
    expect(circleGeometry({ x: 1, y: 1 }, { x: 1, y: 1 }, false)).toBeNull()
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 0 },
    ]
    expect(pathGeometry(points, true, false)).toEqual({
      rings: [
        [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 4 },
        ],
      ],
    })
    expect(pathGeometry(points.slice(0, 2), false, false)).toBeNull()
  })

  it('writes counterclockwise GeoJSON rings, closed, with longitudes from -180 to 180', () => {
    const a = geoToWorld({ longitude: 170, latitude: 10 })
    const b = geoToWorld({ longitude: 190, latitude: -10 })
    const geometry = rectangleGeometry(a, b, true) as { type: string; coordinates: number[][][] }
    expect(geometry.type).toBe('Polygon')
    const ring = geometry.coordinates[0] ?? []
    expect(ring).toHaveLength(5)
    expect(ring[4]).toEqual(ring[0])
    const unwrap = (value: number) => (value < 0 ? value + 360 : value)
    let area = 0
    for (let at = 0; at < 4; at++) {
      const p = ring[at] ?? []
      const q = ring[at + 1] ?? []
      area += (unwrap(q[0] ?? 0) - unwrap(p[0] ?? 0)) * ((q[1] ?? 0) + (p[1] ?? 0))
    }
    expect(area).toBeLessThan(0)
    for (const [longitude] of ring) {
      expect(longitude).toBeGreaterThanOrEqual(-180)
      expect(longitude).toBeLessThanOrEqual(180)
    }
    expect(pathGeometry([a, b], false, true)).toMatchObject({ type: 'LineString' })
  })

  it('measures circles in meters around a place', () => {
    const center = geoToWorld({ longitude: 2, latitude: 48 })
    const radius = metersToWorld(1000, center.y)
    expect(worldToMeters(radius, center.y)).toBeCloseTo(1000, 6)
    const geometry = circleGeometry(center, { x: center.x + radius, y: center.y }, true)
    expect(geometry).toMatchObject({ center: { longitude: 2 } })
    expect((geometry as { radius: number }).radius).toBeCloseTo(1000, 6)
  })
})

describe('drawing helpers', () => {
  it('snaps, squares and turns', () => {
    expect(snapToGrid({ x: 14, y: -6 }, 10)).toEqual({ x: 10, y: -10 })
    expect(snapToGrid({ x: 14, y: -6 }, 0)).toEqual({ x: 14, y: -6 })
    expect(squareFrom({ x: 0, y: 0 }, { x: -3, y: 8 })).toEqual({ x: -8, y: 8 })
    const turned = turnBy({ x: 0, y: 0 }, { x: 10, y: 1 }, 15)
    expect(turned.y).toBeCloseTo(0, 12)
    expect(turned.x).toBeCloseTo(Math.hypot(10, 1), 12)
    const diagonal = turnBy({ x: 0, y: 0 }, { x: 10, y: 9 }, 45)
    expect(diagonal.x).toBeCloseTo(diagonal.y, 12)
  })

  it('picks the background level whose lines are at least 16 pixels apart', () => {
    expect(backgroundStep(10, 1, true)).toBe(40)
    expect(backgroundStep(10, 2, true)).toBe(10)
    expect(backgroundStep(10, 0.1, true)).toBe(160)
    expect(backgroundStep(10, 0.1, false)).toBe(10)
  })

  it('makes version 4 keys', () => {
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    expect(randomKey()).toMatch(pattern)
  })
})

describe('simplifyStroke', () => {
  it('keeps the points that stray more than the tolerance', () => {
    const xy: number[] = []
    for (let x = 0; x <= 100; x += 2) xy.push(x, x === 50 ? 3 : 0)
    const kept = simplifyStroke(Float64Array.from(xy), false, 0.5)
    expect(kept.map((index) => xy[index * 2])).toEqual([0, 48, 50, 52, 100])
  })

  it('keeps a short stroke whole, and the corners of a closed one', () => {
    expect(simplifyStroke(Float64Array.of(0, 0, 5, 5), false, 0.5)).toEqual([0, 1])
    const square = Float64Array.of(0, 0, 5, 0, 10, 0, 10, 10, 0, 10)
    expect(simplifyStroke(square, true, 0.5)).toEqual([0, 2, 3, 4])
  })
})
