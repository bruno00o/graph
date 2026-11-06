import { describe, expect, it } from 'vitest'
import type { Key, LayoutGraph } from '../../types'
import { distinct } from './adjacency'
import { acyclicRanks } from './cycles'
import { type LayersOptions, layers } from './index'
import { components, layerNodes } from './ranks'

interface Shape {
  readonly count: number
  readonly edges?: readonly number[]
  readonly fixed?: readonly number[]
  readonly points?: readonly (readonly [number, number])[]
  readonly radius?: number
}

function graphOf({ count, edges = [], fixed = [], points = [], radius = 5 }: Shape): LayoutGraph {
  const keys: Key[] = Array.from({ length: count }, (_, index) => `n${index}`)
  return {
    capacity: count,
    alive: new Uint8Array(count).fill(1),
    movable: Uint8Array.from(keys, (_, index) => (fixed.includes(index) ? 0 : 1)),
    xy: Float32Array.from(keys.flatMap((_, index) => points[index] ?? [0, 0])),
    radius: new Float32Array(count).fill(radius),
    edges: Uint32Array.from(edges),
    keys,
    datum: () => undefined,
  }
}

function run(graph: LayoutGraph, options: LayersOptions = {}): Promise<Float32Array> {
  return new Promise((resolve) =>
    layers(options).start(graph, { progress: () => {}, end: resolve }),
  )
}

function point(xy: Float32Array, index: number): [number, number] {
  return [xy[index * 2] ?? Number.NaN, xy[index * 2 + 1] ?? Number.NaN]
}

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hierarchy(count: number, extra: number, seed: number): number[] {
  const next = random(seed)
  const level = [0]
  const edges: number[] = []
  for (let node = 1; node < count; node++) {
    const parent = Math.floor(next() * node)
    level[node] = (level[parent] ?? 0) + 1
    edges.push(parent, node)
  }
  for (let k = 0; k < extra; k++) {
    const a = Math.floor(next() * count)
    const b = Math.floor(next() * count)
    if (a !== b) edges.push(Math.min(a, b), Math.max(a, b))
  }
  return edges
}

function rows(xy: Float32Array, count: number): Map<number, number[]> {
  const byRow = new Map<number, number[]>()
  for (let index = 0; index < count; index++) {
    const [x, y] = point(xy, index)
    byRow.set(y, [...(byRow.get(y) ?? []), x])
  }
  return byRow
}

function crossings(xy: Float32Array, edges: readonly number[]): number {
  let total = 0
  for (let a = 0; a < edges.length; a += 2) {
    for (let b = a + 2; b < edges.length; b += 2) {
      const [ax, ay] = point(xy, edges[a] ?? 0)
      const [bx, by] = point(xy, edges[a + 1] ?? 0)
      const [cx, cy] = point(xy, edges[b] ?? 0)
      const [dx, dy] = point(xy, edges[b + 1] ?? 0)
      if (ay !== cy || by !== dy) continue
      if ((ax - cx) * (bx - dx) < 0) total++
    }
  }
  return total
}

