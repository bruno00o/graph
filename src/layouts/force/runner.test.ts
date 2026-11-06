import { describe, expect, it, vi } from 'vitest'
import type { LayoutRun } from '../../types'
import type { GpuForce } from './gpu'
import { runGpuForce, snapshotInterval } from './runner'
import { type ForceGraph, forceDefaults } from './simulation'

function graph(): ForceGraph {
  return {
    capacity: 3,
    alive: Uint8Array.from([1, 1, 1]),
    movable: Uint8Array.from([1, 1, 0]),
    xy: Float32Array.from([0, 0, 50, 0, 100, 0]),
    radius: new Float32Array(3).fill(4),
    edges: Uint32Array.from([0, 1]),
  }
}

function fakeGpu(steps: number, failAt = -1) {
  let done = 0
  let reads = 0
  const fake = {
    fixed: Uint8Array.from([0, 0, 1]),
    lost: false,
    pins: [] as number[][],
    destroyed: false,
    get done() {
      return done >= steps
    },
    get progress() {
      return done / steps
    },
    step: () => {
      done++
    },
    read: async (target: Float32Array) => {
      reads++
      if (reads === failAt) return false
      target[0] = done
      target[1] = -1000
      return true
    },
    pin: (index: number, x: number, y: number) => {
      fake.pins.push([index, x, y])
    },
    destroy: () => {
      fake.destroyed = true
    },
  }
  return fake
}

describe('snapshotInterval', () => {
  it('spaces snapshots out as the graph grows', () => {
    expect(snapshotInterval(graph())).toBe(32)
    const capacity = 400_000
    const large: ForceGraph = {
      ...graph(),
      capacity,
      alive: new Uint8Array(capacity).fill(1),
      edges: new Uint32Array(800_000),
    }
    expect(snapshotInterval(large)).toBe(128)
  })
})

describe('runGpuForce', () => {
  it('streams snapshots, then separates and ends', async () => {
    const gpu = fakeGpu(40)
    const progress: number[] = []
    const end = await new Promise<Float32Array>((resolve) => {
      runGpuForce(
        gpu as unknown as GpuForce,
        graph(),
        forceDefaults,
        { progress: (_, value) => progress.push(value), end: resolve },
        () => {
          throw new Error('no fallback expected')
        },
      )
    })
    expect(progress.length).toBeGreaterThan(0)
    expect(progress.every((value) => value > 0 && value < 1)).toBe(true)
    expect(end[0]).toBe(40)
    expect(Array.from(end.subarray(4, 6))).toEqual([100, 0])
    expect(gpu.destroyed).toBe(true)
  })

  it('forwards pins and falls back to the processor when the context is lost', async () => {
    const gpu = fakeGpu(1000, 2)
    const pinned: number[][] = []
    const rescue = vi.fn((xy: Float32Array): LayoutRun => {
      expect(xy[0]).toBeGreaterThan(0)
      return { pin: (index, x, y) => pinned.push([index, x, y]), stop: () => {} }
    })
    const run = runGpuForce(
      gpu as unknown as GpuForce,
      graph(),
      forceDefaults,
      { progress: () => {}, end: () => {} },
      rescue,
    )
    run.pin(1, 7, 8)
    expect(gpu.pins).toEqual([[1, 7, 8]])
    await vi.waitFor(() => expect(rescue).toHaveBeenCalledTimes(1))
    expect(gpu.destroyed).toBe(true)
    expect(pinned).toEqual([[1, 7, 8]])
    run.pin(0, 1, 2)
    expect(pinned).toEqual([
      [1, 7, 8],
      [0, 1, 2],
    ])
  })

  it('reports nothing once stopped', async () => {
    const gpu = fakeGpu(1000)
    const listener = { progress: vi.fn(), end: vi.fn() }
    const run = runGpuForce(gpu as unknown as GpuForce, graph(), forceDefaults, listener, () => {
      throw new Error('no fallback expected')
    })
    run.stop()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(listener.progress).not.toHaveBeenCalled()
    expect(listener.end).not.toHaveBeenCalled()
    expect(gpu.destroyed).toBe(true)
  })
})
