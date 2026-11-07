import { describe, expect, it, vi } from 'vitest'
import { EdgeColumns } from './columns'
import { EdgePaths, type PathPoint, type PathResult, pathClasses } from './edge-paths'
import { Positions } from './positions'
import type { Outline } from './route-shape'

function setup() {
  const positions = new Positions()
  positions.set(0, 0, 0)
  positions.set(1, 1000, 0)
  positions.set(2, 0, 400)
  const edges = new EdgeColumns()
  edges.reserve(1)
  edges.alive.set([1, 1])
  edges.bundle.set([1, 1])
  edges.source.set([0, 0])
  edges.target.set([1, 2])
  return { positions, edges }
}

function arch(height: number): PathResult {
  const points: number[] = []
  for (let k = 0; k <= 10; k++) {
    const u = k / 10
    points.push(u * 1000, Math.sin(Math.PI * u) * height)
  }
  return {
    edges: new Uint32Array([0]),
    ends: new Uint32Array([0, 1]),
    paths: { offsets: new Uint32Array([0, 11]), points: new Float32Array(points) },
  }
}

describe('EdgePaths', () => {
  it('resamples a path to a strip size and eases from straight to the scaled shape', () => {
    const { positions } = setup()
    const paths = new EdgePaths()
    paths.reserve(2)
    paths.start(arch(100), 0.5, positions)
    const count = paths.count(0)
    expect(pathClasses).toContain(count)
    expect(paths.count(1)).toBe(0)
    expect(paths.mix).toBe(0)
    const point: PathPoint = { x: 0, y: 0 }
    const middle = (count - 1) / 2
    paths.point(0, middle, 0, 0, 1000, 0, 0, 0, point)
    expect(point.y).toBeCloseTo(0)
    paths.point(0, middle, 0, 0, 1000, 0, 0, 1, point)
    expect(point.x).toBeCloseTo(500, 0)
    expect(point.y).toBeCloseTo(50, 0)
    expect(paths.length(0, 0)).toBeCloseTo(1000)
    expect(paths.length(0, 1)).toBeGreaterThan(1000)
  })

  it('follows moved ends and adds the lane of parallel edges', () => {
    const { positions } = setup()
    const paths = new EdgePaths()
    paths.reserve(2)
    paths.start(arch(100), 1, positions)
    const point: PathPoint = { x: 0, y: 0 }
    const middle = (paths.count(0) - 1) / 2
    paths.point(0, middle, 0, 200, 1000, 200, 0, 1, point)
    expect(point.y).toBeCloseTo(300, 0)
    paths.point(0, middle, 0, 0, 1000, 0, 0.1, 1, point)
    expect(point.y).toBeCloseTo(200, 0)
  })

  it('blends from the drawn shape when a new result arrives', () => {
    const { positions } = setup()
    const paths = new EdgePaths()
    paths.reserve(2)
    paths.start(arch(100), 1, positions)
    paths.mix = 0.5
    paths.start(arch(-100), 1, positions)
    const point: PathPoint = { x: 0, y: 0 }
    const middle = (paths.count(0) - 1) / 2
    paths.point(0, middle, 0, 0, 1000, 0, 0, 0, point)
    expect(point.y).toBeCloseTo(50, 0)
    paths.point(0, middle, 0, 0, 1000, 0, 0, 1, point)
    expect(point.y).toBeCloseTo(-100, 0)
  })

  it('fades to straight lines and frees them once settled', () => {
    const { positions } = setup()
    const paths = new EdgePaths()
    paths.reserve(2)
    paths.start(arch(100), 1, positions)
    paths.mix = 1
    paths.start(null, 0, positions)
    expect(paths.count(0)).toBeGreaterThan(0)
    paths.mix = 1
    paths.settle()
    expect(paths.count(0)).toBe(0)
    expect(paths.bundled).toBe(0)
  })

  it('drops the path of an edge whose ends or bundle flag change', () => {
    const { positions, edges } = setup()
    const paths = new EdgePaths()
    paths.reserve(2)
    paths.start(arch(100), 1, positions)
    paths.validateAll(edges)
    expect(paths.count(0)).toBeGreaterThan(0)
    edges.target[0] = 2
    paths.validateAll(edges)
    expect(paths.count(0)).toBe(0)
    edges.target[0] = 1
    paths.start(arch(100), 1, positions)
    edges.bundle[0] = 0
    const version = paths.version
    paths.validateAll(edges)
    expect(paths.count(0)).toBe(0)
    expect(paths.version).toBeGreaterThan(version)
  })

  it('skips paths that stay on their chord', () => {
    const { positions } = setup()
    const paths = new EdgePaths()
    paths.reserve(2)
    paths.start(arch(0), 1, positions)
    expect(paths.count(0)).toBe(0)
    expect(paths.bundled).toBe(0)
  })

  it('draws a route through its corners, measured by arc length, and follows its ends', () => {
    const { positions } = setup()
    const paths = new EdgePaths()
    paths.reserve(2)
    const circle = (index: number, out: Outline): Outline => {
      out.x = positions.x(index)
      out.y = positions.y(index)
      out.shape = 0
      out.radius = 10
      out.halfWidth = 10
      out.halfHeight = 10
      out.trim = 10
      return out
    }
    const route: PathResult = {
      edges: new Uint32Array([0]),
      ends: new Uint32Array([0, 1]),
      paths: {
        offsets: new Uint32Array([0, 4]),
        points: new Float32Array([0, 0, 0, 200, 1000, 200, 1000, 0]),
      },
    }
    paths.route(route, 0, circle, positions)
    paths.mix = 1
    expect(paths.lanes).toBe(false)
    expect(paths.measured).toBe(true)
    expect(paths.rooms[0]).toBeGreaterThan(900)
    const count = paths.count(0)
    expect(count % 2).toBe(1)
    expect(paths.length(0)).toBeCloseTo(1400, 0)
    const { edges } = setup()
    const line = new Float64Array(80)
    expect(paths.polyline(0, edges, positions, 1, line)).toBe(count)
    expect(line[0]).toBeCloseTo(0)
    expect(line[1]).toBeCloseTo(0)
    const middle = (count - 1) / 2
    expect(line[middle * 2 + 1]).toBeCloseTo(200)
    const along = paths.station(0, middle) * 1400
    expect(along).toBeCloseTo(200 + Math.abs((line[middle * 2] ?? 0) - 0), 0)
    for (let k = 1; k < count; k++) {
      expect(paths.station(0, k)).toBeGreaterThan(paths.station(0, k - 1))
    }
    positions.set(1, 1000, 100)
    paths.polyline(0, edges, positions, 1, line)
    expect(line[(count - 1) * 2]).toBeCloseTo(1000)
    expect(line[(count - 1) * 2 + 1]).toBeCloseTo(100)
    paths.start(arch(100), 1, positions)
    expect(paths.lanes).toBe(true)
  })

  it('keeps the paths within the point budget and draws the others straight', () => {
    const { positions } = setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const two: PathResult = {
      edges: new Uint32Array([0, 1]),
      ends: new Uint32Array([0, 1, 0, 2]),
      paths: {
        offsets: new Uint32Array([0, 11, 22]),
        points: new Float32Array([...arch(100).paths.points, ...arch(80).paths.points]),
      },
    }
    const roomy = new EdgePaths()
    roomy.reserve(2)
    roomy.start(two, 1, positions)
    expect(roomy.bundled).toBe(2)
    const coarse = new EdgePaths()
    coarse.pointBudget = roomy.count(0)
    coarse.reserve(2)
    coarse.start(two, 1, positions)
    expect(coarse.bundled).toBe(2)
    expect(coarse.count(0) + coarse.count(1)).toBeLessThanOrEqual(roomy.count(0))
    const tight = new EdgePaths()
    tight.pointBudget = pathClasses[0] ?? 5
    tight.reserve(2)
    tight.start(two, 1, positions)
    expect(tight.bundled).toBe(1)
    expect(tight.count(1)).toBe(0)
    expect(tight.data.length / 4).toBeLessThanOrEqual(1024)
    const routed = new EdgePaths()
    routed.pointBudget = 1
    routed.reserve(2)
    routed.route(
      {
        edges: new Uint32Array([0]),
        ends: new Uint32Array([0, 1]),
        paths: {
          offsets: new Uint32Array([0, 4]),
          points: new Float32Array([0, 0, 0, 200, 1000, 200, 1000, 0]),
        },
      },
      0,
      (index, out) => Object.assign(out, { x: positions.x(index), y: positions.y(index) }),
      positions,
    )
    expect(routed.bundled).toBe(0)
    warn.mockRestore()
  })
})
