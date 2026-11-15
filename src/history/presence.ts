import { intersectPeriods } from '../core/periods'
import { noPeriods, readBounds, readPeriods } from '../core/time-range'

const presence = new WeakMap<object, Float64Array>()

export function markPresence(datum: unknown, periods: Float64Array | null): void {
  if (typeof datum !== 'object' || datum === null) return
  if (periods) presence.set(datum, periods)
  else presence.delete(datum)
}

function spansOf(bounds: Float64Array): { start: number | null; end: number | null }[] {
  const spans: { start: number | null; end: number | null }[] = []
  for (let at = 0; at + 1 < bounds.length; at += 2) {
    const start = bounds[at] ?? 0
    const end = bounds[at + 1] ?? 0
    spans.push({
      start: start === Number.NEGATIVE_INFINITY ? null : start,
      end: end === Number.POSITIVE_INFINITY ? null : end,
    })
  }
  return spans
}

export function presentTime(
  read: ((datum: unknown) => unknown) | null,
): (datum: unknown) => unknown {
  return (datum) => {
    const value = read ? read(datum) : undefined
    const periods = typeof datum === 'object' && datum !== null ? presence.get(datum) : undefined
    if (!periods) return value
    const count = readPeriods(value)
    if (count === noPeriods) return spansOf(periods)
    return spansOf(intersectPeriods(periods, readBounds(count), true))
  }
}
