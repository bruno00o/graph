import { describe, expect, it } from 'vitest'
import { type PositionedGraph, withFinitePositions } from './finite-positions'

function graphOf(xy: readonly number[], movable: readonly number[], edges: readonly number[]) {
  const capacity = movable.length
  return {
    capacity,
    alive: new Uint8Array(capacity).fill(1),
    movable: Uint8Array.from(movable),
    xy: Float32Array.from(xy),
    radius: new Float32Array(capacity).fill(5),
    edges: Uint32Array.from(edges),
  } satisfies PositionedGraph
}

describe('withFinitePositions', () => {
  it('returns the same graph when every position is finite', () => {
    const graph = graphOf([0, 0, 10, 0], [1, 1], [0, 1])
    expect(withFinitePositions(graph)).toBe(graph)
  })

  it('leaves a fixed node without a position out, with its edges', () => {
    const graph = graphOf([0, 0, 10, 0, Number.NaN, 0], [1, 1, 0], [0, 1, 1, 2])
    const finite = withFinitePositions(graph)
    expect(Array.from(finite.alive)).toEqual([1, 1, 0])
    expect(Array.from(finite.movable)).toEqual([1, 1, 0])
    expect(Array.from(finite.edges)).toEqual([0, 1])
    expect(Array.from(graph.alive)).toEqual([1, 1, 1])
  })

  it('places moving nodes near their placed neighbors, or around the center apart', () => {
    const graph = graphOf(
      [0, 0, 100, 0, Number.NaN, 5, Number.POSITIVE_INFINITY, 0, Number.NaN, Number.NaN],
      [0, 0, 1, 1, 1],
      [2, 1],
    )
    const { xy } = withFinitePositions(graph)
    expect(Array.from(xy).every(Number.isFinite)).toBe(true)
    expect(Math.hypot((xy[4] ?? 0) - 100, xy[5] ?? 0)).toBeLessThan(20)
    expect(Math.hypot((xy[6] ?? 0) - 50, xy[7] ?? 0)).toBeLessThan(40)
    expect(Math.hypot((xy[6] ?? 0) - (xy[8] ?? 0), (xy[7] ?? 0) - (xy[9] ?? 0))).toBeGreaterThan(1)
    expect(Array.from(xy.subarray(0, 4))).toEqual([0, 0, 100, 0])
  })
})
