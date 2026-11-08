import { describe, expect, it } from 'vitest'
import { BarnesHut } from './barnes-hut'
import { xorshift32 } from './random'
import {
  Cooling,
  type ForceGraph,
  ForceSimulation,
  forceDefaults,
  prefersGpu,
  prefersMultilevel,
  resolveForce,
  springsOf,
} from './simulation'

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function graph(
  points: readonly (readonly [number, number])[],
  edges: readonly (readonly [number, number])[],
  fixed: readonly number[] = [],
  radius = 8,
): ForceGraph {
  const capacity = points.length
  return {
    capacity,
    alive: new Uint8Array(capacity).fill(1),
    movable: Uint8Array.from(points, (_, index) => (fixed.includes(index) ? 0 : 1)),
    xy: Float32Array.from(points.flat()),
    radius: new Float32Array(capacity).fill(radius),
    edges: Uint32Array.from(edges.flat()),
  }
}

function settle(simulation: ForceSimulation): number {
  let steps = 0
  while (!simulation.done && steps < 1000) {
    simulation.step()
    steps++
  }
  return steps
}

function distance(simulation: ForceSimulation, a: number, b: number): number {
  return Math.hypot(
    (simulation.x[a] ?? 0) - (simulation.x[b] ?? 0),
    (simulation.y[a] ?? 0) - (simulation.y[b] ?? 0),
  )
}

describe('BarnesHut', () => {
  it('approximates the exact repulsion', () => {
    const next = random(7)
    const count = 400
    const x = Float64Array.from({ length: count }, () => next() * 1000)
    const y = Float64Array.from({ length: count }, () => next() * 1000)
    const nodes = Uint32Array.from({ length: count }, (_, index) => index)
    const tree = new BarnesHut()
    tree.build(nodes, x, y)
    const vx = new Float64Array(count)
    const vy = new Float64Array(count)
    tree.apply(0, x, y, -1, () => 0, vx, vy)
    let ex = 0
    let ey = 0
    for (let j = 1; j < count; j++) {
      const dx = (x[j] ?? 0) - (x[0] ?? 0)
      const dy = (y[j] ?? 0) - (y[0] ?? 0)
      const l = dx * dx + dy * dy
      ex -= dx / l
      ey -= dy / l
    }
    const error = Math.hypot((vx[0] ?? 0) - ex, (vy[0] ?? 0) - ey) / Math.hypot(ex, ey)
    expect(error).toBeLessThan(0.05)
    expect(tree.cells).toBeLessThan(count * 2)
  })

  it('weighs each point by its mass when given one', () => {
    const next = random(11)
    const count = 300
    const x = Float64Array.from({ length: count }, () => next() * 1000)
    const y = Float64Array.from({ length: count }, () => next() * 1000)
    const nodes = Uint32Array.from({ length: count }, (_, index) => index)
    const push = (weights: Float32Array | null) => {
      const tree = new BarnesHut()
      tree.build(nodes, x, y, weights)
      const vx = new Float64Array(count)
      const vy = new Float64Array(count)
      tree.apply(0, x, y, -1, () => 0, vx, vy)
      return [vx[0] ?? 0, vy[0] ?? 0]
    }
    expect(push(new Float32Array(count).fill(1))).toEqual(push(null))
    const [dx, dy] = push(new Float32Array(count).fill(3))
    const [ux, uy] = push(null)
    expect(dx).toBeCloseTo((ux ?? 0) * 3, 6)
    expect(dy).toBeCloseTo((uy ?? 0) * 3, 6)
  })

  it('keeps coincident points in one leaf', () => {
    const x = new Float64Array([5, 5, 5])
    const y = new Float64Array([5, 5, 5])
    const tree = new BarnesHut()
    tree.build(Uint32Array.from([0, 1, 2]), x, y)
    expect(tree.cells).toBe(1)
  })
})

