import { describe, expect, it, vi } from 'vitest'
import type { LayoutGraph } from '../../types'
import { force } from './index'
import { forceDefaults } from './simulation'

function graph(): LayoutGraph {
  return {
    capacity: 3,
    alive: Uint8Array.from([1, 1, 1]),
    movable: Uint8Array.from([1, 1, 0]),
    xy: Float32Array.from([0, 0, 1, 0, 2, 0]),
    radius: new Float32Array(3).fill(8),
    edges: Uint32Array.from([0, 1, 1, 2]),
    keys: ['a', 'b', 'c'],
    datum: () => undefined,
  }
}

function line(last: readonly [number, number], lastMoves: boolean): LayoutGraph {
  const count = 4
  const xy = Float32Array.from({ length: count * 2 }, (_, at) => (at % 2 === 0 ? at * 5 : 0))
  xy[(count - 1) * 2] = last[0]
  xy[(count - 1) * 2 + 1] = last[1]
  return {
    capacity: count,
    alive: new Uint8Array(count).fill(1),
    movable: Uint8Array.from({ length: count }, (_, index) =>
      index < count - 1 || lastMoves ? 1 : 0,
    ),
    xy,
    radius: new Float32Array(count).fill(5),
    edges: Uint32Array.from([0, 1, 1, 2, 2, 3]),
    keys: ['a', 'b', 'c', 'd'],
    datum: () => undefined,
  }
}

function settle(given: LayoutGraph): Promise<Float32Array> {
  return new Promise((resolve) =>
    force({ engine: 'cpu' }).start(given, { progress: () => {}, end: resolve }),
  )
}

describe('force', () => {
  it('describes itself with resolved options', () => {
    const layout = force({ edgeLength: 90 })
    expect(layout.name).toBe('force')
    expect(layout.options).toEqual({ ...forceDefaults, edgeLength: 90 })
    expect(Object.isFrozen(layout)).toBe(true)
  })

  it('runs on the main thread without workers and ends with fixed nodes in place', async () => {
    const end = await new Promise<Float32Array>((resolve) => {
      force().start(graph(), { progress: () => {}, end: resolve })
    })
    expect(Array.from(end.subarray(4, 6))).toEqual([2, 0])
    expect(
      Math.hypot((end[0] ?? 0) - (end[2] ?? 0), (end[1] ?? 0) - (end[3] ?? 0)),
    ).toBeGreaterThan(20)
  })

  it('reports progress in batches on larger graphs', async () => {
    const count = 3000
    const big: LayoutGraph = {
      capacity: count,
      alive: new Uint8Array(count).fill(1),
      movable: new Uint8Array(count).fill(1),
      xy: Float32Array.from({ length: count * 2 }, (_, at) => (at * 7919) % 1000),
      radius: new Float32Array(count).fill(8),
      edges: Uint32Array.from({ length: count * 2 }, (_, at) => (at * 31) % count),
      keys: [],
      datum: () => undefined,
    }
    const progress: number[] = []
    let ended = false
    const run = force().start(big, {
      progress: (_, value) => progress.push(value),
      end: () => {
        ended = true
      },
    })
    await vi.waitFor(() => expect(progress.length).toBeGreaterThan(1))
    run.stop()
    expect(progress.every((value, at) => at === 0 || value >= (progress[at - 1] ?? 0))).toBe(true)
    expect(ended).toBe(false)
  })

  it('honours pins and reports nothing once stopped', async () => {
    const pinned = await new Promise<Float32Array>((resolve) => {
      const run = force().start(graph(), { progress: () => {}, end: resolve })
      run.pin(0, 500, 500)
    })
    expect(Array.from(pinned.subarray(0, 2))).toEqual([500, 500])
    const listener = { progress: vi.fn(), end: vi.fn() }
    force().start(graph(), listener).stop()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(listener.progress).not.toHaveBeenCalled()
    expect(listener.end).not.toHaveBeenCalled()
  })

  it('leaves a fixed node at a non-finite position out of the forces', async () => {
    const end = await settle(line([Number.NaN, 0], false))
    expect(Array.from(end.subarray(0, 6)).every(Number.isFinite)).toBe(true)
    expect(Number.isNaN(end[6])).toBe(true)
  })

  it('places a moving node at a non-finite position next to its neighbors', async () => {
    const end = await settle(line([Number.POSITIVE_INFINITY, Number.NaN], true))
    expect(Array.from(end).every(Number.isFinite)).toBe(true)
    expect(Math.hypot((end[6] ?? 0) - (end[4] ?? 0), (end[7] ?? 0) - (end[5] ?? 0))).toBeLessThan(
      200,
    )
  })

  it('ignores pins at non-finite positions', async () => {
    const end = await new Promise<Float32Array>((resolve) => {
      const run = force({ engine: 'cpu' }).start(graph(), { progress: () => {}, end: resolve })
      run.pin(0, Number.NaN, 3)
    })
    expect(Array.from(end).every(Number.isFinite)).toBe(true)
  })

  it('lays out level by level when asked, with fixed nodes in place', async () => {
    const width = 15
    const count = width * width
    const edges: number[] = []
    for (let at = 0; at < count; at++) {
      if (at % width < width - 1) edges.push(at, at + 1)
      if (at + width < count) edges.push(at, at + width)
    }
    const mesh: LayoutGraph = {
      capacity: count,
      alive: new Uint8Array(count).fill(1),
      movable: Uint8Array.from({ length: count }, (_, at) => (at === 112 ? 0 : 1)),
      xy: Float32Array.from({ length: count * 2 }, (_, at) => ((at * 7919) % 997) - 498),
      radius: new Float32Array(count).fill(5),
      edges: Uint32Array.from(edges),
      keys: [],
      datum: () => undefined,
    }
    const run = (multilevel: boolean) =>
      new Promise<Float32Array>((resolve) =>
        force({ engine: 'cpu', multilevel }).start(mesh, { progress: () => {}, end: resolve }),
      )
    const folds = (xy: Float32Array) => {
      let turns = 0
      for (let at = 0; at + width < count; at++) {
        if (at % width === width - 1) continue
        const ax = xy[at * 2] ?? 0
        const ay = xy[at * 2 + 1] ?? 0
        const cross =
          ((xy[at * 2 + 2] ?? 0) - ax) * ((xy[(at + width) * 2 + 1] ?? 0) - ay) -
          ((xy[at * 2 + 3] ?? 0) - ay) * ((xy[(at + width) * 2] ?? 0) - ax)
        turns += cross > 0 ? 1 : 0
      }
      const cells = (width - 1) * (width - 1)
      return Math.min(turns, cells - turns) / cells
    }
    const levels = await run(true)
    const single = await run(false)
    expect(Array.from(levels).every(Number.isFinite)).toBe(true)
    expect([levels[224], levels[225]]).toEqual([mesh.xy[224], mesh.xy[225]])
    expect(folds(levels)).toBeLessThan(0.1)
    expect(folds(single)).toBeGreaterThan(folds(levels))
  })
})
