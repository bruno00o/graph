import { intersectPeriods } from '../core/periods'
import { noPeriods, Periods, readBounds, readPeriods } from '../core/time-range'

const presence = new WeakMap<object, Float64Array>()

export function markPresence(datum: unknown, periods: Float64Array | null): void {
  if (typeof datum !== 'object' || datum === null) return
  if (periods) presence.set(datum, periods)
  else presence.delete(datum)
}

export function presentTime(
  read: ((datum: unknown) => unknown) | null,
): (datum: unknown) => unknown {
  return (datum) => {
    const value = read ? read(datum) : undefined
    const periods = typeof datum === 'object' && datum !== null ? presence.get(datum) : undefined
    if (!periods) return value
    const count = readPeriods(value)
    if (count === noPeriods) return new Periods(periods)
    return new Periods(intersectPeriods(periods, readBounds(count), true))
  }
}
