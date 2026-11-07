import { describe, expect, it } from 'vitest'
import {
  leastFade,
  openTime,
  packTime,
  readSpan,
  readWindow,
  sameWindow,
  TimeSpans,
  timeFilter,
} from './time-range'

function spans(...values: Array<readonly [number, number] | null>): TimeSpans {
  const result = new TimeSpans()
  result.reserve(values.length)
  values.forEach((value, index) => {
    result.write(index, value)
  })
  return result
}

describe('readSpan', () => {
  it('reads instants, intervals, dates and open ends', () => {
    expect(readSpan(5)).toEqual([5, 5])
    expect(readSpan(new Date(10))).toEqual([10, 10])
    expect(readSpan({ start: 1, end: 4 })).toEqual([1, 4])
    expect(readSpan({ start: new Date(2) })).toEqual([2, Number.POSITIVE_INFINITY])
    expect(readSpan({ end: 3 })).toEqual([Number.NEGATIVE_INFINITY, 3])
    expect(readSpan({ start: 6, end: 2 })).toEqual([6, 6])
  })

  it('leaves invalid and fully open values timeless', () => {
    expect(readSpan(null)).toBeNull()
    expect(readSpan(undefined)).toBeNull()
    expect(readSpan(Number.NaN)).toBeNull()
    expect(readSpan('2024')).toBeNull()
    expect(readSpan({})).toBeNull()
    expect(readSpan({ start: null, end: null })).toBeNull()
    expect(readSpan({ start: 'x' })).toBeNull()
    expect(readSpan(new Date(Number.NaN))).toBeNull()
  })
})

describe('readWindow', () => {
  it('reads ends and rejects reversed or invalid windows', () => {
    expect(readWindow({ start: new Date(1), end: 3 })).toEqual({ start: 1, end: 3 })
    expect(readWindow({})).toEqual({ start: null, end: null })
    expect(readWindow(null)).toBeNull()
    expect(() => readWindow({ start: 4, end: 2 })).toThrow(RangeError)
    expect(() => readWindow({ start: Number.NaN })).toThrow(RangeError)
    expect(sameWindow({ start: 1, end: 2 }, { start: 1, end: 2 })).toBe(true)
    expect(sameWindow({ start: 1, end: 2 }, null)).toBe(false)
  })
})

describe('packTime', () => {
  it('keeps millisecond timestamps exact in two floats', () => {
    const out = new Float32Array(2)
    const time = Date.UTC(2024, 5, 30, 13, 45, 12, 345)
    packTime(time, out, 0)
    expect((out[0] ?? 0) + (out[1] ?? 0)).toBe(time)
    packTime(Number.NEGATIVE_INFINITY, out, 0)
    expect(out[0]).toBe(Math.fround(-openTime))
  })
})

describe('time filter', () => {
  const day = 86_400_000
  const base = Date.UTC(2023, 0, 1)

  it('shows intervals that overlap a half-open window', () => {
    const columns = spans(
      [base, base + 10 * day],
      [base + 10 * day, base + 20 * day],
      [base - 5 * day, base],
      null,
    )
    const filter = timeFilter({ start: base + 5 * day, end: base + 10 * day }, 0)
    expect(columns.shown(0, filter)).toBe(true)
    expect(columns.shown(1, filter)).toBe(false)
    expect(columns.shown(2, filter)).toBe(false)
    expect(columns.shown(3, filter)).toBe(true)
    expect(columns.shown(0, null)).toBe(true)
  })

  it('shows instants from the start of the window up to, not including, its end', () => {
    const columns = spans([base, base], [base + day, base + day])
    const filter = timeFilter({ start: base, end: base + day }, 0)
    expect(columns.shown(0, filter)).toBe(true)
    expect(columns.shown(1, filter)).toBe(false)
  })

  it('reads a point window as the moment it names', () => {
    const columns = spans(
      [base, base + day],
      [base, base],
      [base - day, base],
      [base + 1, base + 2],
    )
    const filter = timeFilter({ start: base, end: base }, 0)
    expect(filter?.point).toBe(true)
    expect(columns.shown(0, filter)).toBe(true)
    expect(columns.shown(1, filter)).toBe(true)
    expect(columns.shown(2, filter)).toBe(false)
    expect(columns.shown(3, filter)).toBe(false)
  })

  it('treats open ends as reaching forever', () => {
    const columns = spans([Number.NEGATIVE_INFINITY, base], [base, Number.POSITIVE_INFINITY])
    expect(columns.shown(0, timeFilter({ start: null, end: base - day }, 0))).toBe(true)
    expect(columns.shown(1, timeFilter({ start: base + 1000 * day, end: null }, 0))).toBe(true)
    expect(columns.shown(1, timeFilter({ start: null, end: base }, 0))).toBe(false)
  })

  it('fades elements near the edges of the window', () => {
    const columns = spans([base, base + 100 * day], [base + 9 * day, base + 9 * day])
    const filter = timeFilter({ start: base + 50 * day, end: base + 60 * day }, 20 * day)
    expect(columns.opacity(0, filter)).toBe(1)
    expect(columns.opacity(1, filter)).toBe(0)
    const late = timeFilter({ start: base + 90 * day, end: base + 120 * day }, 20 * day)
    expect(columns.opacity(0, late)).toBeCloseTo(0.5)
    const edge = timeFilter({ start: base + 9 * day, end: base + 10 * day }, day)
    expect(columns.shown(1, edge)).toBe(false)
    const inside = timeFilter({ start: base + 8 * day, end: base + 9 * day + 1 }, day)
    expect(columns.opacity(1, inside)).toBe(leastFade)
  })

  it('counts timed elements and allocates nothing for timeless ones', () => {
    const columns = new TimeSpans()
    columns.reserve(1000)
    columns.write(3, null)
    expect(columns.start.length).toBe(0)
    columns.write(3, [1, 2])
    expect(columns.count).toBe(1)
    expect(columns.start.length).toBe(1000)
    columns.clear(3)
    expect(columns.count).toBe(0)
    expect(columns.timed(3)).toBe(false)
  })

  it('changes its step only when the window crosses a time of the data', () => {
    const columns = spans([10, 20], [30, 40])
    const at = (start: number, end: number) => columns.step(timeFilter({ start, end }, 0))
    expect(at(11, 15)).toBe(at(12, 19))
    expect(at(11, 15)).not.toBe(at(11, 25))
    expect(at(11, 15)).not.toBe(at(10, 15))
    expect(columns.step(null)).toBe(0)
  })
})

describe('TimeSpans boundaries', () => {
  it('goes back to exact time boundaries once the many spans are gone', () => {
    const spans = new TimeSpans()
    spans.reserve(1200)
    for (let index = 0; index < 1100; index++) spans.set(index, index, index + 1)
    const window = { start: 5000, end: 6000 }
    expect(spans.step(timeFilter(window, 0))).not.toBe(spans.step(timeFilter(window, 0)))
    for (let index = 1; index < 1100; index++) spans.clear(index)
    expect(spans.count).toBe(1)
    expect(spans.step(timeFilter(window, 0))).toBe(spans.step(timeFilter(window, 0)))
  })
})
