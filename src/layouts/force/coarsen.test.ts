import { describe, expect, it } from 'vitest'
import { coarsen, coarsenOnce } from './coarsen'
import type { ForceGraph } from './simulation'

function grid(width: number, fixed: readonly number[] = []): ForceGraph {
  const capacity = width * width
  const edges: number[] = []
  for (let row = 0; row < width; row++) {
    for (let column = 0; column < width; column++) {
      const at = row * width + column
      if (column + 1 < width) edges.push(at, at + 1)
      if (row + 1 < width) edges.push(at, at + width)
    }
  }
  return {
    capacity,
    alive: new Uint8Array(capacity).fill(1),
    movable: Uint8Array.from({ length: capacity }, (_, at) => (fixed.includes(at) ? 0 : 1)),
    xy: Float32Array.from({ length: capacity * 2 }, (_, at) => (at * 37) % 500),
    radius: new Float32Array(capacity).fill(6),
    edges: Uint32Array.from(edges),
  }
}

function complete(count: number): ForceGraph {
  const edges: number[] = []
  for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) edges.push(a, b)
  return {
    capacity: count,
    alive: new Uint8Array(count).fill(1),
    movable: new Uint8Array(count).fill(1),
    xy: Float32Array.from({ length: count * 2 }, (_, at) => at),
    radius: new Float32Array(count).fill(4),
    edges: Uint32Array.from(edges),
  }
}

const options = { coarsest: 10, stall: 0.8, edgeLength: 40, keep: 16 }

function sum(values: Float32Array): number {
  let total = 0
  for (const value of values) total += value
  return total
}

describe('coarsen', () => {
  it('halves the graph level by level and keeps the total mass', () => {
    const levels = coarsen(grid(30), options)
    expect(levels.length).toBeGreaterThan(4)
    let previous = 900
    for (const level of levels) {
      expect(level.graph.capacity).toBeLessThanOrEqual(previous * 0.8)
      expect(level.graph.capacity).toBeGreaterThanOrEqual(previous * 0.3)
      expect(sum(level.mass)).toBe(900)
      previous = level.graph.capacity
    }
    expect(previous).toBeLessThanOrEqual(options.coarsest * 2)
  })

  it('maps every alive node to a cluster and leaves dead ones out', () => {
    const base = grid(6)
    const alive = base.alive.slice()
    alive[7] = 0
    const level = coarsenOnce(
      { ...base, alive },
      new Float32Array(36).fill(1),
      new Float32Array(36).fill(26),
      null,
      options,
      1,
    )
    for (let at = 0; at < 36; at++) {
      if (at === 7) expect(level.up[at]).toBe(-1)
      else expect(level.up[at]).toBeGreaterThanOrEqual(0)
    }
    expect(sum(level.mass)).toBe(35)
  })

  it('keeps fixed nodes alone, fixed and in place', () => {
    const base = grid(10, [0, 55])
    const [first] = coarsen(base, options)
    if (!first) throw new Error('expected a level')
    for (const index of [0, 55]) {
      const cluster = first.up[index] ?? -1
      expect(first.up.filter((value) => value === cluster).length).toBe(1)
      expect(first.graph.movable[cluster]).toBe(0)
      expect(first.graph.xy[cluster * 2]).toBe(base.xy[index * 2])
      expect(first.graph.xy[cluster * 2 + 1]).toBe(base.xy[index * 2 + 1])
    }
  })

  it('is deterministic', () => {
    const one = coarsen(grid(20), options)
    const two = coarsen(grid(20), options)
    expect(one.map((level) => Array.from(level.up))).toEqual(
      two.map((level) => Array.from(level.up)),
    )
    expect(one.map((level) => Array.from(level.graph.edges))).toEqual(
      two.map((level) => Array.from(level.graph.edges)),
    )
  })

  it('counts the edges between clusters and keeps the strongest springs of dense levels', () => {
    const dense = complete(80)
    const level = coarsenOnce(
      dense,
      new Float32Array(80).fill(1),
      new Float32Array(80).fill(24),
      null,
      { ...options, keep: 4 },
      1,
    )
    let crossing = 0
    for (let e = 0; e < dense.edges.length; e += 2) {
      if (level.up[dense.edges[e] ?? 0] !== level.up[dense.edges[e + 1] ?? 0]) crossing++
    }
    expect(sum(level.weights)).toBe(crossing)
    expect(level.links.length / 2).toBe(level.weights.length)
    expect(level.graph.edges.length / 2).toBeLessThan(level.links.length / 2)
    expect(level.graph.edges.length / 2).toBeLessThanOrEqual(level.graph.capacity * 4)
    const degree = new Uint32Array(level.graph.capacity)
    for (const end of level.graph.edges) degree[end] = (degree[end] ?? 0) + 1
    expect(Math.min(...degree)).toBeGreaterThanOrEqual(4)
  })

  it('has nothing to coarsen at the coarsest size', () => {
    expect(coarsen(grid(3), options)).toEqual([])
    expect(
      coarsen(
        grid(
          10,
          Array.from({ length: 95 }, (_, at) => at),
        ),
        options,
      ),
    ).toEqual([])
  })
})
