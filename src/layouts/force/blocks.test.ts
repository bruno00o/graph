import { describe, expect, it } from 'vitest'
import type { LayoutGraph } from '../../types'
import { coarsen } from './coarsen'
import { force } from './index'
import {
  type ForceGraph,
  forceDefaults,
  forceGraphOf,
  resolveForce,
  settingsIn,
} from './simulation'

function scatter(count: number, size: (index: number) => number = () => 0): LayoutGraph {
  const golden = Math.PI * (3 - Math.sqrt(5))
  return {
    capacity: count,
    alive: new Uint8Array(count).fill(1),
    movable: new Uint8Array(count).fill(1),
    xy: Float32Array.from({ length: count * 2 }, (_, at) => {
      const index = at >> 1
      const angle = index * golden
      const r = 10 * Math.sqrt(index + 1)
      return at % 2 === 0 ? Math.cos(angle) * r : Math.sin(angle) * r
    }),
    radius: new Float32Array(count).fill(5),
    edges: new Uint32Array(0),
    keys: Array.from({ length: count }, (_, index) => `n${index}`),
    datum: () => undefined,
    blocks: {
      size: Uint32Array.from({ length: count }, (_, index) => size(index)),
      items: () => [],
      keys: () => [],
    },
  }
}

function settle(graph: LayoutGraph, options = {}): Promise<Float32Array> {
  return new Promise((resolve) =>
    force({ engine: 'cpu', ...options }).start(graph, { progress: () => {}, end: resolve }),
  )
}

function distance(xy: Float32Array, a: number, b: number): number {
  return Math.hypot(
    (xy[a * 2] ?? 0) - (xy[b * 2] ?? 0),
    (xy[a * 2 + 1] ?? 0) - (xy[b * 2 + 1] ?? 0),
  )
}

function area(xy: Float32Array, count: number): number {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let index = 0; index < count; index++) {
    minX = Math.min(minX, xy[index * 2] ?? 0)
    maxX = Math.max(maxX, xy[index * 2] ?? 0)
    minY = Math.min(minY, xy[index * 2 + 1] ?? 0)
    maxY = Math.max(maxY, xy[index * 2 + 1] ?? 0)
  }
  return (maxX - minX) * (maxY - minY)
}

const container = { key: 'g', datum: undefined, circle: false }

describe('forceGraphOf', () => {
  it('weighs each block by its nodes, and plain nodes by one', () => {
    const graph = forceGraphOf(scatter(3, (index) => [0, 1, 40][index] ?? 0))
    expect(Array.from(graph.mass ?? [])).toEqual([1, 1, 40])
  })

  it('gives no mass without blocks', () => {
    const { blocks: _, ...plain } = scatter(3)
    expect(forceGraphOf(plain).mass).toBeUndefined()
  })
})

describe('settingsIn', () => {
  it('keeps the settings outside a container', () => {
    const { blocks: _, ...plain } = scatter(3)
    expect(settingsIn(plain, forceDefaults, {})).toBe(forceDefaults)
  })

  it('pulls toward the center with the cohesion and takes 120 steps in a container', () => {
    const settings = resolveForce({ cohesion: 0.3 })
    const inside = settingsIn({ ...scatter(10), container }, settings, { cohesion: 0.3 })
    expect(inside.gravity).toBe(0.3)
    expect(inside.steps).toBe(120)
  })

  it('keeps given steps, and the default from 1,000 nodes', () => {
    const graph = { ...scatter(10), container }
    expect(settingsIn(graph, resolveForce({ steps: 50 }), { steps: 50 }).steps).toBe(50)
    const large = { ...scatter(1000), container }
    expect(settingsIn(large, forceDefaults, {}).steps).toBe(300)
  })
})

describe('force with blocks', () => {
  it('pushes nodes farther from a heavy block', async () => {
    const light = await settle(scatter(12))
    const heavy = await settle(scatter(12, (index) => (index === 0 ? 60 : 0)))
    let lightMean = 0
    let heavyMean = 0
    for (let index = 1; index < 12; index++) {
      lightMean += distance(light, 0, index) / 11
      heavyMean += distance(heavy, 0, index) / 11
    }
    expect(heavyMean).toBeGreaterThan(lightMean * 2)
  })

  it('stays compact in a container', async () => {
    const outside = await settle(scatter(40))
    const inside = await settle({ ...scatter(40), container })
    expect(area(inside, 40)).toBeLessThan(area(outside, 40) * 0.3)
  })

  it('declares that its result may turn freely', () => {
    expect(force().turns).toBe('free')
  })

  it('sums the mass of blocks on coarse levels', () => {
    const count = 64
    const graph: ForceGraph = {
      ...forceGraphOf(scatter(count, (index) => (index % 2 === 0 ? 3 : 0))),
      edges: Uint32Array.from({ length: (count - 1) * 2 }, (_, at) => (at >> 1) + (at % 2)),
    }
    const [level] = coarsen(graph, { coarsest: 10, stall: 0.9, edgeLength: 40, keep: 16 })
    let total = 0
    for (const mass of level?.mass ?? []) total += mass
    expect(total).toBe(32 * 3 + 32)
  })
})
