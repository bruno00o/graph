import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import type { GraphDefinitionOptions, WaypointInput } from '../types'
import { EdgePaths, type PathPoint, type PathSpot } from './edge-paths'
import { EdgeWaypoints, maxWaypoints } from './edge-waypoints'
import { geoToWorld, worldSize } from './geo'
import { createGraphModel } from './graph-model'
import { createScene } from './scene'

function points(store: EdgeWaypoints, edge: number): number[][] {
  const first = store.start[edge] ?? 0
  const out: number[][] = []
  for (let k = 0; k < (store.count[edge] ?? 0); k++) {
    out.push([store.points[(first + k) * 2] ?? 0, store.points[(first + k) * 2 + 1] ?? 0])
  }
  return out
}

describe('EdgeWaypoints', () => {
  it('reads points, pairs and places, and skips invalid ones', () => {
    const store = new EdgeWaypoints()
    store.set(0, [
      { x: 1, y: 2 },
      [3, 4],
      { x: Number.NaN, y: 1 },
      null,
      'nope',
      [5],
      { x: '6', y: 7 },
      { x: 8, y: 9 },
    ])
    expect(points(store, 0)).toEqual([
      [1, 2],
      [3, 4],
      [8, 9],
    ])
    expect(store.edges).toBe(1)
    expect(store.geo[0]).toBe(0)
    expect(store.length[0]).toBeCloseTo(Math.hypot(2, 2) + Math.hypot(5, 5))
    expect([...store.bounds.subarray(0, 4)]).toEqual([1, 2, 8, 9])
  })

  it('drops repeated points and treats an empty or invalid list as no waypoints', () => {
    const store = new EdgeWaypoints()
    store.set(2, [
      [1, 1],
      [1, 1],
      [2, 2],
    ])
    expect(points(store, 2)).toEqual([
      [1, 1],
      [2, 2],
    ])
    store.set(2, [])
    expect(store.count[2]).toBe(0)
    expect(store.edges).toBe(0)
    store.set(2, [{ x: Number.POSITIVE_INFINITY, y: 0 }])
    expect(store.edges).toBe(0)
    store.set(2, 42)
    expect(store.edges).toBe(0)
  })

  it('accepts any iterable', () => {
    const store = new EdgeWaypoints()
    function* walk(): Generator<WaypointInput> {
      yield { x: 0, y: 0 }
      yield [10, 0]
    }
    store.set(0, walk())
    expect(points(store, 0)).toEqual([
      [0, 0],
      [10, 0],
    ])
  })

  it('projects places and splits long stretches so they can follow the globe', () => {
    const store = new EdgeWaypoints()
    store.set(0, [
      { longitude: 0, latitude: 0 },
      { longitude: 20, latitude: 0 },
    ])
    const list = points(store, 0)
    const from = geoToWorld({ longitude: 0, latitude: 0 })
    const to = geoToWorld({ longitude: 20, latitude: 0 })
    expect(store.geo[0]).toBe(1)
    expect(store.geoEdges).toBe(1)
    expect(list[0]?.[0]).toBeCloseTo(from.x)
    expect(list.at(-1)?.[0]).toBeCloseTo(to.x)
    expect(list.length).toBe(Math.ceil((to.x - from.x) / 8) + 1)
    for (let k = 1; k < list.length; k++) {
      expect((list[k]?.[0] ?? 0) - (list[k - 1]?.[0] ?? 0)).toBeLessThanOrEqual(8 + 1e-9)
    }
  })

  it('crosses the antimeridian the short way', () => {
    const store = new EdgeWaypoints()
    store.set(0, [
      { longitude: 170, latitude: 0 },
      { longitude: -170, latitude: 0 },
    ])
    const list = points(store, 0)
    const first = list[0]?.[0] ?? 0
    const last = list.at(-1)?.[0] ?? 0
    expect(last - first).toBeCloseTo((20 / 360) * worldSize)
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(worldSize)
  })

  it('reuses the space of an edge that shrinks and compacts freed space', () => {
    const store = new EdgeWaypoints()
    const line = (n: number, y: number) => Array.from({ length: n }, (_, k) => [k, y] as const)
    store.set(0, line(10, 0))
    store.set(1, line(10, 1))
    const start = store.start[0]
    store.set(0, line(4, 2))
    expect(store.start[0]).toBe(start)
    expect(store.garbage).toBe(6)
    for (let round = 0; round < 400; round++) store.set(round % 2, line(20 + (round % 7), round))
    expect(store.pointCount).toBe((store.count[0] ?? 0) + (store.count[1] ?? 0))
    expect(store.points.length).toBe(2048)
    expect(points(store, 1)[0]).toEqual([0, 399])
    store.clear(0)
    store.clear(1)
    expect(store.used).toBe(0)
    expect(store.longest).toBe(0)
  })

  it('thins a route that has too many points', () => {
    const store = new EdgeWaypoints()
    const many = Array.from({ length: maxWaypoints * 2 }, (_, k) => [k, 0] as const)
    store.set(0, many)
    expect(store.count[0]).toBe(maxWaypoints)
    expect(points(store, 0).at(-1)).toEqual([maxWaypoints * 2 - 1, 0])
  })
})

