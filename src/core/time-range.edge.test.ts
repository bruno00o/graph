import { describe, expect, it } from 'vitest'
import type { WindowBounds } from './time-range'
import { leastFade, readSpan, readWindow, TimeSpans, timeFilter } from './time-range'

function spans(...values: Array<readonly [number, number] | null>): TimeSpans {
  const result = new TimeSpans()
  result.reserve(values.length)
  values.forEach((value, index) => {
    result.write(index, value)
  })
  return result
}

function oracleShown(
  span: readonly [number, number] | null,
  window: WindowBounds | null,
  fade: number,
): boolean {
  if (!window) return true
  if (span === null) return true
  const wStart = window.start ?? Number.NEGATIVE_INFINITY
  const wEnd = window.end ?? Number.POSITIVE_INFINITY
  const [s, e] = span
  const point = window.start !== null && window.end !== null && window.start === window.end
  if (fade > 0) return s < wEnd && e > wStart
  if (!(s < wEnd || (point && s === wEnd))) return false
  return e > wStart || (s === e && e === wStart)
}

describe('time-range edges', () => {
  it('agrees with a written-down oracle across every window shape', () => {
    const shapes: Array<readonly [number, number] | null> = [
      [5, 5],
      [5, 8],
      [3, 5],
      [2, 4],
      [8, 8],
      [Number.NEGATIVE_INFINITY, 5],
      [5, Number.POSITIVE_INFINITY],
      [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
      null,
    ]
    const windows: Array<WindowBounds | null> = [
      null,
      { start: null, end: null },
      { start: 5, end: 5 },
      { start: 4, end: 5 },
      { start: 5, end: 8 },
      { start: 5, end: 6 },
      { start: 8, end: 8 },
      { start: 2, end: 3 },
      { start: 3, end: 9 },
      { start: null, end: 5 },
      { start: 5, end: null },
      { start: null, end: 4 },
      { start: 6, end: null },
      { start: 2, end: 2 },
    ]
    for (const fade of [0, 10]) {
      const columns = spans(...shapes)
      shapes.forEach((shape, index) => {
        for (const window of windows) {
          expect(columns.shown(index, timeFilter(window, fade))).toBe(
            oracleShown(shape, window, fade),
          )
        }
      })
    }
  })

  it('shows an instant on the start of a window and hides it on its end', () => {
    const columns = spans([4, 4], [5, 5])
    expect(columns.shown(0, timeFilter({ start: 4, end: 5 }, 0))).toBe(true)
    expect(columns.shown(1, timeFilter({ start: 4, end: 5 }, 0))).toBe(false)
    expect(columns.shown(1, timeFilter({ start: 4, end: 6 }, 0))).toBe(true)
    expect(columns.shown(0, timeFilter({ start: 5, end: 5 }, 0))).toBe(false)
    expect(columns.shown(1, timeFilter({ start: 5, end: 5 }, 0))).toBe(true)
  })

  it('keeps fade strict where the plain filter bends', () => {
    const columns = spans([5, 5], [5, 8])
    expect(columns.shown(0, timeFilter({ start: 5, end: 5 }, 0))).toBe(true)
    expect(columns.shown(0, timeFilter({ start: 5, end: 5 }, 10))).toBe(false)
    expect(columns.shown(1, timeFilter({ start: 5, end: 5 }, 10))).toBe(false)
    expect(columns.shown(1, timeFilter({ start: 5, end: 9 }, 10))).toBe(true)
  })

  it('fades by the part of the span inside the window', () => {
    const columns = spans([5, 8], [5, 5], [5, 8])
    expect(columns.opacity(0, timeFilter({ start: 5, end: 9 }, 10))).toBeCloseTo(0.3)
    expect(columns.opacity(1, timeFilter({ start: 4, end: 6 }, 10))).toBeCloseTo(0.1)
    expect(columns.opacity(2, timeFilter({ start: 5, end: 20 }, 2))).toBe(1)
    expect(columns.opacity(1, timeFilter({ start: 5, end: 6 }, 1))).toBeCloseTo(leastFade)
    expect(columns.opacity(0, null)).toBe(1)
  })

  it('reads windows from dates and numbers alike', () => {
    expect(readWindow({ start: new Date(5), end: 10 })).toEqual({ start: 5, end: 10 })
    expect(readWindow({ start: new Date(5), end: new Date(5) })).toEqual({ start: 5, end: 5 })
    expect(readWindow({ end: 3 })).toEqual({ start: null, end: 3 })
    expect(readWindow({ start: 3 })).toEqual({ start: 3, end: null })
    expect(() => readWindow({ start: new Date(Number.NaN) })).toThrow(RangeError)
    expect(() => readWindow({ end: 'x' })).toThrow(RangeError)
    expect(() => readWindow({ start: 4, end: 2 })).toThrow(RangeError)
  })

  it('reads spans with open ends, reversed ends and dates', () => {
    expect(readSpan(5)).toEqual([5, 5])
    expect(readSpan(new Date(7))).toEqual([7, 7])
    expect(readSpan({ start: new Date(6), end: 2 })).toEqual([6, 6])
    expect(readSpan({ start: 4, end: null })).toEqual([4, Number.POSITIVE_INFINITY])
    expect(readSpan({ start: null, end: new Date(3) })).toEqual([Number.NEGATIVE_INFINITY, 3])
    expect(readSpan({ start: Number.NEGATIVE_INFINITY, end: Number.POSITIVE_INFINITY })).toBeNull()
    expect(readSpan({ start: Number.POSITIVE_INFINITY })).toBeNull()
    expect(readSpan('2024')).toBeNull()
    expect(readSpan([1, 2])).toBeNull()
  })
})
