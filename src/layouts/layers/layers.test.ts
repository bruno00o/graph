import { describe, expect, it } from 'vitest'
import type { Key, LayoutGraph } from '../../types'
import { components, distinct } from './adjacency'
import { acyclicRanks } from './cycles'
import { type LayersOptions, layers } from './index'
import { layerNodes } from './ranks'
import { simplex } from './simplex'

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

  it('keeps a dense graph with long edges about as wide as its widest layer', async () => {
    const count = 1500
    const xy = await run(graphOf({ count, edges: hierarchy(count, 1500, 12) }), { nodeSpacing: 10 })
    let widest = 0
    for (const row of rows(xy, count).values()) widest = Math.max(widest, row.length * 20 - 10)
    const xs = Array.from({ length: count }, (_, index) => point(xy, index)[0])
    expect(Math.max(...xs) - Math.min(...xs) + 10).toBeLessThan(widest * 1.8)
  })

  it('keeps the edges of a dense graph short across the layers', async () => {
    const count = 600
    const edges = hierarchy(count, 900, 4)
    const xy = await run(graphOf({ count, edges }), { nodeSpacing: 10 })
    let across = 0
    for (let at = 0; at < edges.length; at += 2) {
      across += Math.abs(point(xy, edges[at] ?? 0)[0] - point(xy, edges[at + 1] ?? 0)[0])
    }
    expect(across / (edges.length / 2)).toBeLessThan(750)
  })

  it('packs separate components into a box close to a square', async () => {
    const chain = Array.from({ length: 39 }, (_, at) => [at, at + 1]).flat()
    const count = 40 + 60
    const xy = await run(graphOf({ count, edges: chain }), { nodeSpacing: 10, layerSpacing: 10 })
    const xs = Array.from({ length: count }, (_, index) => point(xy, index)[0])
    const ys = Array.from({ length: count }, (_, index) => point(xy, index)[1])
    const width = Math.max(...xs) - Math.min(...xs) + 10
    const height = Math.max(...ys) - Math.min(...ys) + 10
    expect(Math.max(width, height) / Math.min(width, height)).toBeLessThan(1.5)
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

  it('spaces wide boxes by their width along a layer and by their height across', async () => {
    const count = 4
    const graph = {
      ...graphOf({ count, edges: [0, 1, 0, 2, 0, 3] }),
      radius: new Float32Array(count).fill(Math.hypot(50, 10)),
      extents: Float32Array.from({ length: count * 2 }, (_, at) => (at % 2 === 0 ? 50 : 10)),
    }
    const down = await run(graph, { nodeSpacing: 10, layerSpacing: 20 })
    const xs = [1, 2, 3].map((index) => point(down, index)[0]).sort((a, b) => a - b)
    expect((xs[1] ?? 0) - (xs[0] ?? 0)).toBeCloseTo(110, 3)
    expect((xs[2] ?? 0) - (xs[1] ?? 0)).toBeCloseTo(110, 3)
    expect(point(down, 1)[1] - point(down, 0)[1]).toBeCloseTo(40, 3)
    const right = await run(graph, { direction: 'right', nodeSpacing: 10, layerSpacing: 20 })
    const ys = [1, 2, 3].map((index) => point(right, index)[1]).sort((a, b) => a - b)
    expect((ys[1] ?? 0) - (ys[0] ?? 0)).toBeCloseTo(30, 3)
    expect(point(right, 1)[0] - point(right, 0)[0]).toBeCloseTo(120, 3)
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

  interface Prepared {
    readonly count: number
    readonly successors: ReturnType<typeof distinct>
    readonly topological: Int32Array
    readonly component: Int32Array
  }

  function prepare(
    count: number,
    extra: number,
    seed: number,
    cyclic: boolean,
    connected = true,
  ): Prepared {
    const next = random(seed)
    const from: number[] = []
    const to: number[] = []
    if (connected) {
      for (let node = 1; node < count; node++) {
        from.push(Math.floor(next() * node))
        to.push(node)
      }
    }
    for (let k = 0; k < extra; k++) {
      const a = Math.floor(next() * count)
      const b = Math.floor(next() * count)
      if (a === b) continue
      from.push(cyclic ? a : Math.min(a, b))
      to.push(cyclic ? b : Math.max(a, b))
    }
    const tails = Int32Array.from(from)
    const heads = Int32Array.from(to)
    const rank = acyclicRanks(count, tails, heads, new Int32Array(0))
    for (let edge = 0; edge < tails.length; edge++) {
      const tail = tails[edge] ?? 0
      const head = heads[edge] ?? 0
      if ((rank[tail] ?? 0) > (rank[head] ?? 0)) {
        tails[edge] = head
        heads[edge] = tail
      }
    }
    const successors = distinct(count, tails, heads, tails.length)
    const topological = new Int32Array(count)
    for (let node = 0; node < count; node++) topological[rank[node] ?? 0] = node
    return { count, successors, topological, component: components(count, successors) }
  }

  function assign({ count, successors, topological, component }: Prepared): Int32Array {
    return layerNodes(count, successors, topological, component, new Uint8Array(count))
  }

  function downward(successors: ReturnType<typeof distinct>, layer: Int32Array): boolean {
    for (let node = 0; node + 1 < successors.start.length; node++) {
      for (let k = successors.start[node] ?? 0; k < (successors.start[node + 1] ?? 0); k++) {
        if ((layer[successors.items[k] ?? 0] ?? 0) <= (layer[node] ?? 0)) return false
      }
    }
    return true
  }

  function tightParts({ count, successors }: Prepared, layer: Int32Array): number {
    const group = Int32Array.from({ length: count }, (_, node) => node)
    const find = (node: number): number => {
      let at = node
      while ((group[at] ?? at) !== at) at = group[at] ?? at
      return at
    }
    let parts = count
    for (let node = 0; node < count; node++) {
      for (let k = successors.start[node] ?? 0; k < (successors.start[node + 1] ?? 0); k++) {
        const target = successors.items[k] ?? 0
        if ((layer[target] ?? 0) - (layer[node] ?? 0) !== 1) continue
        const a = find(node)
        const b = find(target)
        if (a === b) continue
        group[Math.max(a, b)] = Math.min(a, b)
        parts--
      }
    }
    return parts
  }

  it('matches the minimum total edge length of a sample of small graphs', () => {
    const minimum = [
      28, 64, 182, 70, 184, 10, 20, 17, 35, 208, 7, 21, 51, 86, 31, 65, 7, 58, 75, 21, 270, 4, 72,
      0, 35, 36, 113, 1, 35, 69, 127, 54, 5, 34, 27, 28, 262, 4, 16, 35, 133, 169, 98, 2, 22, 142,
      121, 114, 10, 19, 145, 13, 144, 331, 7, 15, 135, 141, 136, 6,
    ]
    minimum.forEach((expected, at) => {
      const seed = at + 1
      const count = 3 + ((seed * 7) % 38)
      const extra = (seed * 13) % (2 * count + 1)
      const prepared = prepare(count, extra, seed, seed % 3 === 0, seed % 4 !== 0)
      const layer = assign(prepared)
      expect(downward(prepared.successors, layer)).toBe(true)
      expect(total(prepared.successors, layer)).toBe(expected)
    })
  })

  it('reaches the minimum total edge length on larger graphs, with or without cycles', () => {
    const cases = [
      { count: 2000, extra: 1000, seed: 31, cyclic: false, minimum: 5106 },
      { count: 2000, extra: 1000, seed: 32, cyclic: true, minimum: 20048 },
      { count: 3000, extra: 4500, seed: 33, cyclic: false, minimum: 20924 },
    ]
    for (const { count, extra, seed, cyclic, minimum } of cases) {
      const prepared = prepare(count, extra, seed, cyclic)
      const layer = assign(prepared)
      expect(downward(prepared.successors, layer)).toBe(true)
      expect(total(prepared.successors, layer)).toBe(minimum)
    }
  })

  it('connects every component by edges one layer long', () => {
    for (const [seed, cyclic, connected] of [
      [41, false, true],
      [42, true, true],
      [43, false, false],
    ] as const) {
      const prepared = prepare(1500, 1500, seed, cyclic, connected)
      const layer = assign(prepared)
      const parts = new Set(prepared.component).size
      expect(tightParts(prepared, layer)).toBe(parts)
    }
  })

  it('gives every edge of a tree a span of one layer', () => {
    const prepared = prepare(3000, 0, 35, false)
    const layer = assign(prepared)
    expect(downward(prepared.successors, layer)).toBe(true)
    expect(total(prepared.successors, layer)).toBe(2999)
  })

  it('still points every edge down when the pivot budget runs out', () => {
    for (const cyclic of [false, true]) {
      const { count, successors, topological } = prepare(1500, 1500, 36, cyclic)
      for (const budget of [0, 1, 10, 100]) {
        expect(downward(successors, simplex(count, successors, topological, budget))).toBe(true)
      }
    }
  })

  it('layers a random acyclic graph of 20,000 nodes and 30,000 edges in well under a second', () => {
    const prepared = prepare(20000, 10000, 34, false)
    const started = performance.now()
    const layer = assign(prepared)
    expect(performance.now() - started).toBeLessThan(1000)
    expect(total(prepared.successors, layer)).toBe(51333)
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