describe('EdgePaths with waypoints', () => {
  function pathsWith(input: Iterable<WaypointInput>): EdgePaths {
    const store = new EdgeWaypoints()
    store.set(0, input)
    const paths = new EdgePaths()
    paths.fixed = store
    paths.reserve(4)
    return paths
  }

  it('starts on the source, passes the waypoints and ends on the target', () => {
    const paths = pathsWith([
      [10, 10],
      [20, 10],
    ])
    expect(paths.isFixed(0)).toBe(true)
    expect(paths.isFixed(1)).toBe(false)
    expect(paths.count(0)).toBe(4)
    expect(paths.any).toBe(true)
    const out: PathPoint = { x: 0, y: 0 }
    const at = (k: number) => {
      paths.point(0, k, 0, 0, 30, 0, 0.3, 1, out)
      return [out.x, out.y]
    }
    expect([0, 1, 2, 3].map(at)).toEqual([
      [0, 0],
      [10, 10],
      [20, 10],
      [30, 0],
    ])
    paths.point(0, 0, 5, 5, 35, 5, 0, 1, out)
    expect([out.x, out.y]).toEqual([5, 5])
    paths.point(0, 1, 5, 5, 35, 5, 0, 1, out)
    expect([out.x, out.y]).toEqual([10, 10])
  })

  it('measures the path and finds a point along it', () => {
    const paths = pathsWith([
      [0, 10],
      [10, 10],
    ])
    const total = paths.fixedLength(0, 0, 0, 10, 0)
    expect(total).toBeCloseTo(30)
    const spot: PathSpot = { x: 0, y: 0, dx: 0, dy: 0 }
    paths.fixedAt(0, 0, 0, 10, 0, 15, spot)
    expect([spot.x, spot.y]).toEqual([5, 10])
    expect([spot.dx, spot.dy]).toEqual([10, 0])
    paths.fixedAt(0, 0, 0, 10, 0, 5, spot)
    expect([spot.x, spot.y]).toEqual([0, 5])
    paths.fixedAt(0, 0, 0, 10, 0, 25, spot)
    expect([spot.x, spot.y]).toEqual([10, 5])
  })

  it('reaches as far as the waypoints go beyond the ends', () => {
    const paths = pathsWith([
      [0, -40],
      [10, 5],
    ])
    expect(paths.slack(0, 0, 0, 10, 0)).toBe(40)
    expect(paths.slack(1, 0, 0, 10, 0)).toBe(0)
    const box = new Float64Array(4)
    expect(paths.fixedBounds(0, 0, 10, box)).toBe(true)
    expect([...box]).toEqual([0, -40, 10, 5])
    expect(paths.fixedBounds(1, 0, 10, box)).toBe(false)
  })

  it('keeps the inner points of a route near nodes that sit across the antimeridian', () => {
    const paths = pathsWith([
      { longitude: 179, latitude: 0 },
      { longitude: -179, latitude: 0 },
    ])
    const source = geoToWorld({ longitude: 178, latitude: 0 })
    const target = geoToWorld({ longitude: -178, latitude: 0 })
    const out: PathPoint = { x: 0, y: 0 }
    const count = paths.count(0)
    const xs: number[] = []
    for (let k = 0; k < count; k++) {
      paths.point(0, k, source.x, source.y, target.x, target.y, 0, 1, out)
      xs.push(out.x)
    }
    for (let k = 1; k < count; k++) {
      expect(Math.abs((xs[k] ?? 0) - (xs[k - 1] ?? 0))).toBeLessThan(10)
    }
    expect(xs[0]).toBeCloseTo(source.x)
    expect(xs.at(-1)).toBeCloseTo(target.x + worldSize)
    const wraps = paths.wraps(0, source.x, target.x, { x: 0, y: 0 })
    expect(wraps.y - wraps.x).toBe(worldSize)
    expect(paths.slack(0, source.x, source.y, target.x, target.y)).toBe(worldSize)
  })

  it('keeps the relative paths untouched', () => {
    const paths = pathsWith([[1, 1]])
    expect(paths.relativeVersion).toBe(paths.version - (paths.fixed?.version ?? 0))
    expect(paths.bundled).toBe(0)
    expect(paths.curvedAt(0, 0)).toBe(false)
    paths.clear(0)
    expect(paths.isFixed(0)).toBe(true)
  })
})

