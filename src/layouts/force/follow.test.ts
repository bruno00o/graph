import { describe, expect, it } from 'vitest'
import type { LayoutFollower, LayoutGraph } from '../../types'
import { follow } from './follow'
import { force } from './index'

function graphOf(xy: number[], edges: number[], fixed: readonly number[] = []): LayoutGraph {
  const capacity = xy.length / 2
  return {
    capacity,
    alive: new Uint8Array(capacity).fill(1),
    movable: Uint8Array.from({ length: capacity }, (_, at) => (fixed.includes(at) ? 0 : 1)),
    xy: Float32Array.from(xy),
    radius: new Float32Array(capacity).fill(5),
    edges: Uint32Array.from(edges),
    keys: Array.from({ length: capacity }, (_, at) => `n${at}`),
    datum: () => undefined,
  }
}

function chain(length: number, fixed: readonly number[] = []): LayoutGraph {
  const xy: number[] = []
  const edges: number[] = []
  for (let at = 0; at < length; at++) {
    xy.push(at * 50, 0)
    if (at > 0) edges.push(at - 1, at)
  }
  return graphOf(xy, edges, fixed)
}

function grid(width: number): LayoutGraph {
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
  return graphOf(xy, edges)
}

function drag(
  follower: LayoutFollower,
  held: number,
  from: readonly [number, number],
  by: readonly [number, number],
  frames = 40,
): void {
  for (let frame = 1; frame <= frames; frame++) {
    const k = frame / frames
    follower.hold(held, from[0] + by[0] * k, from[1] + by[1] * k)
    follower.step(16, Number.POSITIVE_INFINITY)
  }
}

function settle(follower: LayoutFollower): number {
  let frames = 0
  while (follower.step(16, Number.POSITIVE_INFINITY)) frames++
  return frames
}

function shift(graph: LayoutGraph, before: Float32Array, index: number): number {
  return Math.hypot(
    (graph.xy[index * 2] ?? 0) - (before[index * 2] ?? 0),
    (graph.xy[index * 2 + 1] ?? 0) - (before[index * 2 + 1] ?? 0),
  )
}

describe('follow', () => {
  it('leaves every node in place while the held node stays still', () => {
    const graph = grid(8)
    const before = graph.xy.slice()
    const follower = follow(graph, [27], 1)
    if (!follower) throw new Error('no follower')
    for (let frame = 0; frame < 60; frame++) {
      follower.hold(27, before[54] ?? 0, before[55] ?? 0)
      follower.step(16, Number.POSITIVE_INFINITY)
    }
    expect(Array.from(graph.xy)).toEqual(Array.from(before))
  })

  it('pulls the neighbors along, less with every hop', () => {
    const graph = chain(8)
    const before = graph.xy.slice()
    const follower = follow(graph, [0], 1)
    if (!follower) throw new Error('no follower')
    drag(follower, 0, [0, 0], [0, 200])
    const hops = [1, 2, 3].map((index) => shift(graph, before, index))
    expect(hops[0]).toBeGreaterThan(20)
    expect(hops[0]).toBeGreaterThan(hops[1] ?? 0)
    expect(hops[1]).toBeGreaterThan(hops[2] ?? 0)
    expect([...follower.moved]).toContain(1)
  })

  it('never moves the nodes that are not movable', () => {
    const graph = chain(6, [1])
    const before = graph.xy.slice()
    const follower = follow(graph, [0], 1)
    if (!follower) throw new Error('no follower')
    drag(follower, 0, [0, 0], [0, 200])
    follower.release()
    settle(follower)
    expect(shift(graph, before, 1)).toBe(0)
    expect([...follower.moved]).not.toContain(1)
  })

  it('calms down after the release and stops for good', () => {
    const graph = grid(6)
    const follower = follow(graph, [14], 1)
    if (!follower) throw new Error('no follower')
    drag(follower, 14, [100, 100], [120, 40])
    follower.release()
    const frames = settle(follower)
    expect(frames).toBeLessThan(60)
    const after = graph.xy.slice()
    expect(follower.step(16, Number.POSITIVE_INFINITY)).toBe(false)
    expect(Array.from(graph.xy)).toEqual(Array.from(after))
    follower.stop()
    expect(follower.step(16, Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('runs until calm in one call with an infinite time', () => {
    const graph = grid(6)
    const follower = follow(graph, [14], 1)
    if (!follower) throw new Error('no follower')
    follower.hold(14, 220, 140)
    expect(follower.step(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)).toBe(false)
    follower.release()
    expect(follower.step(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)).toBe(false)
    expect([...follower.moved].length).toBeGreaterThan(0)
  })

  it('holds a selection of neighbors together and wakes at most 5,000 nodes', () => {
    const leaves = 6000
    const xy = [0, 0]
    const edges: number[] = []
    for (let at = 1; at <= leaves; at++) {
      const angle = (at / leaves) * Math.PI * 2
      xy.push(Math.cos(angle) * 2000, Math.sin(angle) * 2000)
      edges.push(0, at)
    }
    const star = graphOf(xy, edges)
    const follower = follow(star, [0, 1, 2], 1)
    if (!follower) throw new Error('no follower')
    follower.hold(0, 10, 10)
    follower.step(16, Number.POSITIVE_INFINITY)
    expect([...follower.moved].length).toBe(5000)
    expect([...follower.moved]).not.toContain(1)
  })

  it('wakes neighbors from half a screen pixel, whatever the zoom', () => {
    const moved = (pixel: number) => {
      const graph = chain(4)
      const follower = follow(graph, [0], pixel)
      if (!follower) throw new Error('no follower')
      follower.hold(0, -20, 0)
      follower.step(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
      return [...follower.moved].sort()
    }
    expect(moved(1)).toEqual([1, 2, 3])
    expect(moved(100)).toEqual([1])
  })

  it('gives the same positions on every run', () => {
    const run = () => {
      const graph = grid(7)
      const follower = follow(graph, [24], 1)
      if (!follower) throw new Error('no follower')
      drag(follower, 24, [150, 150], [90, -60])
      follower.release()
      settle(follower)
      return Array.from(graph.xy)
    }
    expect(run()).toEqual(run())
  })

  it('follows nothing without a held node or a size of pixel', () => {
    expect(follow(chain(3), [], 1)).toBeNull()
    expect(follow(chain(3), [0], 0)).toBeNull()
    expect(follow(chain(3), [0], Number.NaN)).toBeNull()
  })

  it('is the follow of force', () => {
    expect(force().follow).toBe(follow)
  })
})
