import { describe, expect, it } from 'vitest'
import { Collider, separate } from './collider'

function overlaps(xy: Float32Array, radius: Float32Array): number {
  let count = 0
  for (let a = 0; a < radius.length; a++) {
    for (let b = a + 1; b < radius.length; b++) {
      const d = Math.hypot(
        (xy[a * 2] ?? 0) - (xy[b * 2] ?? 0),
        (xy[a * 2 + 1] ?? 0) - (xy[b * 2 + 1] ?? 0),
      )
      if (d < (radius[a] ?? 0) + (radius[b] ?? 0)) count++
    }
  }
  return count
}

describe('separate', () => {
  it('pushes overlapping nodes apart and leaves fixed and dead nodes in place', () => {
    const count = 60
    const radius = new Float32Array(count).fill(5)
    const xy = Float32Array.from({ length: count * 2 }, (_, at) => ((at * 7919) % 97) - 48)
    const alive = new Uint8Array(count).fill(1)
    alive[1] = 0
    const fixed = new Uint8Array(count)
    fixed[0] = 1
    fixed[1] = 1
    const before = xy.slice()
    expect(overlaps(xy, radius)).toBeGreaterThan(10)
    separate(radius, alive, fixed, xy, 2, 40)
    const living = (array: Float32Array) => array.filter((_, at) => Math.floor(at / 2) !== 1)
    expect(overlaps(xy, radius) - overlaps(before, radius)).toBeLessThan(0)
    expect(overlaps(Float32Array.from(living(xy)), radius.subarray(1))).toBe(0)
    expect(Array.from(xy.subarray(0, 4))).toEqual(Array.from(before.subarray(0, 4)))
  })

  it('does nothing without movable nodes', () => {
    const xy = Float32Array.from([0, 0, 0, 0])
    separate(
      new Float32Array(2).fill(5),
      Uint8Array.from([1, 1]),
      Uint8Array.from([1, 1]),
      xy,
      2,
      10,
    )
    expect(Array.from(xy)).toEqual([0, 0, 0, 0])
  })
})

describe('Collider', () => {
  it('pushes overlapping nodes apart, the larger one less, and leaves fixed nodes alone', () => {
    const radius = Float32Array.from([10, 5, 5])
    const nodes = Uint32Array.from([0, 1, 2])
    const fixed = Uint8Array.from([0, 0, 1])
    const x = Float64Array.from([0, 12, 100])
    const y = Float64Array.from([0, 0, 100])
    const vx = new Float64Array(3)
    const vy = new Float64Array(3)
    new Collider(radius, nodes, 2).apply(nodes, fixed, x, y, vx, vy, 1, () => 0)
    expect(vx[0]).toBeCloseTo(-1)
    expect(vx[1]).toBeCloseTo(4)
    expect(Array.from(vy)).toEqual([0, 0, 0])
    expect(vx[2]).toBe(0)
  })
})

function rows(count: number): Float32Array {
  const side = Math.ceil(Math.sqrt(count))
  return Float32Array.from({ length: count * 2 }, (_, at) =>
    at % 2 === 0 ? ((at >> 1) % side) * 12 : Math.floor((at >> 1) / side) * 12,
  )
}

function fastest(run: () => void): number {
  let best = Number.POSITIVE_INFINITY
  for (let round = 0; round < 3; round++) {
    const started = performance.now()
    run()
    best = Math.min(best, performance.now() - started)
  }
  return best
}

describe('collisions with one large node', () => {
  const count = 40_000
  const even = new Float32Array(count).fill(5)
  const hub = even.slice()
  hub[0] = 50

  it('separates about as fast when one node is ten times larger', () => {
    const alive = new Uint8Array(count).fill(1)
    const fixed = new Uint8Array(count)
    const base = fastest(() => separate(even, alive, fixed, rows(count), 6, 10))
    const uneven = fastest(() => separate(hub, alive, fixed, rows(count), 6, 10))
    expect(uneven).toBeLessThan(base * 3)
  })

  it('runs a collision step about as fast when one node is ten times larger', () => {
    const nodes = Uint32Array.from({ length: count }, (_, index) => index)
    const fixed = new Uint8Array(count)
    const step = (radius: Float32Array) => {
      const xy = rows(count)
      const x = Float64Array.from({ length: count }, (_, index) => xy[index * 2] ?? 0)
      const y = Float64Array.from({ length: count }, (_, index) => xy[index * 2 + 1] ?? 0)
      const collider = new Collider(radius, nodes, 6)
      const vx = new Float64Array(count)
      const vy = new Float64Array(count)
      return fastest(() => collider.apply(nodes, fixed, x, y, vx, vy, 0.5, () => 0))
    }
    expect(step(hub)).toBeLessThan(step(even) * 3)
  })

  it('still pushes small nodes off the large one', () => {
    const radius = Float32Array.from([60, 5, 5, 5])
    const xy = Float32Array.from([0, 0, 30, 0, 0, -40, 500, 500])
    const before = xy.slice()
    separate(radius, new Uint8Array(4).fill(1), Uint8Array.from([1, 0, 0, 0]), xy, 2, 10)
    expect(Math.hypot(xy[2] ?? 0, xy[3] ?? 0)).toBeGreaterThanOrEqual(67 - 1e-3)
    expect(Math.hypot(xy[4] ?? 0, xy[5] ?? 0)).toBeGreaterThanOrEqual(67 - 1e-3)
    expect(Array.from(xy.subarray(6, 8))).toEqual(Array.from(before.subarray(6, 8)))
  })

  it('removes every overlap between nodes of very different sizes', () => {
    let state = 7
    const next = () => {
      state = (state * 1664525 + 1013904223) >>> 0
      return state / 4294967296
    }
    const count = 400
    const radius = Float32Array.from({ length: count }, () => 50 ** next())
    const xy = Float32Array.from({ length: count * 2 }, () => next() * 1500)
    const alive = new Uint8Array(count).fill(1)
    expect(overlaps(xy, radius)).toBeGreaterThan(20)
    separate(radius, alive, new Uint8Array(count), xy, 1, 400)
    expect(overlaps(xy, radius)).toBe(0)
  })
})