describe('layers', () => {
  it('points every edge of an acyclic graph from a higher layer to a lower one', async () => {
    const edges = hierarchy(200, 120, 3)
    const xy = await run(graphOf({ count: 200, edges }))
    for (let at = 0; at < edges.length; at += 2) {
      expect(point(xy, edges[at + 1] ?? 0)[1]).toBeGreaterThan(point(xy, edges[at] ?? 0)[1])
    }
  })

  it('keeps nodes of a layer apart by their radii and the node spacing', async () => {
    const graph = graphOf({ count: 300, edges: hierarchy(300, 200, 5), radius: 6 })
    const xy = await run(graph, { nodeSpacing: 10 })
    for (const row of rows(xy, 300).values()) {
      row.sort((a, b) => a - b)
      for (let at = 1; at < row.length; at++) {
        expect((row[at] ?? 0) - (row[at - 1] ?? 0)).toBeGreaterThanOrEqual(6 + 6 + 10 - 1e-3)
      }
    }
  })

  it('spaces layers by the largest radii and the layer spacing', async () => {
    const xy = await run(graphOf({ count: 3, edges: [0, 1, 1, 2] }), { layerSpacing: 30 })
    expect(point(xy, 1)[1] - point(xy, 0)[1]).toBeCloseTo(40, 4)
    expect(point(xy, 2)[1] - point(xy, 1)[1]).toBeCloseTo(40, 4)
    expect(point(xy, 0)[0]).toBeCloseTo(point(xy, 2)[0], 4)
  })

  it('gives the same result for the same graph', async () => {
    const shape = { count: 400, edges: hierarchy(400, 300, 8) }
    const first = await run(graphOf(shape))
    const second = await run(graphOf(shape))
    expect(Array.from(second)).toEqual(Array.from(first))
  })

  it('turns the layers in each direction', async () => {
    const shape = { count: 3, edges: [0, 1, 0, 2] }
    const down = await run(graphOf(shape))
    const up = await run(graphOf(shape), { direction: 'up' })
    const right = await run(graphOf(shape), { direction: 'right' })
    const left = await run(graphOf(shape), { direction: 'left' })
    expect(point(down, 1)[1]).toBeGreaterThan(point(down, 0)[1])
    expect(point(up, 1)[1]).toBeLessThan(point(up, 0)[1])
    expect(point(right, 1)[0]).toBeGreaterThan(point(right, 0)[0])
    expect(point(left, 1)[0]).toBeLessThan(point(left, 0)[0])
    expect(point(down, 1)[0]).toBeLessThan(point(down, 2)[0])
    expect(point(right, 1)[1]).toBeLessThan(point(right, 2)[1])
    expect(point(right, 1)[0]).toBeCloseTo(point(right, 2)[0], 4)
  })

  it('breaks cycles by reversing as few edges as it can', async () => {
    const edges = [0, 1, 1, 2, 2, 3, 3, 0, 3, 4, 4, 5]
    const xy = await run(graphOf({ count: 6, edges }))
    let upward = 0
    for (let at = 0; at < edges.length; at += 2) {
      const from = point(xy, edges[at] ?? 0)[1]
      const to = point(xy, edges[at + 1] ?? 0)[1]
      expect(to).not.toBe(from)
      if (to < from) upward++
    }
    expect(upward).toBe(1)
  })

  it('puts the roots on the first layer, even when edges lead into them', async () => {
    const xy = await run(graphOf({ count: 4, edges: [0, 1, 1, 2, 3, 2] }), { root: 'n2' })
    const top = Math.min(...[0, 1, 2, 3].map((index) => point(xy, index)[1]))
    expect(point(xy, 2)[1]).toBe(top)
    expect(point(xy, 1)[1]).toBeGreaterThan(top)
    expect(point(xy, 3)[1]).toBeGreaterThan(top)
  })

  it('shortens long edges by lowering nodes that only feed deeper ones', async () => {
    const xy = await run(graphOf({ count: 5, edges: [0, 1, 1, 2, 2, 3, 4, 3] }))
    expect(point(xy, 4)[1]).toBe(point(xy, 2)[1])
  })

  it('orders each layer to avoid crossings', async () => {
    const edges = [0, 3, 1, 2, 3, 5, 2, 4, 0, 6, 6, 5]
    const xy = await run(graphOf({ count: 7, edges }))
    expect(crossings(xy, edges)).toBe(0)
  })

  it('leaves fixed nodes in place and centers the others on where they were', async () => {
    const points: [number, number][] = [
      [100, 100],
      [110, 90],
      [90, 110],
      [-500, 40],
    ]
    const xy = await run(graphOf({ count: 4, edges: [0, 1, 1, 2, 3, 0], fixed: [3], points }))
    expect(point(xy, 3)).toEqual([-500, 40])
    const ys = [0, 1, 2].map((index) => point(xy, index)[1])
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(100, 4)
    expect(point(xy, 0)[0]).toBeCloseTo(100, 4)
  })

  it('places separate components and lone nodes side by side', async () => {
    const xy = await run(graphOf({ count: 7, edges: [0, 1, 0, 2, 3, 4] }), { nodeSpacing: 10 })
    const boxes = [[0, 1, 2], [3, 4], [5], [6]].map((members) => {
      const xs = members.map((index) => point(xy, index)[0])
      const ys = members.map((index) => point(xy, index)[1])
      return [Math.min(...xs) - 5, Math.max(...xs) + 5, Math.min(...ys) - 5, Math.max(...ys) + 5]
    })
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const [ax0 = 0, ax1 = 0, ay0 = 0, ay1 = 0] = boxes[a] ?? []
        const [bx0 = 0, bx1 = 0, by0 = 0, by1 = 0] = boxes[b] ?? []
        expect(ax1 <= bx0 || bx1 <= ax0 || ay1 <= by0 || by1 <= ay0).toBe(true)
      }
    }
    expect(point(xy, 3)[1]).toBe(point(xy, 0)[1])
  })

  it('ignores edges to fixed nodes and loops', async () => {
    const graph = graphOf({
      count: 3,
      edges: [0, 1, 2, 0],
      fixed: [2],
      points: [
        [0, 0],
        [0, 0],
        [9, 9],
      ],
    })
    const xy = await run(graph)
    expect(point(xy, 1)[1]).toBeGreaterThan(point(xy, 0)[1])
    expect(point(xy, 2)).toEqual([9, 9])
  })

  it('describes itself as a layout that redoes every node when nodes arrive', () => {
    const layout = layers({ direction: 'right', nodeSpacing: 12 })
    expect(layout.name).toBe('layers')
    expect(layout.incremental).toBe(false)
    expect(layout.options).toEqual({ direction: 'right', nodeSpacing: 12 })
  })

  it('types its options', () => {
    layers({ direction: 'left', root: ['a', 2], layerSpacing: 40, nodeSpacing: 8 })
    layers({ root: 'a' })
    // @ts-expect-error
    layers({ direction: 'sideways' })
    // @ts-expect-error
    layers({ root: {} })
  })
})

