export const openTime = 1e38
export const leastFade: number = 1 / 255
const exactBoundaries = 1024

export interface WindowBounds {
  readonly start: number | null
  readonly end: number | null
}

export interface WindowInput {
  readonly start?: unknown
  readonly end?: unknown
}

function windowEdge(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const time = toTime(value)
  if (Number.isNaN(time)) throw new RangeError('graph: a time window end must be a finite time')
  return time
}

export function readWindow(input: WindowInput | null): WindowBounds | null {
  if (input === null) return null
  const start = windowEdge(input.start)
  const end = windowEdge(input.end)
  if (start !== null && end !== null && start > end) {
    throw new RangeError('graph: the time window starts after its end')
  }
  return Object.freeze({ start, end })
}

export function sameWindow(a: WindowBounds | null, b: WindowBounds | null): boolean {
  return a === b || (a !== null && b !== null && a.start === b.start && a.end === b.end)
}

export function toTime(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN
  if (value instanceof Date) return value.getTime()
  return Number.NaN
}

function edge(value: unknown, open: number): number {
  if (value === null || value === undefined) return open
  const time = toTime(value)
  return Number.isNaN(time) ? Number.NaN : time
}

export function readSpan(value: unknown): readonly [number, number] | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || value instanceof Date) {
    const time = toTime(value)
    return Number.isNaN(time) ? null : [time, time]
  }
  if (typeof value !== 'object') return null
  const { start: from, end: to } = value as { start?: unknown; end?: unknown }
  const start = edge(from, Number.NEGATIVE_INFINITY)
  const end = edge(to, Number.POSITIVE_INFINITY)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  if (start === Number.NEGATIVE_INFINITY && end === Number.POSITIVE_INFINITY) return null
  return [start, Math.max(start, end)]
}

export function packTime(value: number, out: Float32Array, at: number): void {
  if (value <= -openTime) {
    out[at] = -openTime
    out[at + 1] = 0
  } else if (value >= openTime) {
    out[at] = openTime
    out[at + 1] = 0
  } else {
    const high = Math.fround(value)
    out[at] = high
    out[at + 1] = value - high
  }
}

function before(aHigh: number, aLow: number, bHigh: number, bLow: number): boolean {
  return aHigh < bHigh || (aHigh === bHigh && aLow < bLow)
}

function same(aHigh: number, aLow: number, bHigh: number, bLow: number): boolean {
  return aHigh === bHigh && aLow === bLow
}

let serials = 0

export class TimeFilter {
  readonly start: number
  readonly end: number
  readonly fade: number
  readonly point: boolean
  readonly packed: Float32Array = new Float32Array(4)
  readonly serial: number = ++serials

  constructor(start: number, end: number, fade: number) {
    this.start = start
    this.end = end
    this.fade = fade > 0 && Number.isFinite(fade) ? fade : 0
    packTime(start, this.packed, 0)
    packTime(end, this.packed, 2)
    const p = this.packed
    this.point = same(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0)
  }

  covers(packed: Float32Array, at: number): boolean {
    const sHigh = packed[at] ?? 0
    const sLow = packed[at + 1] ?? 0
    const eHigh = packed[at + 2] ?? 0
    const eLow = packed[at + 3] ?? 0
    const w = this.packed
    const wsHigh = w[0] ?? 0
    const wsLow = w[1] ?? 0
    const weHigh = w[2] ?? 0
    const weLow = w[3] ?? 0
    if (this.fade > 0) {
      return before(sHigh, sLow, weHigh, weLow) && before(wsHigh, wsLow, eHigh, eLow)
    }
    const started =
      before(sHigh, sLow, weHigh, weLow) || (this.point && same(sHigh, sLow, weHigh, weLow))
    if (!started) return false
    return (
      before(wsHigh, wsLow, eHigh, eLow) ||
      (same(sHigh, sLow, eHigh, eLow) && same(eHigh, eLow, wsHigh, wsLow))
    )
  }

  depth(start: number, end: number): number {
    if (this.fade <= 0) return 1
    const inside = Math.min(this.end - start, end - this.start)
    return Math.min(1, Math.max(leastFade, inside / this.fade))
  }
}

