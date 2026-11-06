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
  }
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
})
