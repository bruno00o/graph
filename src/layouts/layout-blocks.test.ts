import { describe, expect, it } from 'vitest'
import { projectLatitude, projectLongitude } from '../core/geo'
import type { Key, Layout, LayoutBlocks, LayoutGraph, Point } from '../types'
import { force } from './force/index'
import { geo, grid, layers, placed, radial, rings } from './index'

interface Place {
  readonly longitude?: number
  readonly latitude?: number
}

interface Shape {
  readonly radius: readonly number[]
  readonly members?: readonly (readonly Key[])[]
  readonly items?: readonly unknown[]
  readonly edges?: readonly number[]
  readonly inside?: readonly unknown[][]
}

function graphOf({
  radius,
  members = [],
  items = [],
  edges = [],
  inside = [],
}: Shape): LayoutGraph {
  const capacity = radius.length
  const blocks: LayoutBlocks | undefined =
    members.length === 0
      ? undefined
      : {
          size: Uint32Array.from(radius, (_, index) => members[index]?.length ?? 0),
          items: (index) => inside[index] ?? [],
          keys: (index) => members[index] ?? [],
        }
  return {
    capacity,
    alive: new Uint8Array(capacity).fill(1),
    movable: new Uint8Array(capacity).fill(1),
    xy: Float32Array.from({ length: capacity * 2 }, (_, at) => (at % 7) - 3),
    radius: Float32Array.from(radius),
    edges: Uint32Array.from(edges),
    keys: radius.map((_, index) => `n${index}`),
    datum: (index) => items[index],
    ...(blocks ? { blocks } : {}),
  }
}

function run(layout: Layout, graph: LayoutGraph): Promise<Float32Array> {
  return new Promise((resolve) => layout.start(graph, { progress: () => {}, end: resolve }))
}

function point(xy: Float32Array, index: number): [number, number] {
  return [xy[index * 2] ?? Number.NaN, xy[index * 2 + 1] ?? Number.NaN]
}

function gaps(xy: Float32Array, graph: LayoutGraph): number {
  let smallest = Number.POSITIVE_INFINITY
  for (let a = 0; a < graph.capacity; a++) {
    for (let b = a + 1; b < graph.capacity; b++) {
      const [ax, ay] = point(xy, a)
      const [bx, by] = point(xy, b)
      const gap = Math.hypot(ax - bx, ay - by) - (graph.radius[a] ?? 0) - (graph.radius[b] ?? 0)
      smallest = Math.min(smallest, gap)
    }
  }
  return smallest
}

const oneBlock = { radius: [100, 5, 5, 5], members: [['a', 'b', 'c']] }

describe('default gaps with blocks', () => {
  it('take the grid step from the largest place and the gap from the nodes', async () => {
    const xy = await run(grid(), graphOf(oneBlock))
    expect(point(xy, 1)[0] - point(xy, 0)[0]).toBe(224)
    const plain = await run(grid(), graphOf({ radius: oneBlock.radius }))
    expect(point(plain, 1)[0] - point(plain, 0)[0]).toBe(400)
  })

  it('keep a gap of 24 when every node is a block', async () => {
    const xy = await run(grid(), graphOf({ radius: [50, 50], members: [['a'], ['b']] }))
    expect(point(xy, 1)[0] - point(xy, 0)[0]).toBe(124)
  })

  it('size the boxes of a grid from the nodes', async () => {
    const graph = {
      ...graphOf(oneBlock),
      extents: Float32Array.from([120, 60, 5, 5, 5, 5, 5, 5]),
    }
    const xy = await run(grid(), graph)
    expect(point(xy, 1)[0] - point(xy, 0)[0]).toBe(264)
    expect(point(xy, 2)[1] - point(xy, 0)[1]).toBe(144)
  })

  it('space rings and radial walks by the nodes', async () => {
    const graph = graphOf({ ...oneBlock, edges: [0, 1, 0, 2, 0, 3] })
    for (const layout of [rings(), radial()]) {
      const xy = await run(layout, graph)
      const [cx, cy] = point(xy, 0)
      const [x, y] = point(xy, 1)
      expect(Math.hypot(x - cx, y - cy)).toBeCloseTo(224, 3)
    }
  })

  it('space layers by the nodes', async () => {
    const graph = graphOf({ radius: [100, 5, 5], members: [['a', 'b']], edges: [0, 1, 0, 2] })
    const xy = await run(layers(), graph)
    expect(point(xy, 1)[1] - point(xy, 0)[1]).toBeCloseTo(100 + 34 + 5, 3)
    expect(Math.abs(point(xy, 2)[0] - point(xy, 1)[0])).toBeCloseTo(20, 3)
    const plain = await run(layers(), graphOf({ radius: [100, 5, 5], edges: [0, 1, 0, 2] }))
    expect(point(plain, 1)[1] - point(plain, 0)[1]).toBeCloseTo(100 + 400 + 5, 3)
  })

  it('take the gap from the nodes inside unfolded groups too', async () => {
    const base = graphOf({ radius: [100, 5, 5, 5, 0], members: [['a', 'b', 'c']] })
    const graph: LayoutGraph = {
      ...base,
      alive: Uint8Array.from([1, 1, 1, 1, 0]),
      groups: {
        order: Uint32Array.of(4),
        parent: Int32Array.from([4, 4, 4, 4, -1]),
        padding: new Float32Array(5).fill(8),
        circle: new Uint8Array(5),
      },
    }
    const xy = await run(grid(), graph)
    expect(point(xy, 1)[0] - point(xy, 0)[0]).toBe(224)
  })

  it('leave given spacings alone', async () => {
    const xy = await run(grid({ spacing: 7 }), graphOf(oneBlock))
    expect(point(xy, 1)[0] - point(xy, 0)[0]).toBe(207)
  })

  it('keep blocks apart', async () => {
    for (const layout of [grid(), rings(), radial(), layers()]) {
      const graph = graphOf({ ...oneBlock, edges: [0, 1, 1, 2, 2, 3] })
      expect(gaps(await run(layout, graph), graph)).toBeGreaterThanOrEqual(-1e-3)
    }
  })
})

