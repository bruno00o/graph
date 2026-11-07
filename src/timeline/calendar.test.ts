import { describe, expect, it } from 'vitest'
import { addTime, boundaries, chooseStep, floorTime } from './calendar'

describe('calendar', () => {
  it('chooses a calendar step near the wanted number of bins', () => {
    const day = 86_400_000
    expect(chooseStep(80 * day, 80)).toEqual({ unit: 'day', count: 1 })
    expect(chooseStep(4 * 365 * day, 80)).toEqual({ unit: 'month', count: 1 })
    expect(chooseStep(4 * 365 * day, 6)).toEqual({ unit: 'year', count: 1 })
    expect(chooseStep(60_000, 60)).toEqual({ unit: 'second', count: 1 })
    expect(chooseStep(300 * 365 * day, 10)).toEqual({ unit: 'year', count: 50 })
    expect(chooseStep(50, 80)).toEqual({ unit: 'millisecond', count: 1 })
  })

  it('floors to the start of local calendar units', () => {
    const time = new Date(2023, 6, 19, 15, 42, 7, 300).getTime()
    expect(floorTime(time, { unit: 'year', count: 1 })).toBe(new Date(2023, 0, 1).getTime())
    expect(floorTime(time, { unit: 'year', count: 10 })).toBe(new Date(2020, 0, 1).getTime())
    expect(floorTime(time, { unit: 'month', count: 3 })).toBe(new Date(2023, 6, 1).getTime())
    expect(floorTime(time, { unit: 'month', count: 6 })).toBe(new Date(2023, 6, 1).getTime())
    expect(floorTime(time, { unit: 'month', count: 2 })).toBe(new Date(2023, 6, 1).getTime())
    expect(floorTime(time, { unit: 'week', count: 1 })).toBe(new Date(2023, 6, 17).getTime())
    expect(floorTime(time, { unit: 'day', count: 1 })).toBe(new Date(2023, 6, 19).getTime())
    expect(floorTime(time, { unit: 'hour', count: 6 })).toBe(new Date(2023, 6, 19, 12).getTime())
    expect(floorTime(1234, { unit: 'millisecond', count: 100 })).toBe(1200)
  })

  it('adds calendar units, keeping the day within shorter months', () => {
    const end = new Date(2024, 0, 31).getTime()
    expect(addTime(end, 'month', 1)).toBe(new Date(2024, 1, 29).getTime())
    expect(addTime(new Date(2024, 1, 29).getTime(), 'year', 1)).toBe(
      new Date(2025, 1, 28).getTime(),
    )
    expect(addTime(end, 'week', -1)).toBe(new Date(2024, 0, 24).getTime())
    expect(addTime(end, 'day', 2)).toBe(new Date(2024, 1, 2).getTime())
    expect(addTime(1000, 'second', 2)).toBe(3000)
  })

  it('lists boundaries that cover a range', () => {
    const start = new Date(2023, 2, 15).getTime()
    const end = new Date(2023, 5, 2).getTime()
    const times = boundaries(start, end, { unit: 'month', count: 1 }, 100)
    expect(times).toEqual([2, 3, 4, 5, 6].map((month) => new Date(2023, month, 1).getTime()))
    expect(boundaries(0, 1e12, { unit: 'millisecond', count: 1 }, 5)).toHaveLength(5)
  })
})
