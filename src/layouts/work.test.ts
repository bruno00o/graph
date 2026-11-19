import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { densityBundling } from '../bundling'
import { orthogonalRouting } from '../routing'
import type { BundlePaths, LayoutGraph, LayoutWork, RouteGraph } from '../types'
import { force } from './force'

const work: LayoutWork = { slice: 50, workers: false }
const count = 60

let spawned = 0

class CountedWorker {
  constructor() {
    spawned++
  }
  postMessage(): void {}
  terminate(): void {}
  addEventListener(): void {}
}

function positions(): Float32Array {
  return Float32Array.from({ length: count * 2 }, (_, index) => ((index * 37) % 101) * 4)
}

function chain(): Uint32Array {
  const ends: number[] = []
  for (let index = 1; index < count; index++)
    ends.push(index - 1, index, index, (index * 7) % count)
  return Uint32Array.from(ends)
}

function layoutGraph(): LayoutGraph {
  return {
    capacity: count,
    alive: new Uint8Array(count).fill(1),
    movable: new Uint8Array(count).fill(1),
    xy: positions(),
    radius: new Float32Array(count).fill(5),
    edges: chain(),
    keys: Array.from({ length: count }, (_, index) => `n${index}`),
    datum: () => undefined,
    work,
  }
}

function routeGraph(): RouteGraph {
  const ends = chain()
  return {
    xy: positions(),
    edges: Uint32Array.from({ length: ends.length / 2 }, (_, index) => index),
    ends,
    keys: Array.from({ length: ends.length / 2 }, (_, index) => `e${index}`),
    extents: new Float32Array(count * 2).fill(5),
    parents: new Int32Array(count).fill(-1),
    work,
    datum: () => undefined,
  }
}

beforeEach(() => {
  spawned = 0
  vi.stubGlobal('Worker', CountedWorker)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('work without workers', () => {
  it('runs force on the calling thread', async () => {
    const xy = await new Promise<Float32Array>((resolve) =>
      force().start(layoutGraph(), { progress: () => {}, end: resolve }),
    )
    expect(spawned).toBe(0)
    expect(xy.every(Number.isFinite)).toBe(true)
  })

  it('bundles and routes edges on the calling thread', async () => {
    const bundled = await new Promise<BundlePaths>((resolve) =>
      densityBundling().start(routeGraph(), { end: resolve }),
    )
    const routed = await new Promise<BundlePaths>((resolve) =>
      orthogonalRouting().start(routeGraph(), { end: resolve }),
    )
    expect(spawned).toBe(0)
    expect(bundled.offsets.length).toBeGreaterThan(0)
    expect(routed.offsets.length).toBeGreaterThan(0)
  })
})