describe('turns', () => {
  it('lets force, rings and radial turn freely, flips layers and keeps the rest', () => {
    expect(force().turns).toBe('free')
    expect(rings().turns).toBe('free')
    expect(radial().turns).toBe('free')
    expect(layers().turns).toBe('flip')
    expect(grid().turns).toBe('none')
    expect(geo().turns).toBe('none')
    expect(placed(new Map()).turns).toBe('none')
  })
})

describe('placed with blocks', () => {
  const graph = graphOf({
    radius: [40, 5],
    members: [['a', 'b', 'c']],
    items: [{ id: 'group' }, { id: 'n1' }],
    inside: [[{ id: 'a' }, { id: 'b' }, { id: 'c' }]],
  })

  it('puts a block at the mean of the positions of its nodes', async () => {
    const positions = new Map<Key, Point>([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 30, y: 60 }],
      ['n1', { x: 5, y: 5 }],
    ])
    const xy = await run(placed(positions), graph)
    expect(point(xy, 0)).toEqual([15, 30])
    expect(point(xy, 1)).toEqual([5, 5])
  })

  it('reads the items of the nodes of a block through a function', async () => {
    const at: Record<string, Point> = { a: { x: 10, y: 0 }, c: { x: 20, y: 10 } }
    const xy = await run(
      placed((datum: { readonly id: string }) => at[datum.id]),
      graph as LayoutGraph<{ readonly id: string }>,
    )
    expect(point(xy, 0)).toEqual([15, 5])
  })

  it('prefers the position of the block itself', async () => {
    const positions = new Map<Key, Point>([
      ['n0', { x: -50, y: 50 }],
      ['a', { x: 0, y: 0 }],
    ])
    const xy = await run(placed(positions), graph)
    expect(point(xy, 0)).toEqual([-50, 50])
  })

  it('leaves a block without positions where it is', async () => {
    const xy = await run(placed(new Map<Key, Point>([['zz', { x: 1, y: 1 }]])), graph)
    expect(point(xy, 0)).toEqual(point(graph.xy, 0))
  })
})

describe('geo with blocks', () => {
  it('puts a block at the mean of the places of its nodes', async () => {
    const paris: Place = { longitude: 2.35, latitude: 48.86 }
    const tokyo: Place = { longitude: 139.69, latitude: 35.68 }
    const lima: Place = { longitude: -77.04, latitude: -12.05 }
    const graph = graphOf({
      radius: [5, 5],
      members: [[], ['a', 'b']],
      items: [lima, {}],
      inside: [[], [paris, tokyo]],
    })
    const xy = await run(geo({ scale: 1, center: { longitude: 0, latitude: 0 } }), graph)
    const x = (projectLongitude(2.35) + projectLongitude(139.69)) / 2 - projectLongitude(0)
    const y = (projectLatitude(48.86) + projectLatitude(35.68)) / 2 - projectLatitude(0)
    expect(point(xy, 1)[0]).toBeCloseTo(x, 3)
    expect(point(xy, 1)[1]).toBeCloseTo(y, 3)
    expect(point(xy, 0)[0]).toBeCloseTo(projectLongitude(-77.04) - projectLongitude(0), 3)
  })

  it('places a block whose nodes have no place near its neighbors', async () => {
    const graph = graphOf({
      radius: [5, 5],
      members: [[], ['a']],
      items: [{ longitude: 10, latitude: 10 }, {}],
      inside: [[], [{}]],
      edges: [0, 1],
    })
    const xy = await run(geo({ scale: 1 }), graph)
    const [ax, ay] = point(xy, 0)
    const [bx, by] = point(xy, 1)
    expect(Math.hypot(ax - bx, ay - by)).toBeLessThan(30)
  })
})
