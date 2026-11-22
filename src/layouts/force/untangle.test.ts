import { describe, expect, it } from 'vitest'
import { CrossingCount, crosses } from './crossings'
import { type ForceGraph, forceDefaults } from './simulation'
import { UntanglePass } from './untangle'

function random(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
}

function graphOf(xy: number[], edges: number[], fixed: readonly number[] = []): ForceGraph {
  const capacity = xy.length / 2
  return {
    capacity,
    alive: new Uint8Array(capacity).fill(1),
    movable: Uint8Array.from({ length: capacity }, (_, at) => (fixed.includes(at) ? 0 : 1)),
    xy: Float32Array.from(xy),
    radius: new Float32Array(capacity).fill(5),
    edges: Uint32Array.from(edges),
  }
}

function grid(width: number, swaps: readonly (readonly [number, number])[]): ForceGraph {
  const xy: number[] = []
  const edges: number[] = []
  for (let row = 0; row < width; row++) {
    for (let column = 0; column < width; column++) {
      const at = row * width + column
      xy.push(column * 50, row * 50)
      if (column + 1 < width) edges.push(at, at + 1)
      if (row + 1 < width) edges.push(at, at + width)
    }
  }
  for (const [a, b] of swaps) {
    const ax = xy[a * 2] ?? 0
    const ay = xy[a * 2 + 1] ?? 0
    xy[a * 2] = xy[b * 2] ?? 0
    xy[a * 2 + 1] = xy[b * 2 + 1] ?? 0
    xy[b * 2] = ax
    xy[b * 2 + 1] = ay
  }
  return graphOf(xy, edges)
}

function scattered(count: number, degree: number, seed: number): ForceGraph {
  const next = random(seed)
  const xy: number[] = []
  for (let at = 0; at < count; at++) xy.push(next() * 1000, next() * 1000)
  const edges: number[] = []
  for (let at = 0; at < count * degree; at++) {
    const a = Math.floor(next() * count)
    const b = Math.floor(next() * count)
    if (a !== b) edges.push(a, b)
  }
  return graphOf(xy, edges)
}

function naive(xy: ArrayLike<number>, edges: Uint32Array): number {
  let total = 0
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e] ?? 0
    const b = edges[e + 1] ?? 0
    for (let f = e + 2; f < edges.length; f += 2) {
      const c = edges[f] ?? 0
      const d = edges[f + 1] ?? 0
      if (c === a || c === b || d === a || d === b) continue
      const at = (i: number) => xy[i] ?? 0
      if (
        crosses(
          at(a * 2),
          at(a * 2 + 1),
          at(b * 2),
          at(b * 2 + 1),
          at(c * 2),
          at(c * 2 + 1),
          at(d * 2),
          at(d * 2 + 1),
        )
      )
        total++
    }
  }
  return total
}

function counted(graph: ForceGraph, xy: Float32Array = graph.xy, cap?: number): CrossingCount {
  const nodes = Int32Array.from({ length: graph.capacity }, (_, at) => at)
  const px = Float64Array.from({ length: graph.capacity }, (_, at) => xy[at * 2] ?? 0)
  const py = Float64Array.from({ length: graph.capacity }, (_, at) => xy[at * 2 + 1] ?? 0)
  return new CrossingCount(nodes, graph.edges, px, py, cap)
}

function overlaps(graph: ForceGraph, xy: Float32Array): number {
  let total = 0
  for (let a = 0; a < graph.capacity; a++) {
    for (let b = a + 1; b < graph.capacity; b++) {
      const distance = Math.hypot(
        (xy[a * 2] ?? 0) - (xy[b * 2] ?? 0),
        (xy[a * 2 + 1] ?? 0) - (xy[b * 2 + 1] ?? 0),
      )
      if (distance < (graph.radius[a] ?? 0) + (graph.radius[b] ?? 0)) total++
    }
  }
  return total
}

function untangled(
  graph: ForceGraph,
  slice = Number.POSITIVE_INFINITY,
  budget = Number.POSITIVE_INFINITY,
) {
  const pass = new UntanglePass(graph, graph.xy, { ...forceDefaults, untangle: budget })
  while (!pass.advance(slice === 0 ? 0 : performance.now() + slice)) {}
  return { pass, xy: pass.result() }
}

const folded = grid(8, [
  [9, 18],
  [21, 30],
  [36, 45],
  [50, 51],
])

describe('CrossingCount', () => {
  it('counts what a test of every pair counts, in one go or in slices', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const graph = scattered(40 + seed * 5, 1 + (seed % 3), seed)
      const expected = naive(graph.xy, graph.edges)
      const whole = counted(graph)
      whole.advance(Number.POSITIVE_INFINITY)
      const sliced = counted(graph)
      while (!sliced.advance(0)) {}
      expect([whole.total, sliced.total]).toEqual([expected, expected])
      let sum = 0
      for (const count of whole.perEdge) sum += count
      expect(sum).toBe(expected * 2)
    }
  })

  it('stops once it passes its cap', () => {
    const graph = scattered(80, 4, 3)
    const count = counted(graph, graph.xy, 10)
    count.advance(Number.POSITIVE_INFINITY)
    expect(count.exceeded).toBe(true)
    expect(count.total).toBe(11)
  })
})

