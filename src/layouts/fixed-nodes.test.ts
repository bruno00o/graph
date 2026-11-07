import { describe, expect, it } from 'vitest'
import type { Key, Layout, LayoutGraph } from '../types'
import { grid, type LayersDirection, layers, radial, rings } from './index'

function run(layout: Layout, graph: LayoutGraph): Promise<Float32Array> {
  return new Promise((resolve) => layout.start(graph, { progress: () => {}, end: resolve }))
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

const directions: readonly LayersDirection[] = ['down', 'up', 'right', 'left']

function backward(graph: LayoutGraph, xy: Float32Array, direction: LayersDirection): string[] {
  const axis = direction === 'down' || direction === 'up' ? 1 : 0
  const sign = direction === 'down' || direction === 'right' ? 1 : -1
  const found: string[] = []
  for (let at = 0; at + 1 < graph.edges.length; at += 2) {
    const from = graph.edges[at] ?? 0
    const to = graph.edges[at + 1] ?? 0
    if (from === to || graph.movable[from] !== 1 || graph.movable[to] !== 1) continue
    const ahead = ((xy[to * 2 + axis] ?? 0) - (xy[from * 2 + axis] ?? 0)) * sign
    if (!(ahead > 0)) found.push(`n${from} -> n${to}`)
  }
  return found
}

function overlaps(graph: LayoutGraph, xy: Float32Array): string[] {
  const found: string[] = []
  for (let a = 0; a < graph.capacity; a++) {
    if (graph.alive[a] !== 1 || graph.movable[a] !== 1) continue
    for (let b = a + 1; b < graph.capacity; b++) {
      if (graph.alive[b] !== 1 || graph.movable[b] !== 1) continue
      const d = Math.hypot(
        (xy[a * 2] ?? 0) - (xy[b * 2] ?? 0),
        (xy[a * 2 + 1] ?? 0) - (xy[b * 2 + 1] ?? 0),
      )
      if (d < (graph.radius[a] ?? 0) + (graph.radius[b] ?? 0) - 1e-3) found.push(`n${a}/n${b}`)
    }
  }
  return found
}

function moved(graph: LayoutGraph, xy: Float32Array): string[] {
  const found: string[] = []
  for (let index = 0; index < graph.capacity; index++) {
    if (graph.alive[index] !== 1) continue
    const x = xy[index * 2] ?? Number.NaN
    const y = xy[index * 2 + 1] ?? Number.NaN
    if (!Number.isFinite(x) || !Number.isFinite(y)) found.push(`n${index} not finite`)
    else if (
      graph.movable[index] !== 1 &&
      (x !== graph.xy[index * 2] || y !== graph.xy[index * 2 + 1])
    )
      found.push(`n${index} fixed but moved`)
  }
  return found
}

function keysOf(capacity: number): Key[] {
  return Array.from({ length: capacity }, (_, index) => `n${index}`)
}

function nestedCircle(circle: boolean): LayoutGraph {
  const parent = Int32Array.from([-1, 0, 1, -1, -1, 0, 1, -1])
  const capacity = parent.length
  const alive = Uint8Array.from([0, 0, 1, 1, 1, 1, 1, 1])
  return {
    capacity,
    alive,
    movable: alive.slice(),
    xy: new Float32Array(capacity * 2),
    radius: Float32Array.from([0, 0, 3.9, 6.8, 0, 9, 8, 10.7]),
    edges: Uint32Array.from([2, 3, 3, 4, 4, 5, 5, 6, 7, 5]),
    groups: {
      order: Uint32Array.from([0, 1]),
      parent,
      padding: new Float32Array(capacity).fill(8),
      circle: Uint8Array.from([0, circle ? 1 : 0, 0, 0, 0, 0, 0, 0]),
    },
    keys: keysOf(capacity),
    datum: () => undefined,
  }
}

function oneLooseFixed(): LayoutGraph {
  const parent = Int32Array.from([-1, 0, -1, 0, 0, -1, 1, 0, 1, -1, 2, 3, -1, -1, 3, 2, -1])
  const capacity = parent.length
  const alive = Uint8Array.from(parent, (_, index) => (index < 4 ? 0 : 1))
  return {
    capacity,
    alive,
    movable: Uint8Array.from(alive, (flag, index) => (flag === 1 && index !== 9 ? 1 : 0)),
    xy: Float32Array.from([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 30, 30, 20, 20, 30, 30, 10, 20, 10, 0, 20, 0, 10, 30, 20, 30, 30,
      20, 30, 0, 40, 30, 30, 30, 10,
    ]),
    radius: Float32Array.from([0, 0, 0, 0, 0, 10.6, 7.7, 0, 8.3, 3, 5.5, 0, 8.7, 0, 9.4, 3.4, 9.1]),
    edges: Uint32Array.from([
      9, 15, 7, 15, 7, 14, 11, 16, 7, 16, 8, 12, 5, 11, 4, 16, 8, 16, 9, 10, 6, 7, 7, 8, 13, 14,
    ]),
    groups: {
      order: Uint32Array.from([0, 1, 2, 3]),
      parent,
      padding: new Float32Array(capacity).fill(8),
      circle: new Uint8Array(capacity),
    },
    keys: keysOf(capacity),
    datum: () => undefined,
  }
}

function twoPinnedGroups(): LayoutGraph {
  const capacity = 12
  const parent = Int32Array.from([-1, -1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1])
  const alive = Uint8Array.from(parent, (_, index) => (index < 2 ? 0 : 1))
  const xy = new Float32Array(capacity * 2)
  for (let index = 7; index < capacity; index++) xy[index * 2] = 40
  return {
    capacity,
    alive,
    movable: Uint8Array.from(alive, (flag, index) =>
      flag === 1 && index !== 2 && index !== 7 ? 1 : 0,
    ),
    xy,
    radius: new Float32Array(capacity).fill(6),
    edges: new Uint32Array(0),
    groups: {
      order: Uint32Array.from([0, 1]),
      parent,
      padding: new Float32Array(capacity).fill(8),
      circle: new Uint8Array(capacity),
    },
    keys: keysOf(capacity),
    datum: () => undefined,
  }
}

function sample(seed: number, acyclic: boolean): LayoutGraph {
  const next = random(seed)
  const groupCount = seed % 2 === 0 ? Math.floor(next() * 5) : 0
  const leaves = Math.floor(next() * 14)
  const capacity = groupCount + leaves
  const alive = new Uint8Array(capacity)
  const movable = new Uint8Array(capacity)
  const parent = new Int32Array(capacity).fill(-1)
  const xy = new Float32Array(capacity * 2)
  const radius = new Float32Array(capacity)
  for (let group = 0; group < groupCount; group++) {
    parent[group] = group > 0 && next() < 0.5 ? Math.floor(next() * group) : -1
  }
  for (let index = groupCount; index < capacity; index++) {
    alive[index] = 1
    movable[index] = next() < 0.85 ? 1 : 0
    radius[index] = next() < 0.2 ? 0 : 2 + next() * 10
    xy[index * 2] = Math.round(next() * 4) * 10
    xy[index * 2 + 1] = Math.round(next() * 4) * 10
    if (groupCount > 0 && next() < 0.6) parent[index] = Math.floor(next() * groupCount)
  }
  const edges: number[] = []
  const edgeCount = Math.floor(next() * leaves * 2)
  for (let edge = 0; edge < edgeCount && leaves > 0; edge++) {
    let a = groupCount + Math.floor(next() * leaves)
    let b = groupCount + Math.floor(next() * leaves)
    if (acyclic && a > b) [a, b] = [b, a]
    if (acyclic && a === b) continue
    edges.push(a, b)
  }
  const circle = Uint8Array.from({ length: capacity }, () => (next() < 0.3 ? 1 : 0))
  return {
    capacity,
    alive,
    movable,
    xy,
    radius,
    edges: Uint32Array.from(edges),
    ...(groupCount > 0
      ? {
          groups: {
            order: Uint32Array.from({ length: groupCount }, (_, group) => group),
            parent,
            padding: new Float32Array(capacity).fill(8),
            circle,
          },
        }
      : {}),
    keys: keysOf(capacity),
    datum: () => undefined,
  }
}

describe('layers with round groups and fixed nodes', () => {
  it('points every edge forward when a nested group is a circle', async () => {
    for (const circle of [false, true]) {
      for (const direction of directions) {
        const graph = nestedCircle(circle)
        expect(backward(graph, await run(layers({ direction }), graph), direction)).toEqual([])
      }
    }
  })

  it('points every edge between moving nodes forward around a fixed node', async () => {
    for (const direction of directions) {
      const graph = oneLooseFixed()
      const xy = await run(layers({ direction }), graph)
      expect(backward(graph, xy, direction)).toEqual([])
      expect(overlaps(graph, xy)).toEqual([])
    }
  })

  it('keeps edges forward and moving nodes apart on random graphs', async () => {
    const failures: string[] = []
    for (let seed = 1; seed <= 150; seed++) {
      for (const direction of directions) {
        const graph = sample(seed, true)
        const xy = await run(layers({ direction }), graph)
        const found = [
          ...backward(graph, xy, direction),
          ...overlaps(graph, xy),
          ...moved(graph, xy),
        ]
        if (found.length > 0) failures.push(`seed ${seed} ${direction}: ${found.join(', ')}`)
      }
    }
    expect(failures).toEqual([])
  })
})

describe('instant layouts with fixed members in groups', () => {
  it('keeps the moving nodes of two pinned groups apart', async () => {
    for (const layout of [grid(), rings(), radial()]) {
      const graph = twoPinnedGroups()
      expect(overlaps(graph, await run(layout, graph))).toEqual([])
    }
  })

  it('keeps moving nodes apart on random graphs', async () => {
    const failures: string[] = []
    for (let seed = 1; seed <= 150; seed++) {
      for (const layout of [grid(), rings(), radial()]) {
        const graph = sample(seed + 20_000, false)
        const xy = await run(layout, graph)
        const found = [...overlaps(graph, xy), ...moved(graph, xy)]
        if (found.length > 0) failures.push(`seed ${seed} ${layout.name}: ${found.join(', ')}`)
      }
    }
    expect(failures).toEqual([])
  })
})
