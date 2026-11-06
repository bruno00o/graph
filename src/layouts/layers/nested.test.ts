import { describe, expect, it } from 'vitest'
import type { LayoutGraph } from '../../types'
import { type LayersDirection, type LayersOptions, layers } from './index'

interface Sample {
  readonly groups: readonly number[]
  readonly leaves: readonly number[]
  readonly edges: readonly number[]
  readonly fixed?: readonly number[]
  readonly label?: number
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

function graphOf({ groups, leaves, edges, fixed = [], label = 0 }: Sample): LayoutGraph {
  const capacity = groups.length + leaves.length
  const parent = Int32Array.from([...groups, ...leaves])
  const alive = new Uint8Array(capacity).fill(1, groups.length)
  const movable = alive.slice()
  for (const index of fixed) movable[index] = 0
  const next = random(capacity)
  const xy = new Float32Array(capacity * 2).map(() => (next() - 0.5) * 400)
  const order = Array.from(groups.keys()).sort(
    (a, b) => depthOf(groups, a) - depthOf(groups, b) || a - b,
  )
  const labelSpace = new Float32Array(capacity * 4)
  for (const group of order) labelSpace[group * 4] = label
  return {
    capacity,
    alive,
    movable,
    xy,
    radius: new Float32Array(capacity).fill(6),
    edges: Uint32Array.from(edges),
    groups: {
      order: Uint32Array.from(order),
      parent,
      padding: new Float32Array(capacity).fill(10),
      circle: new Uint8Array(capacity),
      labelSpace,
    },
    keys: Array.from({ length: capacity }, (_, index) => `n${index}`),
    datum: () => undefined,
  }
}

function depthOf(parents: readonly number[], index: number): number {
  let depth = 0
  for (let at = parents[index] ?? -1; at >= 0; at = parents[at] ?? -1) depth++
  return depth
}

function nestedSample(seed: number, cyclic = false): Sample {
  const next = random(seed)
  const groups = [-1, 0, 1, 2, 0, -1, 5, 5, -1]
  const leaves: number[] = []
  const edges: number[] = []
  const count = 60
  for (let k = 0; k < count; k++) {
    const roll = next()
    leaves.push(roll < 0.15 ? -1 : roll < 0.9 ? Math.floor(next() * 8) : 8)
  }
  const first = groups.length
  for (let k = 0; k < 90; k++) {
    const a = Math.floor(next() * count)
    const b = Math.floor(next() * count)
    if (a === b || leaves[a] === 8 || leaves[b] === 8) continue
    const [from, to] = cyclic ? [a, b] : [Math.min(a, b), Math.max(a, b)]
    edges.push(first + from, first + to)
  }
  return { groups, leaves, edges }
}

function run(graph: LayoutGraph, options: LayersOptions = {}): Promise<Float32Array> {
  return new Promise((resolve) =>
    layers(options).start(graph, { progress: () => {}, end: resolve }),
  )
}

type Box = readonly [number, number, number, number]

function boxesOf(graph: LayoutGraph, xy: Float32Array): Map<number, Box> {
  const boxes = new Map<number, Box>()
  const groups = graph.groups
  if (!groups) return boxes
  for (const group of [...groups.order].reverse()) {
    let box: Box | null = null
    for (let index = 0; index < graph.capacity; index++) {
      if (groups.parent[index] !== group) continue
      const r = graph.radius[index] ?? 0
      const x = xy[index * 2] ?? 0
      const y = xy[index * 2 + 1] ?? 0
      const inner: Box | null =
        graph.alive[index] === 1 ? [x - r, y - r, x + r, y + r] : (boxes.get(index) ?? null)
      if (!inner) continue
      box = box
        ? [
            Math.min(box[0], inner[0]),
            Math.min(box[1], inner[1]),
            Math.max(box[2], inner[2]),
            Math.max(box[3], inner[3]),
          ]
        : inner
    }
    const pad = groups.padding[group] ?? 0
    if (box) boxes.set(group, [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad])
  }
  return boxes
}

function holders(graph: LayoutGraph, index: number): Set<number> {
  const found = new Set<number>()
  const parent = graph.groups?.parent
  for (let at = parent?.[index] ?? -1; at >= 0; at = parent?.[at] ?? -1) found.add(at)
  return found
}

function collisions(graph: LayoutGraph, xy: Float32Array): string[] {
  const boxes = boxesOf(graph, xy)
  const strip = (group: number) => graph.groups?.labelSpace?.[group * 4] ?? 0
  const titled = (group: number, box: Box): Box => [box[0], box[1] - strip(group), box[2], box[3]]
  const overlap = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]
  const found: string[] = []
  for (const [a, boxA] of boxes) {
    for (const [b, boxB] of boxes) {
      if (a >= b || holders(graph, a).has(b) || holders(graph, b).has(a)) continue
      if (overlap(titled(a, boxA), titled(b, boxB))) found.push(`groups ${a} and ${b}`)
    }
    for (let index = 0; index < graph.capacity; index++) {
      if (graph.alive[index] !== 1 || holders(graph, index).has(a)) continue
      const r = graph.radius[index] ?? 0
      const x = xy[index * 2] ?? 0
      const y = xy[index * 2 + 1] ?? 0
      if (overlap(titled(a, boxA), [x - r, y - r, x + r, y + r])) {
        found.push(`node ${index} in group ${a}`)
      }
    }
  }
  return found
}