describe('UntanglePass', () => {
  it('removes crossings without adding overlaps', () => {
    const before = naive(folded.xy, folded.edges)
    const { pass, xy } = untangled(folded)
    expect(before).toBeGreaterThan(4)
    expect(pass.before).toBe(before)
    expect(naive(xy, folded.edges)).toBeLessThan(before / 2)
    expect(pass.moved).toBe(true)
    expect(overlaps(folded, xy)).toBeLessThanOrEqual(overlaps(folded, folded.xy))
  })

  it('gives the same bytes on every run, in one go or in slices', () => {
    const one = untangled(folded).xy
    const two = untangled(folded).xy
    const sliced = untangled(folded, 0).xy
    expect(Array.from(two)).toEqual(Array.from(one))
    expect(Array.from(sliced)).toEqual(Array.from(one))
  })

  it('never moves fixed or dead nodes', () => {
    const graph = {
      ...folded,
      movable: Uint8Array.from(folded.movable),
      alive: Uint8Array.from(folded.alive),
    }
    graph.movable[9] = 0
    graph.movable[18] = 0
    graph.alive[63] = 0
    const xy = Float32Array.from(graph.xy)
    xy[126] = 12345
    const pass = new UntanglePass(graph, xy, forceDefaults)
    while (!pass.advance(Number.POSITIVE_INFINITY)) {}
    const out = pass.result()
    for (const index of [9, 18]) {
      expect([out[index * 2], out[index * 2 + 1]]).toEqual([xy[index * 2], xy[index * 2 + 1]])
    }
    expect(out[126]).toBe(12345)
  })

  it('untangles a branch that hangs across an edge', () => {
    const xy = [0, 0, 100, 0, 200, 0, 300, 0, 400, 0, 200, 60, 130, -20, 170, -20]
    const edges = [0, 1, 1, 2, 2, 3, 3, 4, 2, 5, 5, 6, 5, 7]
    const graph = graphOf(xy, edges, [0, 1, 2, 3, 4])
    expect(naive(graph.xy, graph.edges)).toBe(2)
    const { pass, xy: out } = untangled(graph)
    expect(naive(out, graph.edges)).toBe(0)
    expect(pass.moved).toBe(true)
  })

  it('turns whole branches of a tree', () => {
    const next = random(5)
    const xy: number[] = [0, 0]
    const edges: number[] = []
    for (let at = 1; at < 120; at++) {
      const parent = Math.floor((at - 1) / 3)
      const angle = next() * Math.PI * 2
      xy.push(
        (xy[parent * 2] ?? 0) + Math.cos(angle) * 50,
        (xy[parent * 2 + 1] ?? 0) + Math.sin(angle) * 50,
      )
      edges.push(parent, at)
    }
    const graph = graphOf(xy, edges)
    const before = naive(graph.xy, graph.edges)
    const { pass, xy: out } = untangled(graph)
    expect(pass.branchMoves).toBeGreaterThan(0)
    expect(naive(out, graph.edges)).toBeLessThan(before / 2)
  })

  it('holds a pinned node where it is pinned', () => {
    const pass = new UntanglePass(folded, folded.xy, forceDefaults)
    pass.pin(18, 900, -900)
    pass.pin(-1, 0, 0)
    pass.pin(4, Number.NaN, 0)
    while (!pass.advance(Number.POSITIVE_INFINITY)) {}
    const out = pass.result()
    expect([out[36], out[37]]).toEqual([900, -900])
  })

  it('skips dense graphs and leaves them as they are', () => {
    const graph = scattered(200, 5, 7)
    const { pass, xy } = untangled(graph)
    expect(pass.skipped).toBe(true)
    expect(pass.moved).toBe(false)
    expect(Array.from(xy)).toEqual(Array.from(graph.xy))
  })

  it('estimates the density of large graphs from a sample before counting every crossing', () => {
    const dense = scattered(4000, 5, 11)
    expect(dense.edges.length / 2).toBeGreaterThan(16384)
    expect(untangled(dense).pass.skipped).toBe(true)
    const sheet = grid(100, [
      [5050, 5051],
      [2020, 2121],
    ])
    const { pass } = untangled(sheet)
    expect(pass.skipped).toBe(false)
    const count = counted(sheet)
    count.advance(Number.POSITIVE_INFINITY)
    expect(pass.before).toBe(count.total)
    expect(pass.before).toBeGreaterThan(0)
    expect(pass.crossings).toBeLessThan(pass.before)
  })

  it('stops at its budget', () => {
    const { pass } = untangled(folded, Number.POSITIVE_INFINITY, 0)
    expect(pass.moved).toBe(false)
    const none = new UntanglePass(
      graphOf([0, 0, 10, 0], [0, 1]),
      Float32Array.of(0, 0, 10, 0),
      forceDefaults,
    )
    expect(none.advance(0)).toBe(true)
  })
})