describe('layer assignment', () => {
  function total(successors: ReturnType<typeof distinct>, layer: Int32Array): number {
    let sum = 0
    for (let node = 0; node + 1 < successors.start.length; node++) {
      for (let k = successors.start[node] ?? 0; k < (successors.start[node + 1] ?? 0); k++) {
        sum += (layer[successors.items[k] ?? 0] ?? 0) - (layer[node] ?? 0)
      }
    }
    return sum
  }

  function shortest(count: number, successors: ReturnType<typeof distinct>): number {
    let best = Number.POSITIVE_INFINITY
    const layer = new Int32Array(count)
    const visit = (node: number) => {
      if (node === count) {
        for (let from = 0; from < count; from++) {
          for (let k = successors.start[from] ?? 0; k < (successors.start[from + 1] ?? 0); k++) {
            if ((layer[successors.items[k] ?? 0] ?? 0) <= (layer[from] ?? 0)) return
          }
        }
        best = Math.min(best, total(successors, layer))
        return
      }
      for (let value = 0; value < count; value++) {
        layer[node] = value
        visit(node + 1)
      }
    }
    visit(0)
    return best
  }

  it('minimizes the total edge length on small acyclic graphs', () => {
    const next = random(21)
    for (let trial = 0; trial < 12; trial++) {
      const count = 6
      const from: number[] = []
      const to: number[] = []
      for (let k = 0; k < 8; k++) {
        const a = Math.floor(next() * count)
        const b = Math.floor(next() * count)
        if (a !== b) {
          from.push(Math.min(a, b))
          to.push(Math.max(a, b))
        }
      }
      const successors = distinct(count, Int32Array.from(from), Int32Array.from(to), from.length)
      const topological = Int32Array.from({ length: count }, (_, at) => at)
      const component = components(count, successors)
      const layer = layerNodes(count, successors, topological, component, new Uint8Array(count))
      expect(total(successors, layer)).toBe(shortest(count, successors))
    }
  })

  it('orders an acyclic graph topologically and puts roots first', () => {
    const from = Int32Array.from([0, 1, 2, 3])
    const to = Int32Array.from([1, 2, 3, 4])
    const rank = acyclicRanks(5, from, to, new Int32Array(0))
    for (let edge = 0; edge < 4; edge++) {
      expect(rank[from[edge] ?? 0]).toBeLessThan(rank[to[edge] ?? 0] ?? 0)
    }
    const rooted = acyclicRanks(5, from, to, Int32Array.from([3]))
    expect(rooted[3]).toBe(0)
  })
})