describe('ForceSimulation', () => {
  it('resolves options, keeping defaults for invalid values', () => {
    expect(resolveForce()).toEqual(forceDefaults)
    expect(resolveForce({ edgeLength: 80, repulsion: -1, gravity: Number.NaN })).toEqual({
      ...forceDefaults,
      edgeLength: 80,
    })
    expect(resolveForce({ steps: 120.4, engine: 'cpu' })).toMatchObject({
      steps: 120,
      engine: 'cpu',
    })
    expect(resolveForce({ steps: 0, engine: 'fast' as 'auto' })).toMatchObject({
      steps: 1,
      engine: 'auto',
    })
    expect(resolveForce().multilevel).toBe('auto')
    expect(resolveForce({ multilevel: true }).multilevel).toBe(true)
    expect(resolveForce({ multilevel: false }).multilevel).toBe(false)
    expect(resolveForce({ multilevel: 'yes' as 'auto' }).multilevel).toBe('auto')
  })

  it('starts from coarse levels on large runs that move most nodes', () => {
    const sized = (count: number, fixed = 0) =>
      graph(
        Array.from({ length: count }, () => [0, 0] as const),
        [],
        Array.from({ length: fixed }, (_, index) => index),
      )
    expect(prefersMultilevel(sized(999), forceDefaults)).toBe(false)
    expect(prefersMultilevel(sized(1000), forceDefaults)).toBe(true)
    expect(prefersMultilevel(sized(2400, 1000), forceDefaults)).toBe(true)
    expect(prefersMultilevel(sized(2400, 1300), forceDefaults)).toBe(false)
    expect(prefersMultilevel(sized(20), { ...forceDefaults, multilevel: true })).toBe(true)
    expect(prefersMultilevel(sized(20, 20), { ...forceDefaults, multilevel: true })).toBe(false)
    expect(prefersMultilevel(sized(5000), { ...forceDefaults, multilevel: false })).toBe(false)
    const groups = (order: number[]) =>
      ({ order: Uint32Array.from(order) }) as unknown as NonNullable<ForceGraph['groups']>
    expect(prefersMultilevel({ ...sized(5000), groups: groups([1]) }, forceDefaults)).toBe(false)
    expect(prefersMultilevel({ ...sized(5000), groups: groups([]) }, forceDefaults)).toBe(true)
  })

  it('prefers the graphics card for large graphs unless an engine is forced', () => {
    const sized = (count: number) =>
      graph(
        Array.from({ length: count }, () => [0, 0] as const),
        [],
      )
    expect(prefersGpu(sized(10), forceDefaults)).toBe(false)
    expect(prefersGpu(sized(2000), forceDefaults)).toBe(true)
    expect(prefersGpu(sized(10), { ...forceDefaults, engine: 'gpu' })).toBe(true)
    expect(prefersGpu(sized(2000), { ...forceDefaults, engine: 'cpu' })).toBe(false)
  })

  it('cools down in the requested number of steps', () => {
    const simulation = new ForceSimulation(
      graph(
        [
          [0, 0],
          [10, 0],
        ],
        [[0, 1]],
      ),
      { ...forceDefaults, steps: 50 },
    )
    expect(settle(simulation)).toBe(50)
  })

  it('cools down to completion in about three hundred steps', () => {
    const simulation = new ForceSimulation(
      graph(
        [
          [0, 0],
          [10, 0],
        ],
        [[0, 1]],
      ),
      forceDefaults,
    )
    expect(simulation.progress).toBe(0)
    const steps = settle(simulation)
    expect(steps).toBeGreaterThan(250)
    expect(steps).toBeLessThan(350)
    expect(simulation.progress).toBe(1)
  })

  it('pulls connected nodes closer than unconnected ones', () => {
    const next = random(3)
    const points = Array.from({ length: 40 }, () => [next() * 400, next() * 400] as const)
    const edges: (readonly [number, number])[] = []
    for (let i = 1; i < 20; i++) edges.push([0, i])
    for (let i = 21; i < 40; i++) edges.push([20, i])
    const simulation = new ForceSimulation(graph(points, edges), forceDefaults)
    settle(simulation)
    const within = distance(simulation, 1, 2)
    const across = distance(simulation, 1, 21)
    expect(within).toBeLessThan(across)
    expect(distance(simulation, 0, 1)).toBeLessThan(distance(simulation, 0, 20))
  })

  it('never moves fixed or pinned nodes', () => {
    const simulation = new ForceSimulation(
      graph(
        [
          [0, 0],
          [1, 0],
          [2, 0],
        ],
        [
          [0, 1],
          [1, 2],
        ],
        [0],
      ),
      forceDefaults,
    )
    simulation.step()
    simulation.pin(2, 300, 300)
    settle(simulation)
    expect([simulation.x[0], simulation.y[0]]).toEqual([0, 0])
    expect([simulation.x[2], simulation.y[2]]).toEqual([300, 300])
    expect(simulation.x[1]).not.toBe(1)
  })

  it('separates nodes that start on the same point', () => {
    const points = Array.from({ length: 12 }, () => [0, 0] as const)
    const simulation = new ForceSimulation(graph(points, []), forceDefaults)
    settle(simulation)
    let closest = Number.POSITIVE_INFINITY
    for (let a = 0; a < points.length; a++) {
      for (let b = a + 1; b < points.length; b++)
        closest = Math.min(closest, distance(simulation, a, b))
    }
    expect(closest).toBeGreaterThan(16)
  })

  it('is deterministic and leaves dead indices alone', () => {
    const run = () => {
      const input = graph(
        [
          [0, 0],
          [0, 0],
          [50, 50],
          [0, 0],
        ],
        [
          [0, 1],
          [1, 3],
          [0, 2],
        ],
      )
      const alive = Uint8Array.from([1, 1, 0, 1])
      const simulation = new ForceSimulation({ ...input, alive }, forceDefaults)
      settle(simulation)
      const out = new Float32Array(8)
      simulation.write(out)
      return Array.from(out)
    }
    const first = run()
    expect(run()).toEqual(first)
    expect(first.slice(4, 6)).toEqual([50, 50])
  })

  it('starts partial runs cooler and without gravity', () => {
    const simulation = new ForceSimulation(
      graph(
        [
          [0, 0],
          [500, 0],
        ],
        [],
        [0],
      ),
      forceDefaults,
    )
    expect(simulation.alpha).toBe(0.5)
    settle(simulation)
    expect(simulation.x[1]).toBeGreaterThanOrEqual(500)
  })

  it('has nothing to do without movable nodes', () => {
    const simulation = new ForceSimulation(graph([[0, 0]], [], [0]), forceDefaults)
    expect(simulation.done).toBe(true)
    expect(simulation.progress).toBe(1)
  })

  it('softens hubs and moves the end with fewer edges more', () => {
    const springs = springsOf(
      graph(
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0],
          [4, 0],
        ],
        [
          [0, 1],
          [0, 2],
          [0, 3],
          [3, 4],
          [4, 4],
        ],
      ),
      40,
    )
    expect(springs.count).toBe(4)
    expect(Array.from(springs.ends)).toEqual([0, 1, 0, 2, 0, 3, 3, 4])
    expect(Array.from(springs.stiffness)).toEqual([1, 1, 0.5, 1])
    expect(Array.from(springs.share)).toEqual([0.25, 0.25, 0.4, 1 / 3])
    expect(Array.from(springs.rest)).toEqual([56, 56, 56, 56])
  })
})

describe('Cooling', () => {
  it('reaches the floor after the requested steps, sooner from a cooler start', () => {
    const count = (cooling: Cooling) => {
      let steps = 0
      while (!cooling.done) {
        expect(cooling.alpha).toBeGreaterThan(0.001)
        cooling.advance()
        steps++
      }
      return steps
    }
    expect(count(new Cooling(1, 300))).toBe(300)
    expect(count(new Cooling(0.5, 300))).toBe(270)
    expect(count(new Cooling(0, 300))).toBe(0)
  })
})

describe('xorshift32', () => {
  it('repeats its sequence for a seed and stays in [0, 1)', () => {
    const a = xorshift32(42)
    const b = xorshift32(42)
    const values = Array.from({ length: 1000 }, () => a())
    expect(Array.from({ length: 1000 }, () => b())).toEqual(values)
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
    expect(new Set(values).size).toBe(1000)
  })
})