export function timeFilter(bounds: WindowBounds | null, fade: number): TimeFilter | null {
  if (!bounds) return null
  return new TimeFilter(
    bounds.start ?? Number.NEGATIVE_INFINITY,
    bounds.end ?? Number.POSITIVE_INFINITY,
    fade,
  )
}

function lowerBound(values: Float64Array, value: number): number {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((values[middle] ?? 0) < value) low = middle + 1
    else high = middle
  }
  return low
}

function upperBound(values: Float64Array, value: number): number {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((values[middle] ?? 0) <= value) low = middle + 1
    else high = middle
  }
  return low
}

export class TimeSpans {
  start: Float64Array = new Float64Array(0)
  end: Float64Array = new Float64Array(0)
  packed: Float32Array = new Float32Array(0)
  count = 0
  readonly #boundaries = new Set<number>()
  #sorted: Float64Array | null = null

  #capacity = 0

  reserve(capacity: number): void {
    if (capacity <= this.#capacity) return
    this.#capacity = capacity
    if (this.start.length > 0) this.#grow(capacity)
  }

  #grow(capacity: number): void {
    const start = new Float64Array(capacity).fill(Number.NEGATIVE_INFINITY)
    start.set(this.start)
    const end = new Float64Array(capacity).fill(Number.POSITIVE_INFINITY)
    end.set(this.end)
    const packed = new Float32Array(capacity * 4)
    packed.set(this.packed)
    for (let index = this.start.length; index < capacity; index++) {
      packed[index * 4] = -openTime
      packed[index * 4 + 2] = openTime
    }
    this.start = start
    this.end = end
    this.packed = packed
  }

  timed(index: number): boolean {
    return (
      (this.start[index] ?? Number.NEGATIVE_INFINITY) > Number.NEGATIVE_INFINITY ||
      (this.end[index] ?? Number.POSITIVE_INFINITY) < Number.POSITIVE_INFINITY
    )
  }

  set(index: number, start: number, end: number): void {
    const timed = start > Number.NEGATIVE_INFINITY || end < Number.POSITIVE_INFINITY
    if (index >= this.start.length) {
      if (!timed) return
      this.reserve(index + 1)
      this.#grow(this.#capacity)
    }
    const before = this.timed(index)
    this.start[index] = start
    this.end[index] = end
    if (before !== timed) this.count += timed ? 1 : -1
    packTime(start, this.packed, index * 4)
    packTime(end, this.packed, index * 4 + 2)
    if (!timed) return
    this.#boundary(start)
    this.#boundary(end)
  }

  write(index: number, span: readonly [number, number] | null): void {
    if (span) this.set(index, span[0], span[1])
    else this.clear(index)
  }

  clear(index: number): void {
    if (index < this.start.length && this.timed(index)) {
      this.set(index, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)
    }
  }

  shown(index: number, filter: TimeFilter | null): boolean {
    if (this.count === 0 || !filter) return true
    return filter.covers(this.packed, index * 4)
  }

  opacity(index: number, filter: TimeFilter | null): number {
    if (this.count === 0 || !filter) return 1
    if (!filter.covers(this.packed, index * 4)) return 0
    return filter.depth(
      this.start[index] ?? Number.NEGATIVE_INFINITY,
      this.end[index] ?? Number.POSITIVE_INFINITY,
    )
  }

  step(filter: TimeFilter | null): number {
    if (this.count === 0 || !filter) return 0
    const sorted = this.#sortedBoundaries()
    if (!sorted) return filter.serial
    const n = sorted.length * 2 + 1
    const from = lowerBound(sorted, filter.start) + upperBound(sorted, filter.start)
    const to = lowerBound(sorted, filter.end) + upperBound(sorted, filter.end)
    return ((from * n + to) * 2 + (filter.point ? 1 : 0)) * 2 + (filter.fade > 0 ? 1 : 0)
  }

  #boundary(value: number): void {
    if (!Number.isFinite(value) || this.#boundaries.has(value)) return
    if (this.#boundaries.size > exactBoundaries) return
    this.#boundaries.add(value)
    this.#sorted = null
  }

  #sortedBoundaries(): Float64Array | null {
    if (this.#boundaries.size > exactBoundaries) return null
    if (!this.#sorted) this.#sorted = Float64Array.from(this.#boundaries).sort()
    return this.#sorted
  }
}