type Item = { id: string }
type Link = { id: string; from: string; to: string; via?: WaypointInput[] | null }

function setup(links: Link[], extra: Partial<Parameters<typeof edges<Link>>[1]> = {}) {
  const model = createGraphModel()
  const scene = createScene()
  const items: Item[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const render = (next: Link[]) => {
    const options: GraphDefinitionOptions = {
      marks: [
        nodes<Item>(items),
        edges<Link>(next, { source: 'from', target: 'to', waypoints: 'via', ...extra }),
      ],
    }
    const definition = defineGraph(options)
    model.setMarks(definition.marks)
    scene.setDefinition(definition)
    scene.apply(model, model.flush())
  }
  render(links)
  const at = (key: string) => model.edge(key)?.index ?? -1
  return { scene, render, at }
}

describe('waypoint edges in the scene', () => {
  it('keeps waypoint edges out of bundles, routes, bridges and lanes', () => {
    const links: Link[] = [
      { id: 'ab', from: 'a', to: 'b', via: [[5, 5]] },
      { id: 'ab2', from: 'a', to: 'b' },
      { id: 'ab3', from: 'a', to: 'b' },
      { id: 'bc', from: 'b', to: 'c', via: [] },
    ]
    const { scene, at } = setup(links)
    const { edges: columns } = scene
    expect(columns.waypoints?.count[at('ab')]).toBe(1)
    expect(columns.bundle[at('ab')]).toBe(0)
    expect(columns.route[at('ab')]).toBe(0)
    expect(columns.bridge[at('ab')]).toBe(0)
    expect(columns.bend[at('ab')]).toBe(0)
    expect(columns.bend[at('ab2')]).not.toBe(0)
    expect(columns.bend[at('ab2')]).toBe(-(columns.bend[at('ab3')] ?? 0))
    expect(columns.bundle[at('bc')]).toBe(1)
    expect(columns.waypoints?.count[at('bc')]).toBe(0)
  })

  it('wins over great circles and is ignored by loops', () => {
    const links: Link[] = [
      { id: 'ab', from: 'a', to: 'b', via: [[5, 5]] },
      { id: 'aa', from: 'a', to: 'a', via: [[5, 5]] },
    ]
    const { scene, at } = setup(links, { geodesic: true })
    expect(scene.edges.geodesic[at('ab')]).toBe(0)
    expect(scene.edges.waypoints?.count[at('aa')]).toBe(0)
  })

  it('updates and clears waypoints with the data', () => {
    const { scene, render, at } = setup([{ id: 'ab', from: 'a', to: 'b', via: [[5, 5]] }])
    const store = scene.edges.waypoints
    render([{ id: 'ab', from: 'a', to: 'b', via: [[5, 5], { x: 6, y: 7 }] }])
    expect(store?.count[at('ab')]).toBe(2)
    render([{ id: 'ab', from: 'a', to: 'b', via: null }])
    expect(store?.count[at('ab')]).toBe(0)
    expect(scene.edges.bundle[at('ab')]).toBe(1)
    render([])
    expect(store?.edges).toBe(0)
  })

  it('creates no waypoint store when no edge has waypoints', () => {
    const { scene } = setup([{ id: 'ab', from: 'a', to: 'b' }])
    expect(scene.edges.waypoints).toBeNull()
  })
})
