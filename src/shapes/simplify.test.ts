import { describe, expect, it } from 'vitest'
import { detailedFrom, effectiveAreas, simplifiedLevels } from './simplify'
import { ringArea } from './triangulate'

function random(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

function coastline(next: () => number, count: number, cx: number, cy: number, radius: number) {
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
  const points: number[] = []
  for (let k = 0; k < count; k++) {
    const at = (k / count) * size
    const low = Math.floor(at)
    const t = at - low
    const reach = 0.8 + (height[low] ?? 0) * (1 - t) + (height[(low + 1) % size] ?? 0) * t
    const angle = (k / count) * Math.PI * 2
    points.push(cx + Math.cos(angle) * radius * reach, cy + Math.sin(angle) * radius * reach)
  }
  return points
}

function noisy(next: () => number, count: number, cx: number, cy: number, radius: number) {
  const points: number[] = []
  for (let k = 0; k < count; k++) {
    const angle = ((k + 0.5 * next()) / count) * Math.PI * 2
    const reach = radius * (0.6 + 0.4 * next())
    points.push(cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach)
  }
  return points
}

function walk(next: () => number, count: number) {
  const points: number[] = []
  let x = 0
  let y = 0
  let heading = 0
  for (let k = 0; k < count; k++) {
    heading += (next() - 0.5) * 0.6
    x += Math.cos(heading) * (0.5 + next())
    y += Math.sin(heading) * (0.5 + next())
    points.push(x, y)
  }
  return points
}

function segmentDistance(points: Float64Array, x: number, y: number, a: number, b: number) {
  const ax = points[a * 2] ?? 0
  const ay = points[a * 2 + 1] ?? 0
  const dx = (points[b * 2] ?? 0) - ax
  const dy = (points[b * 2 + 1] ?? 0) - ay
  const length = dx * dx + dy * dy
  const t = length > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / length)) : 0
  return Math.hypot(x - ax - t * dx, y - ay - t * dy)
}

function ringsOf(rings: Uint32Array): [number, number][] {
  const spans: [number, number][] = []
  let start = 0
  for (const end of rings) {
    spans.push([start, end])
    start = end
  }
  return spans
}

function verify(points: Float64Array, rings: Uint32Array, closed: boolean) {
  const areas = effectiveAreas(points, rings, closed)
  const levels = simplifiedLevels(points, rings, closed)
  const original = ringsOf(rings)
  const problems: string[] = []
  const fail = (text: string) => {
    if (problems.length < 5) problems.push(text)
  }
  let previous = points.length / 2
  levels.forEach((level, rank) => {
    const kept = level.kept
    if (kept.length >= previous) fail(`level ${rank} does not shrink`)
    previous = kept.length
    for (let at = 0; at < kept.length; at++) {
      const k = kept[at] ?? 0
      if (
        level.points[at * 2] !== points[k * 2] ||
        level.points[at * 2 + 1] !== points[k * 2 + 1]
      ) {
        fail(`level ${rank} moves point ${k}`)
      }
      if (at > 0 && k <= (kept[at - 1] ?? 0)) fail(`level ${rank} reorders point ${k}`)
    }
    const simplified = ringsOf(level.rings)
    if (simplified.length !== original.length) fail(`level ${rank} loses a ring`)
    simplified.forEach(([from, to], ring) => {
      const [start, end] = original[ring] ?? [0, 0]
      const size = end - start
      if (to - from < Math.min(size, closed ? 3 : 2)) fail(`level ${rank} empties ring ${ring}`)
      for (let at = from; at < to; at++) {
        const k = kept[at] ?? 0
        if (k < start || k >= end) fail(`level ${rank} mixes rings`)
      }
      if (!closed && (kept[from] !== start || kept[to - 1] !== end - 1)) {
        fail(`level ${rank} drops an end of line ${ring}`)
      }
      let removed = 0
      for (let k = start; k < end; k++) {
        if ((areas[k] ?? 0) <= level.area) removed += areas[k] ?? 0
      }
      if (closed) {
        const change = Math.abs(ringArea(level.points, from, to) - ringArea(points, start, end))
        if (change > removed * (1 + 1e-9) + 1e-9)
          fail(`level ${rank} changes the area by ${change}`)
        if (change > (size - (to - from)) * level.area + 1e-9) fail(`level ${rank} passes n T`)
      }
      for (let k = start; k < end; k++) {
        const x = points[k * 2] ?? 0
        const y = points[k * 2 + 1] ?? 0
        let nearest = Number.POSITIVE_INFINITY
        const last = closed ? to : to - 1
        for (let at = from; at < last; at++) {
          const next = at + 1 < to ? at + 1 : from
          nearest = Math.min(nearest, segmentDistance(level.points, x, y, at, next))
        }
        if (nearest > level.error * (1 + 1e-9) + 1e-9) fail(`level ${rank} leaves point ${k} far`)
      }
    })
  })
  expect(problems).toEqual([])
  return levels
}

describe('simplifiedLevels', () => {
  it('keeps every ring, bounds the area change and the distance on outlines', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const next = random(seed)
      const make = seed % 2 === 0 ? coastline : noisy
      const points: number[] = []
      const ends: number[] = []
      const parts = 1 + Math.floor(next() * 3)
      for (let part = 0; part < parts; part++) {
        const count =
          part === 0 ? detailedFrom + Math.floor(next() * 3000) : Math.floor(next() * 300)
        points.push(...make(next, count, part * 400, 0, 100 + next() * 50))
        ends.push(points.length / 2)
      }
      const levels = verify(Float64Array.from(points), Uint32Array.from(ends), true)
      expect(levels.length).toBeGreaterThan(0)
    }
  })

  it('keeps both ends of every line', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const next = random(seed + 100)
      const points: number[] = []
      const ends: number[] = []
      const parts = 1 + Math.floor(next() * 3)
      for (let part = 0; part < parts; part++) {
        points.push(...walk(next, detailedFrom + Math.floor(next() * 2000)))
        ends.push(points.length / 2)
      }
      const levels = verify(Float64Array.from(points), Uint32Array.from(ends), false)
      expect(levels.length).toBeGreaterThan(0)
    }
  })

  it('keeps tiny rings whole beside a detailed one', () => {
    const next = random(7)
    const points = [...coastline(next, 2000, 0, 0, 100), 500, 0, 501, 0, 500, 1, 600, 0, 601, 1]
    const levels = verify(Float64Array.from(points), Uint32Array.of(2000, 2003, 2005), true)
    for (const level of levels) {
      const ends = Array.from(level.rings)
      expect((ends[1] ?? 0) - (ends[0] ?? 0)).toBe(3)
      expect((ends[2] ?? 0) - (ends[1] ?? 0)).toBe(2)
    }
  })

  it('makes no level for small outlines', () => {
    const next = random(3)
    const points = Float64Array.from(coastline(next, detailedFrom - 1, 0, 0, 100))
    expect(simplifiedLevels(points, Uint32Array.of(detailedFrom - 1), true)).toEqual([])
  })

  it('never removes the ends of a line nor the last three points of a ring', () => {
    const next = random(11)
    const line = Float64Array.from(walk(next, 50))
    const areas = effectiveAreas(line, Uint32Array.of(50), false)
    expect(areas[0]).toBe(Number.POSITIVE_INFINITY)
    expect(areas[49]).toBe(Number.POSITIVE_INFINITY)
    const ring = Float64Array.from(noisy(next, 50, 0, 0, 10))
    const closed = effectiveAreas(ring, Uint32Array.of(50), true)
    expect(Array.from(closed).filter((area) => area === Number.POSITIVE_INFINITY).length).toBe(3)
  })
})
