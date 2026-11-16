import { describe, expect, it } from 'vitest'
import { allTime, intersectPeriods, intersectThree, noTime } from './periods'
import { noPeriods, readBounds, readPeriods } from './time-range'

function random(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4_294_967_296
  }
}

function periods(next: () => number): Float64Array {
  const value: unknown[] = []
  const count = Math.floor(next() * 5)
  for (let at = 0; at < count; at++) {
    const start = Math.floor(next() * 60)
    const roll = next()
    if (roll < 0.25) value.push(start)
    else if (roll < 0.3) value.push({ end: start })
    else if (roll < 0.35) value.push({ start })
    else value.push({ start, end: start + 1 + Math.floor(next() * 15) })
  }
  const read = readPeriods(value)
  return read === noPeriods ? allTime : readBounds(read)
}

function pieces(list: Float64Array): [number, number][] {
  const out: [number, number][] = []
  for (let at = 0; at + 1 < list.length; at += 2) out.push([list[at] ?? 0, list[at + 1] ?? 0])
  return out
}

function covers(list: Float64Array, moment: number): boolean {
  for (const [start, end] of pieces(list)) {
    if (start === end ? moment === start : start <= moment && moment < end) return true
  }
  return false
}

function naive(...lists: Float64Array[]): [number, number][] {
  let out: [number, number][] = [[Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]]
  for (const list of lists) {
    const next: [number, number][] = []
    for (const [s, e] of out) {
      for (const [t, f] of pieces(list)) {
        const start = Math.max(s, t)
        const end = Math.min(e, f)
        if (end >= start) next.push([start, end])
      }
    }
    out = next
  }
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  return out.filter((piece, at) => at === 0 || piece.join() !== out[at - 1]?.join())
}

describe('intersectPeriods', () => {
  it('keeps the moments every list covers', () => {
    expect(
      Array.from(intersectPeriods(Float64Array.of(0, 10, 20, 30), Float64Array.of(5, 25))),
    ).toEqual([5, 10, 20, 25])
    expect(intersectPeriods(Float64Array.of(0, 10), Float64Array.of(12, 20))).toBe(noTime)
    expect(Array.from(intersectPeriods(Float64Array.of(0, 10), Float64Array.of(10, 20)))).toEqual([
      10, 10,
    ])
    expect(Array.from(intersectPeriods(Float64Array.of(0, 10), Float64Array.of(4, 4)))).toEqual([
      4, 4,
    ])
    expect(intersectPeriods(allTime, allTime)).toBe(allTime)
    expect(intersectPeriods(Float64Array.of(0, 10), Float64Array.of(10, 20), true)).toBe(noTime)
    expect(
      Array.from(intersectPeriods(Float64Array.of(0, 10), Float64Array.of(4, 4), true)),
    ).toEqual([4, 4])
    expect(
      Array.from(intersectPeriods(Float64Array.of(10, 10), Float64Array.of(10, 20), true)),
    ).toEqual([10, 10])
  })

  it('keeps an instant that follows a period ending at the same moment', () => {
    const closed = Float64Array.of(0, 10, 10, 10)
    const instant = Float64Array.of(10, 10)
    expect(Array.from(intersectPeriods(closed, instant, true))).toEqual([10, 10])
    expect(Array.from(intersectPeriods(instant, closed, true))).toEqual([10, 10])
    expect(Array.from(intersectPeriods(closed, Float64Array.of(5, 10, 10, 10), true))).toEqual([
      5, 10, 10, 10,
    ])
    expect(Array.from(intersectThree(closed, instant, Float64Array.of(0, 20), true))).toEqual([
      10, 10,
    ])
  })

  it('matches every pair of periods on random lists', () => {
    const next = random(5)
    const misses: string[] = []
    for (let round = 0; round < 2_000; round++) {
      const a = periods(next)
      const b = periods(next)
      const c = periods(next)
      expect(pieces(intersectPeriods(a, b)), `round ${round}`).toEqual(naive(a, b))
      expect(pieces(intersectThree(a, b, c)), `round ${round}`).toEqual(naive(a, b, c))
      const strict = intersectPeriods(a, b, true)
      const strictThree = intersectThree(a, b, c, true)
      for (let moment = -2; moment < 80; moment += 0.5) {
        const both = covers(a, moment) && covers(b, moment)
        if (covers(strict, moment) !== both) misses.push(`round ${round} at ${moment}, two lists`)
        if (covers(strictThree, moment) !== (both && covers(c, moment))) {
          misses.push(`round ${round} at ${moment}, three lists`)
        }
      }
    }
    expect(misses).toEqual([])
  })
})
