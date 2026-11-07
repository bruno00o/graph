export type TimeUnit =
  | 'millisecond'
  | 'second'
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'year'

export interface TimeStep {
  readonly unit: TimeUnit
  readonly count: number
}

const second = 1000
const minute = 60 * second
const hour = 60 * minute
const day = 24 * hour

const lengths: Readonly<Record<TimeUnit, number>> = {
  millisecond: 1,
  second,
  minute,
  hour,
  day,
  week: 7 * day,
  month: 30.436875 * day,
  year: 365.2425 * day,
}

const ladder: readonly TimeStep[] = [
  ...[1, 2, 5, 10, 20, 50, 100, 200, 500].map((count) => ({ unit: 'millisecond' as const, count })),
  ...[1, 2, 5, 10, 15, 30].map((count) => ({ unit: 'second' as const, count })),
  ...[1, 2, 5, 10, 15, 30].map((count) => ({ unit: 'minute' as const, count })),
  ...[1, 2, 3, 6, 12].map((count) => ({ unit: 'hour' as const, count })),
  ...[1, 2].map((count) => ({ unit: 'day' as const, count })),
  { unit: 'week', count: 1 },
  ...[1, 2, 3, 6].map((count) => ({ unit: 'month' as const, count })),
]

export function stepLength(step: TimeStep): number {
  return lengths[step.unit] * step.count
}

function niceYears(years: number): number {
  const power = 10 ** Math.floor(Math.log10(Math.max(years, 1)))
  for (const factor of [1, 2, 5, 10]) if (power * factor >= years) return power * factor
  return power * 10
}

export function chooseStep(span: number, target: number): TimeStep {
  const wanted = span / Math.max(1, target)
  for (const step of ladder) if (stepLength(step) >= wanted) return step
  return { unit: 'year', count: niceYears(wanted / lengths.year) }
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

export function floorTime(time: number, step: TimeStep): number {
  const { unit, count } = step
  if (unit === 'millisecond' || unit === 'second' || unit === 'minute') {
    const size = lengths[unit] * count
    return Math.floor(time / size) * size
  }
  const date = new Date(time)
  if (unit === 'hour') {
    date.setMinutes(0, 0, 0)
    date.setHours(date.getHours() - modulo(date.getHours(), count))
    return date.getTime()
  }
  date.setHours(0, 0, 0, 0)
  if (unit === 'day') {
    date.setDate(date.getDate() - modulo(date.getDate() - 1, count))
  } else if (unit === 'week') {
    date.setDate(date.getDate() - modulo(date.getDay() - 1, 7))
  } else if (unit === 'month') {
    date.setDate(1)
    date.setMonth(date.getMonth() - modulo(date.getMonth(), count))
  } else {
    date.setMonth(0, 1)
    date.setFullYear(date.getFullYear() - modulo(date.getFullYear(), count))
  }
  return date.getTime()
}

function daysIn(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

export function addTime(time: number, unit: TimeUnit, count: number): number {
  if (count === 0 || !Number.isFinite(time)) return time
  if (unit === 'millisecond' || unit === 'second' || unit === 'minute') {
    return time + lengths[unit] * count
  }
  const date = new Date(time)
  if (unit === 'hour') {
    date.setHours(date.getHours() + count)
  } else if (unit === 'day' || unit === 'week') {
    date.setDate(date.getDate() + (unit === 'week' ? 7 * count : count))
  } else {
    const dayOfMonth = date.getDate()
    date.setDate(1)
    if (unit === 'month') date.setMonth(date.getMonth() + count)
    else date.setFullYear(date.getFullYear() + count)
    date.setDate(Math.min(dayOfMonth, daysIn(date.getFullYear(), date.getMonth())))
  }
  return date.getTime()
}

export function boundaries(start: number, end: number, step: TimeStep, limit: number): number[] {
  const times: number[] = []
  let time = floorTime(start, step)
  while (times.length < limit) {
    times.push(time)
    if (time >= end) break
    const next = addTime(time, step.unit, step.count)
    if (!(next > time)) break
    time = next
  }
  return times
}
