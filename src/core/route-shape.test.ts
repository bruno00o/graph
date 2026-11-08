import { describe, expect, it } from 'vitest'
import { boxShape, NodeColumns } from './columns'
import { boxDistance } from './node-shape'
import { maxStations, nodeOutline, type Outline, type RouteShape, shapeRoute } from './route-shape'

function outline(x: number, y: number, shape: number, radius: number): Outline {
  const half = shape === 1 ? radius * 0.86 : radius
  return { x, y, shape, radius, halfWidth: half, halfHeight: half, corner: 0, trim: radius }
}

function shaped(points: readonly number[], radius: number): RouteShape {
  const shape: RouteShape = { xs: [], ys: [], curved: [], count: 0, room: 0 }
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

  it('leaves a box at its border, rounded corners included, less the trim', () => {
    const nodes = new NodeColumns()
    nodes.reserve(1)
    nodes.alive[0] = 1
    nodes.shape[0] = boxShape
    nodes.size[0] = 20
    nodes.width[0] = 100
    nodes.corner[0] = 8
    const start = nodeOutline(nodes, null, 0, 0, 0, 1, outline(0, 0, 0, 0))
    expect([start.halfWidth, start.halfHeight, start.corner, start.trim]).toEqual([50, 10, 8, 10])
    const shape: RouteShape = { xs: [], ys: [], curved: [], count: 0, room: 0 }
    shapeRoute([0, 0, 200, 0], 0, 2, 0, start, outline(200, 0, 0, 10), shape)
    expect(shape.xs[0]).toBeCloseTo(50 - 10, 3)
    const diagonal: RouteShape = { xs: [], ys: [], curved: [], count: 0, room: 0 }
    shapeRoute([0, 0, 100, 100], 0, 2, 0, start, outline(100, 100, 0, 10), diagonal)
    const t = Math.hypot(diagonal.xs[0] ?? 0, diagonal.ys[0] ?? 0) + 10
    expect(boxDistance(t * Math.SQRT1_2, t * Math.SQRT1_2, 50, 10, 8)).toBeCloseTo(0, 3)
    const screen = nodeOutline(nodes, null, 0, 0, 0, 2, outline(0, 0, 0, 0))
    nodes.screenUnits[0] = 1
    nodeOutline(nodes, null, 0, 0, 0, 2, screen)
    expect([screen.halfWidth, screen.halfHeight, screen.corner]).toEqual([25, 5, 4])
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
    const shape: RouteShape = { xs: [], ys: [], curved: [], count: 0, room: 0 }
    shapeRoute(points, 0, points.length / 2, 6, outline(0, 0, 0, 5), outline(800, 0, 0, 5), shape)
    expect(shape.count).toBeLessThanOrEqual(maxStations)
    expect(shape.count).toBeGreaterThan(2)
  })
})
