import { describe, expect, it } from 'vitest'
import { maxStations, type Outline, type RouteShape, shapeRoute } from './route-shape'

function outline(x: number, y: number, shape: number, radius: number): Outline {
  const half = shape === 1 ? radius * 0.86 : radius
  return { x, y, shape, radius, halfWidth: half, halfHeight: half, trim: radius }
}

function shaped(points: readonly number[], radius: number): RouteShape {
  const shape: RouteShape = { xs: [], ys: [], count: 0, room: 0 }
  shapeRoute(
    points,
    0,
    points.length / 2,
    radius,
    outline(0, 0, 1, 10),
    outline(200, 100, 0, 10),
    shape,
  )
  return shape
}

const elbow = [5, 0, 5, 100, 200, 100]

describe('shapeRoute', () => {
  it('starts where the route leaves the node, less the trim the shaders take off', () => {
    const shape = shaped(elbow, 0)
    expect(shape.xs[0]).toBeCloseTo(5)
    expect(shape.ys[0]).toBeCloseTo(8.6 - 10, 3)
    expect(shape.xs[shape.count - 1]).toBeCloseTo(200)
    expect(shape.ys[shape.count - 1]).toBeCloseTo(100)
  })

  it('keeps sharp corners without a radius', () => {
    const shape = shaped(elbow, 0)
    const corner = shape.xs.findIndex((x, k) => x === 5 && shape.ys[k] === 100)
    expect(corner).toBeGreaterThan(0)
  })

  it('rounds the corners and stays inside the bend', () => {
    const shape = shaped(elbow, 6)
    expect(shape.count).toBeLessThanOrEqual(maxStations)
    for (let k = 0; k < shape.count; k++) {
      const x = shape.xs[k] ?? 0
      const y = shape.ys[k] ?? 0
      expect(x === 5 && y === 100).toBe(false)
      expect(x).toBeGreaterThanOrEqual(5 - 1e-9)
      expect(y).toBeLessThanOrEqual(100 + 1e-9)
      if (y > 94 && x < 11) expect(Math.hypot(x - 11, y - 94)).toBeCloseTo(6, 3)
    }
  })

  it('puts the middle point on the longest straight piece and gives its room', () => {
    for (const radius of [0, 6]) {
      const shape = shaped(elbow, radius)
      expect(shape.count % 2).toBe(1)
      const middle = (shape.count - 1) / 2
      expect(shape.ys[middle]).toBeCloseTo(100)
      expect(shape.xs[middle]).toBeGreaterThan(5 + radius)
      expect(shape.room).toBeGreaterThan(150)
      expect(shape.room).toBeLessThanOrEqual(195)
    }
  })

  it('falls back to fewer points on long winding routes', () => {
    const points: number[] = [0, 0]
    for (let k = 1; k <= 20; k++)
      points.push(k * 40, (k - 1) % 2 === 0 ? 0 : 40, k * 40, k % 2 === 0 ? 0 : 40)
    const shape: RouteShape = { xs: [], ys: [], count: 0, room: 0 }
    shapeRoute(points, 0, points.length / 2, 6, outline(0, 0, 0, 5), outline(800, 0, 0, 5), shape)
    expect(shape.count).toBeLessThanOrEqual(maxStations)
    expect(shape.count).toBeGreaterThan(2)
  })
})
