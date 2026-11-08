import { describe, expect, it } from 'vitest'
import { projectLatitude, projectLongitude } from '../core/geo'
import { groupedGraph, smallestGap } from '../testing/groups'
import type { Layout, LayoutGraph } from '../types'
import { geo } from './index'

interface Place {
  readonly longitude?: number | null
  readonly latitude?: number | null
  readonly rank?: number
}

interface Shape {
  readonly places: readonly Place[]
  readonly radius?: number | readonly number[]
  readonly edges?: readonly number[]
  readonly fixed?: readonly (readonly [number, number, number])[]
}

function graphOf({ places, radius = 5, edges = [], fixed = [] }: Shape): LayoutGraph<Place> {
  const capacity = places.length + fixed.length
  const xy = new Float32Array(capacity * 2)
  const movable = new Uint8Array(capacity).fill(1)
  fixed.forEach(([index, x, y]) => {
    movable[index] = 0
    xy[index * 2] = x
    xy[index * 2 + 1] = y
  })
  const items: (Place | undefined)[] = []
  let next = 0
  for (let index = 0; index < capacity; index++) {
    items.push(movable[index] === 1 ? places[next++] : {})
  }
  return {
    capacity,
    alive: new Uint8Array(capacity).fill(1),
    movable,
    xy,
    radius: Float32Array.from({ length: capacity }, (_, index) =>
      typeof radius === 'number' ? radius : (radius[index] ?? 5),
    ),
    edges: Uint32Array.from(edges),
    keys: Array.from({ length: capacity }, (_, index) => `n${index}`),
    datum: (index) => items[index],
  }
}

function run<T>(layout: Layout<T>, graph: LayoutGraph<T>): Promise<Float32Array> {
  return new Promise((resolve) => layout.start(graph, { progress: () => {}, end: resolve }))
}

function point(xy: Float32Array, index: number): [number, number] {
  return [xy[index * 2] ?? Number.NaN, xy[index * 2 + 1] ?? Number.NaN]
}

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

function overlaps(graph: LayoutGraph, xy: Float32Array, gap: number): number {
  let count = 0
  for (let a = 0; a < graph.capacity; a++) {
    for (let b = a + 1; b < graph.capacity; b++) {
      const need = (graph.radius[a] ?? 0) + (graph.radius[b] ?? 0) + gap - 1e-3
      const [ax, ay] = point(xy, a)
      const [bx, by] = point(xy, b)
      if (Math.hypot(ax - bx, ay - by) < need) count++
    }
  }
  return count
}

const paris = { longitude: 2.35, latitude: 48.86 }
const tokyo = { longitude: 139.69, latitude: 35.68 }

