import { describe, expect, it, vi } from 'vitest'
import type { LayoutRun } from '../../types'
import type { GpuForce } from './gpu'
import { Ladder, type MultilevelEngines, multilevelPlan, runMultilevel } from './multilevel'
import { type ForceGraph, ForceSimulation, forceDefaults } from './simulation'

function scattered(capacity: number): Float32Array {
  const turn = Math.PI * (3 - Math.sqrt(5))
  const xy = new Float32Array(capacity * 2)
  for (let at = 0; at < capacity; at++) {
    const spot = (at * 7919) % capacity
    xy[at * 2] = 24 * Math.sqrt(spot) * Math.cos(spot * turn)
    xy[at * 2 + 1] = 24 * Math.sqrt(spot) * Math.sin(spot * turn)
  }
  return xy
}

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
    xy: scattered(capacity),
    radius: new Float32Array(capacity).fill(5),
    edges: Uint32Array.from(edges),
  }
}

function folded(width: number, xy: Float32Array): number {
  let positive = 0
  let negative = 0
  for (let row = 0; row + 1 < width; row++) {
    for (let column = 0; column + 1 < width; column++) {
      const a = row * width + column
      const b = a + 1
      const c = a + width
      const ax = xy[a * 2] ?? 0
      const ay = xy[a * 2 + 1] ?? 0
      const cross =
        ((xy[b * 2] ?? 0) - ax) * ((xy[c * 2 + 1] ?? 0) - ay) -
        ((xy[b * 2 + 1] ?? 0) - ay) * ((xy[c * 2] ?? 0) - ax)
      if (cross > 0) positive++
      else negative++
    }
  }
  return Math.min(positive, negative) / (positive + negative)
}

interface Recorded {
  readonly snapshots: Float32Array[]
  readonly progress: number[]
  readonly end: Promise<Float32Array>
  readonly run: LayoutRun
}

function record(
  graph: ForceGraph,
  engines: Partial<MultilevelEngines> = {},
  plan = multilevelPlan,
): Recorded {
  const snapshots: Float32Array[] = []
  const progress: number[] = []
  let run: LayoutRun | null = null
  const end = new Promise<Float32Array>((resolve) => {
    run = runMultilevel(
      new Ladder(graph, forceDefaults, plan),
      forceDefaults,
      {
        progress: (xy, value) => {
          snapshots.push(xy)
          progress.push(value)
        },
        end: resolve,
      },
      {
        budget: Number.POSITIVE_INFINITY,
        interval: 0,
        schedule: (task) => task(),
        gpu: null,
        settle: () => {},
        ...engines,
      },
    )
  })
  return { snapshots, progress, end, run: run as unknown as LayoutRun }
}

function plain(graph: ForceGraph): Float32Array {
  const simulation = new ForceSimulation(graph, forceDefaults)
  while (!simulation.done) simulation.step()
  const out = new Float32Array(graph.capacity * 2)
  simulation.write(out)
  return out
}

function fakeGpu(graph: ForceGraph, failOnRead: boolean) {
  let steps = 0
  return {
    fixed: new Uint8Array(graph.capacity),
    lost: false,
    get done() {
      return steps >= 3
    },
    get progress() {
      return steps / 3
    },
    step: () => {
      steps++
    },
    read: async () => !failOnRead,
    pin: () => {},
    destroy: vi.fn(),
  }
}

function withLoners(base: ForceGraph, count: number): ForceGraph {
  const capacity = base.capacity + count
  const pairs = Array.from({ length: count / 4 }, (_, at) => [
    base.capacity + at * 2,
    base.capacity + at * 2 + 1,
  ]).flat()
  return {
    capacity,
    alive: new Uint8Array(capacity).fill(1),
    movable: Uint8Array.from({ length: capacity }, (_, at) => base.movable[at] ?? 1),
    xy: scattered(capacity),
    radius: new Float32Array(capacity).fill(5),
    edges: Uint32Array.from([...base.edges, ...pairs]),
  }
}

function spreadAround(xy: Float32Array, core: number, from: number, to: number): number {
  let cx = 0
  let cy = 0
  for (let at = 0; at < core; at++) {
    cx += xy[at * 2] ?? 0
    cy += xy[at * 2 + 1] ?? 0
  }
  cx /= core
  cy /= core
  let sx = 0
  let sy = 0
  for (let at = from; at < to; at++) {
    const angle = Math.atan2((xy[at * 2 + 1] ?? 0) - cy, (xy[at * 2] ?? 0) - cx)
    sx += Math.cos(angle)
    sy += Math.sin(angle)
  }
  return Math.hypot(sx, sy) / (to - from)
}

