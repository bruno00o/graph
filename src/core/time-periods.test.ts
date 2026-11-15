import { describe, expect, it } from 'vitest'
import type { TimeValue } from '../types'
import {
  noPeriods,
  packTime,
  readBounds,
  readPeriods,
  type TimeFilter,
  TimeSpans,
  timeFilter,
} from './time-range'

function random(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
}

function periods(value: unknown): number[] | null {
  const count = readPeriods(value)
  return count === noPeriods ? null : Array.from(readBounds(count))
}

function filter(start: number, end: number, fade = 0): TimeFilter {
  return timeFilter({ start, end }, fade) as TimeFilter
}

const packedSpan = new Float32Array(4)

function single(start: number, end: number): Float32Array {
  packTime(start, packedSpan, 0)
  packTime(end, packedSpan, 2)
  return packedSpan
}

function naiveShown(bounds: readonly number[] | null, window: TimeFilter): boolean {
  if (!bounds) return true
  for (let at = 0; at < bounds.length; at += 2) {
    if (window.covers(single(bounds[at] ?? 0, bounds[at + 1] ?? 0), 0)) return true
  }
  return false
}

function naiveOpacity(bounds: readonly number[] | null, window: TimeFilter): number {
  if (!bounds) return 1
  let best = 0
  for (let at = 0; at < bounds.length; at += 2) {
    const start = bounds[at] ?? 0
    const end = bounds[at + 1] ?? 0
    if (!window.covers(single(start, end), 0)) continue
    best = Math.max(best, window.depth(start, end))
  }
  return best
}

describe('readPeriods', () => {
  it('reads one value as one period and a list as merged periods', () => {
    expect(periods(5)).toEqual([5, 5])
    expect(periods({ start: 1, end: 4 })).toEqual([1, 4])
    expect(periods([{ start: 6, end: 8 }, 2, { start: 1, end: 3 }])).toEqual([1, 3, 6, 8])
  })

  it('merges periods that touch or overlap, and keeps an instant at the end of a period', () => {
    expect(
      periods([
        { start: 1, end: 5 },
        { start: 5, end: 8 },
      ]),
    ).toEqual([1, 8])
    expect(periods([{ start: 1, end: 5 }, 3, 5, 5])).toEqual([1, 5, 5, 5])
    expect(periods([5, { start: 5, end: 8 }])).toEqual([5, 8])
    expect(periods([{ start: 1, end: 9 }, { start: 2 }])).toEqual([1, Number.POSITIVE_INFINITY])
  })

  it('skips invalid entries, and gives no time to a list that covers all time', () => {
    expect(periods([null, 'soon', Number.NaN, 4, { start: 'x' }])).toEqual([4, 4])
    expect(periods([])).toEqual([])
    expect(periods([null])).toEqual([])
    expect(periods([3, {}])).toBeNull()
    expect(periods([{ end: 5 }, { start: 2 }])).toBeNull()
    expect(periods(null)).toBeNull()
    expect(periods('2026')).toBeNull()
  })

  it('reads any iterable and dates', () => {
    expect(periods(new Set([new Date(4), new Date(2)]))).toEqual([2, 2, 4, 4])
  })
})

describe('TimeSpans with several periods', () => {
  it('writes a single-period list exactly like a single value', () => {
    const a = new TimeSpans()
    const b = new TimeSpans()
    a.read(0, { start: 3, end: 7 })
    b.read(0, [
      { start: 3, end: 5 },
      { start: 4, end: 7 },
    ])
    expect(b.packed).toEqual(a.packed)
    expect(b.list(0)).toBeUndefined()
    expect(b.several).toBe(0)
  })

  it('never shows an empty list, and gives no time to null', () => {
    const spans = new TimeSpans()
    spans.read(0, [])
    spans.read(1, null)
    spans.read(2, 4)
    const window = filter(0, 10)
    spans.select(window)
    expect(spans.shown(0, window)).toBe(false)
    expect(spans.timed(0)).toBe(true)
    expect(spans.timed(1)).toBe(false)
    expect(spans.shown(1, window)).toBe(true)
    expect(spans.count).toBe(2)
    expect(spans.shown(0, null)).toBe(true)
  })

  it('places the period that counts for the window and logs the swaps', () => {
    const spans = new TimeSpans()
    spans.read(0, [
      { start: 0, end: 10 },
      { start: 20, end: 30 },
    ])
    const cursor = spans.swaps.cursor()
    const early = filter(5, 6)
    spans.select(early)
    expect([spans.start[0], spans.end[0]]).toEqual([0, 10])
    expect(spans.shown(0, early)).toBe(true)
    const gap = filter(12, 15)
    spans.select(gap)
    expect(spans.shown(0, gap)).toBe(false)
    const late = filter(25, 26)
    spans.select(late)
    expect([spans.start[0], spans.end[0]]).toEqual([20, 30])
    expect(spans.shown(0, late)).toBe(true)
    expect(Array.from(spans.swaps.since(cursor) ?? [])).toEqual([0, 0])
    expect(spans.shown(0, early)).toBe(true)
    expect(spans.opacity(0, filter(5, 25, 4))).toBe(1)
  })

  it('takes the deepest period of a fading window', () => {
    const spans = new TimeSpans()
    spans.read(0, [
      { start: 0, end: 10 },
      { start: 19, end: 30 },
    ])
    const window = filter(4, 20, 4)
    spans.select(window)
    expect([spans.start[0], spans.end[0]]).toEqual([0, 10])
    expect(spans.opacity(0, window)).toBe(1)
  })

  it('counts boundaries of every period for the detail step', () => {
    const spans = new TimeSpans()
    spans.read(0, [1, 5, 9])
    const a = filter(2, 3)
    const b = filter(6, 7)
    expect(spans.step(a)).not.toBe(spans.step(b))
    expect(spans.step(filter(6, 6.5))).toBe(spans.step(b))
  })

  it('removes a list when one value or nothing replaces it', () => {
    const spans = new TimeSpans()
    spans.read(0, [1, 5])
    spans.read(0, 3)
    expect(spans.list(0)).toBeUndefined()
    expect(spans.several).toBe(0)
    spans.read(0, [1, 5])
    spans.clear(0)
    expect(spans.timed(0)).toBe(false)
    expect(spans.count).toBe(0)
  })
})

