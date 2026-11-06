import { describe, expect, it } from 'vitest'
import type { Key, Layout, LayoutGraph } from '../types'
import { grid, radial, rings } from './index'

interface Shape {
  readonly points: readonly (readonly [number, number])[]
  readonly edges?: readonly number[]
  readonly fixed?: readonly number[]
  readonly data?: readonly unknown[]
}

function graphOf({ points, edges = [], fixed = [], data = [] }: Shape): LayoutGraph {
  const capacity = points.length
  const keys: Key[] = points.map((_, index) => `n${index}`)
  return {
    capacity,
    alive: new Uint8Array(capacity).fill(1),
    movable: Uint8Array.from(points, (_, index) => (fixed.includes(index) ? 0 : 1)),
    xy: Float32Array.from(points.flat()),
    radius: new Float32Array(capacity).fill(5),
    edges: Uint32Array.from(edges),
    keys,
    datum: (index) => data[index],
  }
}

function run(layout: Layout, graph: LayoutGraph): Promise<Float32Array> {
  return new Promise((resolve) => layout.start(graph, { progress: () => {}, end: resolve }))
}

function point(xy: Float32Array, index: number): [number, number] {
  return [xy[index * 2] ?? Number.NaN, xy[index * 2 + 1] ?? Number.NaN]
}

const origin = (count: number) => Array.from({ length: count }, () => [0, 0] as const)

describe('grid', () => {
  it('lines nodes up in rows around their centroid and leaves fixed nodes alone', async () => {
    const graph = graphOf({ points: [...origin(5), [500, 500]], fixed: [5] })
    const xy = await run(grid(), graph)
    expect(point(xy, 0)).toEqual([-34, -17])
    expect(point(xy, 2)).toEqual([34, -17])
    expect(point(xy, 3)).toEqual([-34, 17])
    expect(point(xy, 5)).toEqual([500, 500])
  })

  it('follows the order and the number of columns', async () => {
    const graph = graphOf({ points: origin(3), data: [{ rank: 3 }, { rank: 1 }, { rank: 2 }] })
    const layout = grid<{ rank: number }>({
      columns: 1,
      spacing: 0,
      order: (a, b) => a.rank - b.rank,
    })
    const xy = await run(layout, graph)
    expect([point(xy, 1), point(xy, 2), point(xy, 0)]).toEqual([
      [0, -10],
      [0, 0],
      [0, 10],
    ])
  })

  it('spaces places by the gap between the borders of the largest nodes', async () => {
    const graph = graphOf({ points: origin(2) })
    const gap = await run(grid({ columns: 2, spacing: 6 }), graph)
    expect(point(gap, 1)[0] - point(gap, 0)[0]).toBe(16)
    const fallback = await run(grid({ columns: 2, spacing: -1 }), graph)
    expect(point(fallback, 1)[0] - point(fallback, 0)[0]).toBe(34)
  })

  it('describes itself as a layout that redoes every node when nodes arrive', () => {
    const layout = grid({ columns: 4 })
    expect(layout.name).toBe('grid')
    expect(layout.incremental).toBe(false)
    expect(layout.options).toEqual({ columns: 4 })
  })

  it('reports nothing once stopped', async () => {
    let ended = false
    const run = grid().start(graphOf({ points: origin(2) }), {
      progress: () => {},
      end: () => {
        ended = true
      },
    })
    run.stop()
    await Promise.resolve()
    expect(ended).toBe(false)
  })
})

describe('rings', () => {
  it('puts the busiest node in the middle and fills rings outward', async () => {
    const points = origin(8)
    const edges = [3, 0, 3, 1, 3, 2]
    const xy = await run(rings({ spacing: 0 }), graphOf({ points, edges }))
    expect(point(xy, 3)).toEqual([0, 0])
    for (const index of [0, 1, 2, 4, 5, 6]) {
      const [x, y] = point(xy, index)
      expect(Math.hypot(x, y)).toBeCloseTo(10, 4)
    }
    const [x, y] = point(xy, 7)
    expect(Math.hypot(x, y)).toBeCloseTo(20, 4)
  })

  it('rings a fixed center without moving it', async () => {
    const graph = graphOf({
      points: [
        [100, 0],
        [0, 0],
        [0, 0],
      ],
      fixed: [0],
    })
    const xy = await run(rings({ center: 'n0', spacing: 0 }), graph)
    expect(point(xy, 0)).toEqual([100, 0])
    for (const index of [1, 2]) {
      const [x, y] = point(xy, index)
      expect(Math.hypot(x - 100, y)).toBeCloseTo(10, 4)
    }
  })
})

describe('radial', () => {
  it('places nodes on rings by their distance from the root, children beside their parent', async () => {
    const graph = graphOf({ points: origin(4), edges: [0, 1, 1, 2] })
    const xy = await run(radial({ root: 'n0', spacing: 0 }), graph)
    const [ax, ay] = point(xy, 0)
    const [bx, by] = point(xy, 1)
    const [cx, cy] = point(xy, 2)
    const [dx, dy] = point(xy, 3)
    expect(Math.hypot(bx - ax, by - ay)).toBeCloseTo(10, 4)
    expect(Math.hypot(cx - ax, cy - ay)).toBeCloseTo(20, 4)
    expect(Math.atan2(cy - ay, cx - ax)).toBeCloseTo(Math.atan2(by - ay, bx - ax), 4)
    expect(Math.hypot(dx - ax, dy - ay)).toBeCloseTo(30, 4)
  })

  it('starts from the busiest moving node', async () => {
    const graph = graphOf({ points: origin(4), edges: [2, 0, 2, 1, 2, 3] })
    const xy = await run(radial({ spacing: 0 }), graph)
    expect(point(xy, 2)).toEqual([0, 0])
  })

  it('centers on a fixed root and walks only through moving nodes', async () => {
    const graph = graphOf({
      points: [
        [0, 0],
        [50, 50],
        [0, 0],
        [0, 0],
        [-80, 0],
      ],
      edges: [1, 0, 1, 2, 1, 3, 4, 0],
      fixed: [1, 4],
    })
    const xy = await run(radial({ root: 'n1', spacing: 0 }), graph)
    expect(point(xy, 1)).toEqual([50, 50])
    expect(point(xy, 4)).toEqual([-80, 0])
    for (const index of [0, 2, 3]) {
      const [x, y] = point(xy, index)
      expect(Math.hypot(x - 50, y - 50)).toBeCloseTo(10, 4)
    }
  })
})

describe('layout options', () => {
  it('types orders, centers and roots', () => {
    grid<{ rank: number }>({ order: (a, b) => a.rank - b.rank, columns: 3 })
    // @ts-expect-error
    grid({ order: 'name' })
    rings({ center: 'a', order: 'degree', spacing: 40 })
    radial({ root: ['a', 1] })
    // @ts-expect-error
    radial({ root: {} })
  })
})