describe('runMultilevel', () => {
  it('lays a grid out flat where a single level folds it', async () => {
    const graph = grid(20)
    const end = await record(graph).end
    expect(folded(20, end)).toBeLessThan(0.1)
    expect(folded(20, plain(graph))).toBeGreaterThan(folded(20, end) * 2)
  })

  it('spreads isolated nodes and small parts all around the graph', async () => {
    const graph = withLoners(grid(20), 80)
    const end = await record(graph).end
    expect(spreadAround(end, 400, 440, 480)).toBeLessThan(0.35)
    expect(spreadAround(end, 400, 400, 440)).toBeLessThan(0.35)
    const single = plain(graph)
    expect(spreadAround(single, 400, 440, 480)).toBeLessThan(0.35)
  })

  it('streams full snapshots with fixed nodes in place, then ends', async () => {
    const graph = grid(12, [0, 77])
    const { snapshots, progress, end } = record(graph, { budget: 0 })
    const result = await end
    expect(snapshots.length).toBeGreaterThan(10)
    for (const xy of [...snapshots, result]) {
      expect(xy.length).toBe(graph.capacity * 2)
      expect(xy.every(Number.isFinite)).toBe(true)
      for (const index of [0, 77]) {
        expect(xy[index * 2]).toBe(graph.xy[index * 2])
        expect(xy[index * 2 + 1]).toBe(graph.xy[index * 2 + 1])
      }
    }
    expect(progress.every((value, at) => value >= (progress[at - 1] ?? 0) && value <= 1)).toBe(true)
  })

  it('gives the same bytes on every run', async () => {
    const one = await record(grid(15)).end
    const two = await record(grid(15)).end
    expect(Array.from(one)).toEqual(Array.from(two))
  })

  it('holds a pin from the coarsest level to the end', async () => {
    const { snapshots, end, run } = record(grid(12), { budget: 0 })
    const before = snapshots.length
    run.pin(5, 900, -900)
    const result = await end
    for (const xy of [...snapshots.slice(before), result]) {
      expect([xy[10], xy[11]]).toEqual([900, -900])
    }
  })

  it('reports nothing once stopped', async () => {
    const { progress, end, run } = record(grid(12), { budget: 0 })
    const listened = progress.length
    run.stop()
    const ended = vi.fn()
    void end.then(ended)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(progress.length).toBe(listened)
    expect(ended).not.toHaveBeenCalled()
  })

  it('runs the large levels on the graphics card, then separates', async () => {
    const graph = grid(12)
    const settle = vi.fn()
    const sizes: number[] = []
    const gpu = (level: ForceGraph) => {
      sizes.push(level.capacity)
      return fakeGpu(level, false) as unknown as GpuForce
    }
    const end = await record(graph, { gpu, settle }, { ...multilevelPlan, gpuFrom: 30 }).end
    expect(sizes[0]).toBeGreaterThanOrEqual(30)
    expect(sizes.at(-1)).toBe(graph.capacity)
    expect(settle).toHaveBeenCalledOnce()
    expect(end.length).toBe(graph.capacity * 2)
  })

  it('finishes on the processor when the graphics card fails', async () => {
    const graph = grid(12, [3])
    const settle = vi.fn()
    const gpu = vi.fn((level: ForceGraph) => fakeGpu(level, true) as unknown as GpuForce)
    const end = await record(graph, { gpu, settle }, { ...multilevelPlan, gpuFrom: 30 }).end
    expect(gpu).toHaveBeenCalledOnce()
    expect(settle).not.toHaveBeenCalled()
    expect(end.every(Number.isFinite)).toBe(true)
    expect([end[6], end[7]]).toEqual([graph.xy[6], graph.xy[7]])
    expect(folded(12, end)).toBeLessThan(0.1)
  })

  it('stays on the processor when no graphics context can be made', async () => {
    const settle = vi.fn()
    const gpu = vi.fn(() => null)
    const end = await record(grid(12), { gpu, settle }, { ...multilevelPlan, gpuFrom: 30 }).end
    expect(gpu).toHaveBeenCalledOnce()
    expect(settle).not.toHaveBeenCalled()
    expect(end.every(Number.isFinite)).toBe(true)
  })
})