function forward(direction: LayersDirection, from: number, to: number, xy: Float32Array) {
  const axis = direction === 'down' || direction === 'up' ? 1 : 0
  const sign = direction === 'down' || direction === 'right' ? 1 : -1
  return ((xy[to * 2 + axis] ?? 0) - (xy[from * 2 + axis] ?? 0)) * sign > 0
}

const directions: readonly LayersDirection[] = ['down', 'up', 'right', 'left']

describe('layers with groups', () => {
  it('points every edge forward, edges between groups included', async () => {
    for (const direction of directions) {
      const graph = graphOf(nestedSample(4))
      const xy = await run(graph, { direction })
      for (let at = 0; at < graph.edges.length; at += 2) {
        const from = graph.edges[at] ?? 0
        const to = graph.edges[at + 1] ?? 0
        expect(forward(direction, from, to, xy)).toBe(true)
      }
    }
  })

  it('keeps every container, with its label, clear of other containers and nodes', async () => {
    for (const seed of [1, 2, 3]) {
      for (const cyclic of [false, true]) {
        for (const direction of directions) {
          const graph = graphOf({ ...nestedSample(seed, cyclic), label: 18 })
          const xy = await run(graph, { direction })
          expect(collisions(graph, xy)).toEqual([])
        }
      }
    }
  })

  it('stacks the padding and the label of the groups that start on a layer', async () => {
    const graph = graphOf({ groups: [-1, 0], leaves: [-1, 1], edges: [2, 3], label: 18 })
    const xy = await run(graph, { layerSpacing: 30 })
    expect((xy[7] ?? 0) - (xy[5] ?? 0)).toBeCloseTo(6 + 30 + 6 + 10 + 10 + 18, 4)
    expect(xy[6]).toBeCloseTo(xy[4] ?? 0, 4)
  })

  it('leaves room for labels beside the containers when layers run sideways', async () => {
    const graph = graphOf({ ...nestedSample(5), label: 24 })
    for (const direction of ['right', 'left'] as const) {
      const xy = await run(graph, { direction })
      expect(collisions(graph, xy)).toEqual([])
    }
  })

  it('nests groups four levels deep, members or not', async () => {
    const graph = graphOf({
      groups: [-1, 0, 1, 2, -1],
      leaves: [3, 3, 2, 1, 0, -1, 4, 4],
      edges: [5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 5, 10],
      label: 18,
    })
    for (const direction of directions) {
      const xy = await run(graph, { direction })
      expect(collisions(graph, xy)).toEqual([])
      expect(forward(direction, 5, 6, xy)).toBe(true)
    }
  })

  it('handles cycles that run through several groups', async () => {
    const graph = graphOf({
      groups: [-1, -1, -1],
      leaves: [0, 0, 1, 1, 2, 2],
      edges: [3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 3],
    })
    const xy = await run(graph)
    expect(collisions(graph, xy)).toEqual([])
    let backward = 0
    for (let at = 0; at < graph.edges.length; at += 2) {
      if (!forward('down', graph.edges[at] ?? 0, graph.edges[at + 1] ?? 0, xy)) backward++
    }
    expect(backward).toBe(1)
  })

  it('gives the same result for the same graph', async () => {
    const first = await run(graphOf(nestedSample(7, true)))
    const second = await run(graphOf(nestedSample(7, true)))
    expect(Array.from(second)).toEqual(Array.from(first))
  })

  it('leaves fixed members in place and still keeps the containers apart', async () => {
    const sample = nestedSample(8)
    const graph = graphOf({ ...sample, fixed: [9, 10] })
    const xy = await run(graph)
    expect([xy[18], xy[19], xy[20], xy[21]]).toEqual([
      graph.xy[18],
      graph.xy[19],
      graph.xy[20],
      graph.xy[21],
    ])
    const boxes = boxesOf(graph, xy)
    const roots = [0, 5, 8].map((group) => boxes.get(group)).filter((box) => box !== undefined)
    for (let a = 0; a < roots.length; a++) {
      for (let b = a + 1; b < roots.length; b++) {
        const [ax0 = 0, ay0 = 0, ax1 = 0, ay1 = 0] = roots[a] ?? []
        const [bx0 = 0, by0 = 0, bx1 = 0, by1 = 0] = roots[b] ?? []
        expect(ax1 <= bx0 || bx1 <= ax0 || ay1 <= by0 || by1 <= ay0).toBe(true)
      }
    }
  })
})
