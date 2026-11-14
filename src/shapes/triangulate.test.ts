import { describe, expect, it } from 'vitest'
import { ringArea, triangleArea, triangulate } from './triangulate'

function random(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

function star(
  next: () => number,
  cx: number,
  cy: number,
  radius: number,
  count: number,
  low = 0.4,
) {
  const points: number[] = []
  for (let k = 0; k < count; k++) {
    const angle = ((k + 0.5 * next()) / count) * Math.PI * 2
    const reach = radius * (low + (1 - low) * next())
    points.push(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach)
  }
  return points
}

function check(points: number[], ends: number[]) {
  const coords = Float64Array.from(points)
  const result = triangulate(coords, 0, ends)
  let expected = 0
  let start = 0
  ends.forEach((end, ring) => {
    const area = Math.abs(ringArea(coords, start, end))
    expected += ring === 0 ? area : -area
    start = end
  })
  const total = (ends[ends.length - 1] ?? 0) * 1
  for (let k = 0; k < result.count; k++) {
    expect(result.indices[k]).toBeLessThan(total)
  }
  expect(result.count % 3).toBe(0)
  return { result, expected, drawn: triangleArea(coords, result.indices, result.count, 0, 0) }
}

describe('triangulate', () => {
  it('covers random simple polygons exactly', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const next = random(seed)
      const count = 3 + Math.floor(next() * 60)
      const points = star(next, 0, 0, 100, count)
      const { result, expected, drawn } = check(points, [count])
      expect(Math.abs(drawn - expected)).toBeLessThan(1e-6 * Math.abs(expected) + 1e-9)
      expect(result.forced).toBe(0)
    }
  })

  it('covers polygons with holes exactly', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const next = random(seed * 7)
      const outer = star(next, 0, 0, 1000, 60, 0.8)
      const holes = [
        star(next, -150, 0, 60, 8),
        star(next, 150, 20, 60, 6),
        star(next, 0, -200, 40, 5),
      ]
      const points = [...outer]
      const ends = [outer.length / 2]
      holes.forEach((hole, at) => {
        if (at % 2 === 1) {
          for (let k = hole.length - 2; k >= 0; k -= 2) points.push(hole[k] ?? 0, hole[k + 1] ?? 0)
        } else {
          points.push(...hole)
        }
        ends.push(points.length / 2)
      })
      const { expected, drawn } = check(points, ends)
      expect(Math.abs(drawn - expected)).toBeLessThan(1e-6 * Math.abs(expected))
    }
  })

  it('covers long fractal outlines exactly and quickly', () => {
    const misses: number[] = []
    const started = performance.now()
    for (let seed = 1; seed <= 20; seed++) {
      const next = random(seed * 13)
      const count = 2000 + Math.floor(next() * 3000)
      let size = 8
      while (size < count) size *= 2
      const height = new Float64Array(size)
      for (let k = 0; k < 8; k++) height[(k * size) / 8] = (next() - 0.5) * 0.4
      let amplitude = 0.2
      for (let step = size / 8; step > 1; step /= 2) {
        for (let k = 0; k < size; k += step) {
          const a = height[k] ?? 0
          const b = height[(k + step) % size] ?? 0
          height[k + step / 2] = (a + b) / 2 + (next() - 0.5) * amplitude
        }
        amplitude *= 0.55
      }
      const coords = new Float64Array(count * 2)
      for (let k = 0; k < count; k++) {
        const at = (k / count) * size
        const reach = 100 * (0.8 + (height[Math.floor(at)] ?? 0))
        const angle = (k / count) * Math.PI * 2
        coords[k * 2] = Math.cos(angle) * reach
        coords[k * 2 + 1] = Math.sin(angle) * reach
      }
      const result = triangulate(coords, 0, [count])
      const expected = Math.abs(ringArea(coords, 0, count))
      const drawn = triangleArea(coords, result.indices, result.count, 0, 0)
      if (Math.abs(drawn - expected) > 1e-6 * expected || result.forced > 0) misses.push(seed)
    }
    expect(misses).toEqual([])
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('covers integer grids with collinear points', () => {
    for (let size = 3; size <= 12; size++) {
      const points: number[] = []
      for (let x = 0; x < size; x++) points.push(x, 0)
      for (let y = 0; y < size; y++) points.push(size, y)
      for (let x = size; x > 0; x--) points.push(x, size)
      for (let y = size; y > 0; y--) points.push(0, y)
      const hole = [1, 1, 1, 2, 2, 2, 2, 1]
      const { expected, drawn } = check(
        [...points, ...hole],
        [points.length / 2, points.length / 2 + 4],
      )
      expect(drawn).toBeCloseTo(expected, 9)
    }
  })

  it('covers a hole that touches the outline', () => {
    const outer = [0, 0, 10, 0, 10, 10, 0, 10]
    const hole = [0, 5, 3, 7, 3, 3]
    const { expected, drawn } = check([...outer, ...hole], [4, 7])
    expect(drawn).toBeCloseTo(expected, 9)
  })

  it('covers two holes that touch each other', () => {
    const outer = [0, 0, 20, 0, 20, 20, 0, 20]
    const left = [5, 5, 5, 15, 10, 10]
    const right = [10, 10, 15, 15, 15, 5]
    const { expected, drawn } = check([...outer, ...left, ...right], [4, 7, 10])
    expect(drawn).toBeCloseTo(expected, 9)
  })

  it('ends on outlines that cross themselves', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const next = random(seed * 13)
      const count = 4 + Math.floor(next() * 30)
      const points = Array.from({ length: count * 2 }, () => next() * 100)
      const { result } = check(points, [count])
      expect(result.count).toBeLessThanOrEqual((count - 2) * 3)
    }
    const bowtie = check([0, 0, 10, 10, 10, 0, 0, 10], [4])
    expect(Math.abs(bowtie.drawn - bowtie.expected)).toBeGreaterThan(1)
    const uneven = check([0, 0, 20, 10, 20, 0, 0, 10], [4])
    expect(Math.abs(uneven.drawn - uneven.expected)).toBeGreaterThan(1)
  })

  it('returns nothing for fewer than three distinct points', () => {
    expect(triangulate(Float64Array.from([0, 0, 1, 1]), 0, [2]).count).toBe(0)
    expect(triangulate(Float64Array.from([0, 0, 0, 0, 0, 0]), 0, [3]).count).toBe(0)
  })
})