describe('geo', () => {
  it('projects with Web Mercator, times the scale, around the center', async () => {
    const graph = graphOf({ places: [paris, tokyo] })
    const xy = await run(geo({ scale: 2, center: { longitude: 0, latitude: 0 } }), graph)
    expect(point(xy, 0)[0]).toBeCloseTo((projectLongitude(2.35) - 256) * 2, 3)
    expect(point(xy, 0)[1]).toBeCloseTo((projectLatitude(48.86) - 256) * 2, 3)
    expect(point(xy, 1)[0]).toBeCloseTo((projectLongitude(139.69) - 256) * 2, 3)
    expect(point(xy, 1)[1]).toBeCloseTo((projectLatitude(35.68) - 256) * 2, 3)
  })

  it('centers the places on the origin without a center', async () => {
    const graph = graphOf({ places: [paris, tokyo] })
    const xy = await run(geo({ scale: 1 }), graph)
    expect(point(xy, 0)[0]).toBeCloseTo(-point(xy, 1)[0], 3)
    expect(point(xy, 0)[1]).toBeCloseTo(-point(xy, 1)[1], 3)
  })

  it('reads fields and functions of the items', async () => {
    interface Item {
      readonly lon: number
      readonly lat: number
    }
    const items: Item[] = [
      { lon: 2.35, lat: 48.86 },
      { lon: 139.69, lat: 35.68 },
    ]
    const graph: LayoutGraph<Item> = { ...graphOf({ places: [{}, {}] }), datum: (at) => items[at] }
    const byField = await run(geo<Item>({ longitude: 'lon', latitude: 'lat', scale: 1 }), graph)
    const byFunction = await run(
      geo<Item>({ longitude: (item) => item.lon, latitude: (item) => item.lat, scale: 1 }),
      graph,
    )
    expect(byFunction).toEqual(byField)
    expect(point(byField, 1)[0] - point(byField, 0)[0]).toBeCloseTo(
      projectLongitude(139.69) - projectLongitude(2.35),
      3,
    )
  })

  it('gathers nodes at the same place around it, in order', async () => {
    const places = [3, 1, 2].map((rank) => ({ ...paris, rank }))
    const graph = graphOf({ places, radius: 5 })
    const xy = await run(
      geo<Place>({
        scale: 1,
        center: paris,
        spacing: 2,
        order: (a, b) => (a.rank ?? 0) - (b.rank ?? 0),
      }),
      graph,
    )
    const reach = 12 / (2 * Math.sin(Math.PI / 3))
    expect(point(xy, 1)[0]).toBeCloseTo(0, 3)
    expect(point(xy, 1)[1]).toBeCloseTo(-reach, 3)
    for (const index of [0, 1, 2]) {
      expect(Math.hypot(...point(xy, index))).toBeCloseTo(reach, 3)
    }
    expect(overlaps(graph, xy, 2)).toBe(0)
  })

  it('spirals out many nodes at the same place without overlaps', async () => {
    const graph = graphOf({ places: Array.from({ length: 60 }, () => paris), radius: 4 })
    const xy = await run(geo({ center: paris }), graph)
    expect(overlaps(graph, xy, 2)).toBe(0)
    let x = 0
    let y = 0
    for (let index = 0; index < 60; index++) {
      x += point(xy, index)[0] / 60
      y += point(xy, index)[1] / 60
    }
    expect(Math.hypot(x, y)).toBeLessThan(10)
    for (let index = 0; index < 60; index++) {
      expect(Math.hypot(...point(xy, index))).toBeLessThan(10 * Math.sqrt(60))
    }
  })

  it('never leaves an overlap with mixed sizes, and repeats its result', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const next = random(seed)
      const count = 120
      const places = Array.from({ length: count }, (_, at) =>
        at > 0 && next() < 0.3
          ? { ...paris }
          : { longitude: 2 + next() * 0.4, latitude: 48.7 + next() * 0.3 },
      )
      const radius = Array.from({ length: count }, () => 2 + next() * 8)
      const graph = graphOf({ places, radius })
      const layout = geo({ center: paris, scale: 30000 + next() * 60000, spacing: 1 })
      const xy = await run(layout, graph)
      expect(overlaps(graph, xy, 1)).toBe(0)
      const again = await run(layout, graph)
      expect(again).toEqual(xy)
    }
  })

  it('keeps an isolated node exactly at its place', async () => {
    const graph = graphOf({ places: [paris, { longitude: 2.45, latitude: 48.9 }, paris] })
    const xy = await run(geo({ center: paris, scale: 10000 }), graph)
    expect(point(xy, 1)[0]).toBeCloseTo((projectLongitude(2.45) - projectLongitude(2.35)) * 1e4, 1)
    expect(point(xy, 1)[1]).toBeCloseTo((projectLatitude(48.9) - projectLatitude(48.86)) * 1e4, 1)
  })

  it('leaves fixed nodes in place and moves free nodes off them', async () => {
    const graph = graphOf({ places: [paris, paris], fixed: [[2, 0, 0]] })
    const xy = await run(geo({ center: paris, scale: 1, spacing: 2 }), graph)
    expect(point(xy, 2)).toEqual([0, 0])
    expect(overlaps(graph, xy, 2)).toBe(0)
  })

  it('puts nodes without coordinates near their neighbors, else beside the others', async () => {
    const graph = graphOf({
      places: [paris, tokyo, {}, { longitude: Number.NaN, latitude: 3 }, { longitude: null }],
      edges: [2, 1, 3, 2],
    })
    const xy = await run(geo({ scale: 1 }), graph)
    const near = (a: number, b: number) =>
      Math.hypot(point(xy, a)[0] - point(xy, b)[0], point(xy, a)[1] - point(xy, b)[1])
    expect(near(2, 1)).toBeLessThan(20)
    expect(near(3, 2)).toBeLessThan(20)
    expect(point(xy, 4)[0]).toBeGreaterThan(point(xy, 1)[0])
    expect(overlaps(graph, xy, 0)).toBe(0)
  })

  it('lines nodes up in a grid when none has coordinates', async () => {
    const graph = graphOf({ places: [{}, {}, {}, {}] })
    const xy = await run(geo(), graph)
    expect(overlaps(graph, xy, 0)).toBe(0)
    expect(point(xy, 0)[1]).toBe(point(xy, 1)[1])
  })

  it('chooses a scale from the data, whatever the size of the region', async () => {
    const next = random(7)
    const offsets = Array.from({ length: 200 }, () => [next() - 0.5, next() - 0.5] as const)
    const at = (size: number) =>
      graphOf({
        places: offsets.map(([dx, dy]) => ({ longitude: dx * size, latitude: dy * size })),
      })
    const widthOf = (xy: Float32Array) => {
      let width = 0
      for (let index = 0; index < 200; index++) {
        width = Math.max(width, Math.abs(point(xy, index)[0]))
      }
      return width
    }
    const wide = widthOf(await run(geo(), at(10)))
    const narrow = widthOf(await run(geo(), at(0.01)))
    expect(narrow / wide).toBeGreaterThan(0.8)
    expect(narrow / wide).toBeLessThan(1.25)
    expect(wide).toBeGreaterThan(10 * 8)
    expect(wide).toBeLessThan(10 * 100)
  })

  it('falls back to the defaults on invalid numbers', async () => {
    const graph = graphOf({ places: [paris, tokyo, paris] })
    const fallback = await run(geo(), graph)
    const invalid = await run(
      geo({ scale: -1, spacing: Number.NaN, center: { longitude: Number.NaN, latitude: 0 } }),
      graph,
    )
    expect(invalid).toEqual(fallback)
  })

  it('keeps the containers of groups apart', async () => {
    const { graph } = groupedGraph()
    const sample: LayoutGraph = {
      ...graph,
      datum: (index) => ({
        longitude: (graph.xy[index * 2] ?? 0) / 100,
        latitude: (graph.xy[index * 2 + 1] ?? 0) / 100,
      }),
    }
    const xy = await run(geo(), sample)
    expect(smallestGap(sample, xy)).toBeGreaterThan(8)
  })

  it('describes itself as an instant layout that redoes every node', () => {
    const layout = geo({ scale: 4 })
    expect(layout.name).toBe('geo')
    expect(layout.incremental).toBe(false)
    expect(layout.options).toEqual({ scale: 4 })
  })

  it('types its channels', () => {
    geo<{ lon: number; lat: number | null; name: string }>({ longitude: 'lon', latitude: 'lat' })
    // @ts-expect-error
    geo<{ lon: number; name: string }>({ longitude: 'name' })
    geo<{ lon: number }>({ longitude: (item) => item.lon, order: 'degree' })
    // @ts-expect-error
    geo({ center: [2, 48] })
  })
})