function randomValue(next: () => number): unknown {
  const kind = next()
  if (kind < 0.08) return null
  if (kind < 0.25) return Math.floor(next() * 40)
  if (kind < 0.35) {
    const start = Math.floor(next() * 40)
    return { start, end: start + Math.floor(next() * 10) }
  }
  const list: TimeValue[] = []
  const count = Math.floor(next() * 5)
  for (let at = 0; at < count; at++) {
    const start = Math.floor(next() * 40)
    const shape = next()
    if (shape < 0.3) list.push(start)
    else if (shape < 0.35) list.push({ end: start })
    else if (shape < 0.4) list.push({ start })
    else list.push({ start, end: start + 1 + Math.floor(next() * 8) })
  }
  return list
}

function randomWindow(next: () => number): TimeFilter | null {
  const kind = next()
  if (kind < 0.05) return null
  const start = Math.floor(next() * 44) - 2
  const end = kind < 0.25 ? start : start + Math.floor(next() * 10)
  const fade = next() < 0.25 ? 1 + Math.floor(next() * 4) : 0
  return filter(start, end, fade)
}

describe('TimeSpans fuzz', () => {
  it('shows what a naive reading of every period shows, and logs every change', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const next = random(seed)
      const size = 24
      const spans = new TimeSpans()
      spans.reserve(size)
      const values: unknown[] = []
      for (let index = 0; index < size; index++) {
        values[index] = randomValue(next)
        spans.read(index, values[index])
      }
      const mirror = spans.packed.slice()
      let changes = spans.changes.cursor()
      let swaps = spans.swaps.cursor()
      for (let step = 0; step < 80; step++) {
        const action = next()
        if (action < 0.3) {
          const index = Math.floor(next() * size)
          values[index] = randomValue(next)
          spans.read(index, values[index])
        }
        const window = randomWindow(next)
        if (next() < 0.85) spans.select(window)
        for (const log of [spans.changes.since(changes), spans.swaps.since(swaps)]) {
          if (log === null) mirror.set(spans.packed)
          else
            for (const index of log)
              mirror.set(spans.packed.subarray(index * 4, index * 4 + 4), index * 4)
        }
        changes = spans.changes.cursor()
        swaps = spans.swaps.cursor()
        expect(mirror).toEqual(spans.packed)
        if (!window) continue
        const placed = spans.placedFor === window
        for (let index = 0; index < size; index++) {
          const bounds = periods(values[index])
          const naive = window.fade > 0 ? naiveOpacity(bounds, window) : naiveShown(bounds, window)
          const read = window.fade > 0 ? spans.opacity(index, window) : spans.shown(index, window)
          expect(read, `seed ${seed} step ${step} index ${index}`).toBe(naive)
          if (placed && bounds) {
            const gpu = window.covers(spans.packed, index * 4)
            expect(gpu).toBe(naiveShown(bounds, window))
          }
        }
      }
    }
  })

  it('keeps the placed period right while a window slides over many elements', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const next = random(seed)
      const size = 2000
      const spans = new TimeSpans()
      spans.reserve(size)
      const values: (number[] | null)[] = []
      for (let index = 0; index < size; index++) {
        const list: TimeValue[] = []
        let at = Math.floor(next() * 50)
        for (let period = 0; period < 3; period++) {
          const length = 1 + Math.floor(next() * 30)
          list.push({ start: at, end: at + length })
          at += length + 1 + Math.floor(next() * 40)
        }
        values[index] = periods(list)
        spans.read(index, list)
      }
      for (let start = -5; start < 400; start += 1 + Math.floor(next() * 3)) {
        if (next() < 0.1) {
          const index = Math.floor(next() * size)
          const at = Math.floor(next() * 300)
          const list = [at, { start: at + 5, end: at + 9 }, at + 30]
          values[index] = periods(list)
          spans.read(index, list)
        }
        const window = filter(start, start + 4)
        spans.select(window)
        for (let index = 0; index < size; index++) {
          const shown = window.covers(spans.packed, index * 4)
          if (shown !== naiveShown(values[index] ?? null, window)) {
            expect.fail(`seed ${seed}, window at ${start}, index ${index}`)
          }
        }
      }
    }
  })
})
