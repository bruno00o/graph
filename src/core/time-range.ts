import { Boundaries } from './boundaries'
import { ChangeLog } from './change-log'

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

let spanStart = 0
let spanEnd = 0
const invalidSpan = 0
const validSpan = 1
const openSpan = 2

function spanOf(value: unknown): number {
  if (value === null || value === undefined) return invalidSpan
  if (typeof value === 'number' || value instanceof Date) {
    const time = toTime(value)
    spanStart = spanEnd = time
    return Number.isNaN(time) ? invalidSpan : validSpan
  }
  if (typeof value !== 'object') return invalidSpan
  const { start: from, end: to } = value as { start?: unknown; end?: unknown }
  const start = edge(from, Number.NEGATIVE_INFINITY)
  const end = edge(to, Number.POSITIVE_INFINITY)
  if (Number.isNaN(start) || Number.isNaN(end)) return invalidSpan
  if (start === Number.NEGATIVE_INFINITY && end === Number.POSITIVE_INFINITY) return openSpan
  spanStart = start
  spanEnd = Math.max(start, end)
  return validSpan
}

function parseSpan(value: unknown): boolean {
  return spanOf(value) === validSpan
}

export function readSpan(value: unknown): readonly [number, number] | null {
  return parseSpan(value) ? [spanStart, spanEnd] : null
}

export class Periods {
  readonly bounds: Float64Array

  constructor(bounds: Float64Array) {
    this.bounds = bounds
  }
}

function listed(value: unknown): value is Iterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Date) &&
    typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function'
  )
}

const farKey = Math.fround(openTime)

export function timeKey(value: number): number {
  if (value <= -openTime) return -farKey
  if (value >= openTime) return farKey
  const high = Math.fround(value)
  return high + Math.fround(value - high)
}

let gathered = new Float64Array(16)
let gatheredKeys = new Float64Array(16)
let order = new Int32Array(8)
let gatheredCount = 0

function gather(start: number, end: number): void {
  const at = gatheredCount * 2
  if (at + 2 > gathered.length) {
    const grown = new Float64Array(gathered.length * 2)
    grown.set(gathered)
    gathered = grown
  }
  gathered[at] = start
  gathered[at + 1] = end
  gatheredCount++
}

function sortGathered(count: number): void {
  if (gatheredKeys.length < count * 2) gatheredKeys = new Float64Array(gathered.length)
  if (order.length < count) order = new Int32Array(gathered.length / 2)
  const keys = gatheredKeys
  for (let at = 0; at < count * 2; at++) keys[at] = timeKey(gathered[at] ?? 0)
  const ranks = order
  for (let at = 0; at < count; at++) ranks[at] = at
  const earlier = (a: number, b: number): number =>
    (keys[a * 2] ?? 0) - (keys[b * 2] ?? 0) || (keys[b * 2 + 1] ?? 0) - (keys[a * 2 + 1] ?? 0)
  if (count <= 16) {
    for (let at = 1; at < count; at++) {
      const rank = ranks[at] ?? 0
      let to = at
      while (to > 0 && earlier(ranks[to - 1] ?? 0, rank) > 0) {
        ranks[to] = ranks[to - 1] ?? 0
        to--
      }
      ranks[to] = rank
    }
  } else ranks.subarray(0, count).sort(earlier)
}

let merged = new Float64Array(16)

function mergeGathered(): number {
  const count = gatheredCount
  if (count === 0) return 0
  sortGathered(count)
  if (merged.length < count * 2) merged = new Float64Array(gathered.length)
  const keys = gatheredKeys
  let length = 0
  let start = 0
  let end = 0
  let startKey = 0
  let endKey = 0
  for (let at = 0; at < count; at++) {
    const rank = order[at] ?? 0
    const nextStart = gathered[rank * 2] ?? 0
    const nextEnd = gathered[rank * 2 + 1] ?? 0
    const nextStartKey = keys[rank * 2] ?? 0
    const nextEndKey = keys[rank * 2 + 1] ?? 0
    const joins =
      at > 0 &&
      (nextStartKey < endKey ||
        (nextStartKey === endKey && !(startKey < endKey && nextStartKey === nextEndKey)))
    if (joins) {
      if (nextStartKey === startKey && nextStart < start) start = nextStart
      if (nextEndKey > endKey || (nextEndKey === endKey && nextEnd > end)) {
        end = nextEnd
        endKey = nextEndKey
      }
      continue
    }
    if (at > 0) {
      merged[length * 2] = start
      merged[length * 2 + 1] = end
      length++
    }
    start = nextStart
    end = nextEnd
    startKey = nextStartKey
    endKey = nextEndKey
  }
  merged[length * 2] = start
  merged[length * 2 + 1] = end
  return length + 1
}

export const noPeriods = -1

export function readPeriods(value: unknown): number {
  gatheredCount = 0
  if (value instanceof Periods) {
    const bounds = value.bounds
    for (let at = 0; at + 1 < bounds.length; at += 2) gather(bounds[at] ?? 0, bounds[at + 1] ?? 0)
  } else if (listed(value)) {
    for (const item of value) {
      const kind = spanOf(item)
      if (kind === openSpan) return noPeriods
      if (kind === validSpan) gather(spanStart, spanEnd)
    }
  } else if (spanOf(value) === validSpan) gather(spanStart, spanEnd)
  else return noPeriods
  const count = mergeGathered()
  if (
    count === 1 &&
    merged[0] === Number.NEGATIVE_INFINITY &&
    merged[1] === Number.POSITIVE_INFINITY
  ) {
    return noPeriods
  }
  return count
}

export function readBounds(count: number): Float64Array {
  return merged.slice(0, count * 2)
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
  readonly endKey: number

  constructor(start: number, end: number, fade: number) {
    this.start = start
    this.end = end
    this.fade = fade > 0 && Number.isFinite(fade) ? fade : 0
    packTime(start, this.packed, 0)
    packTime(end, this.packed, 2)
    const p = this.packed
    this.point = same(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0)
    this.endKey = (p[2] ?? 0) + (p[3] ?? 0)
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

const scratchSpan = new Float32Array(4)

function packPeriod(list: Float64Array, period: number, out: Float32Array, at: number): void {
  packTime(list[period * 2] ?? 0, out, at)
  packTime(list[period * 2 + 1] ?? 0, out, at + 2)
}

function started(list: Float64Array, period: number, filter: TimeFilter): boolean {
  const key = timeKey(list[period * 2] ?? 0)
  return key < filter.endKey || (filter.point && key === filter.endKey)
}

function choose(list: Float64Array, filter: TimeFilter | null): number {
  const count = list.length / 2
  if (!filter) return count - 1
  if (filter.fade > 0) {
    let best = -1
    let deepest = -1
    for (let period = 0; period < count; period++) {
      packPeriod(list, period, scratchSpan, 0)
      if (!filter.covers(scratchSpan, 0)) continue
      const depth = filter.depth(list[period * 2] ?? 0, list[period * 2 + 1] ?? 0)
      if (depth >= deepest) {
        best = period
        deepest = depth
      }
    }
    if (best >= 0) return best
  }
  for (let period = count - 1; period > 0; period--) {
    if (started(list, period, filter)) return period
  }
  return 0
}

function sameBounds(list: Float64Array, bounds: Float64Array, length: number): boolean {
  if (list.length !== length) return false
  for (let at = 0; at < length; at++) if (!Object.is(list[at], bounds[at])) return false
  return true
}

const rebuildFloor = 1024

export class TimeSpans {
  start: Float64Array = new Float64Array(0)
  end: Float64Array = new Float64Array(0)
  packed: Float32Array = new Float32Array(0)
  count = 0
  readonly changes: ChangeLog = new ChangeLog()
  readonly swaps: ChangeLog = new ChangeLog()
  readonly #lists: (Float64Array | undefined)[] = []
  readonly #listed: Set<number> = new Set()
  #placing: TimeFilter | null = null
  #keys: Float64Array = new Float64Array(0)
  #owners: Int32Array = new Int32Array(0)
  #extraKeys: number[] = []
  #extraOwners: number[] = []
  #stale = 0
  readonly #boundaries: Boundaries = new Boundaries(exactBoundaries, (visit) => {
    for (let index = 0; index < this.start.length; index++) {
      const list = this.#lists[index]
      if (list) for (const bound of list) visit(bound)
      else {
        visit(this.start[index] ?? Number.NaN)
        visit(this.end[index] ?? Number.NaN)
      }
    }
  })

  #capacity = 0

  get several(): number {
    return this.#listed.size
  }

  get placedFor(): TimeFilter | null {
    return this.#placing
  }

  list(index: number): Float64Array | undefined {
    return this.#lists[index]
  }

  forEachList(visit: (index: number, list: Float64Array) => void): void {
    for (const index of this.#listed) visit(index, this.#lists[index] as Float64Array)
  }

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
    const startBefore = this.start[index] ?? Number.NEGATIVE_INFINITY
    const endBefore = this.end[index] ?? Number.POSITIVE_INFINITY
    const list = this.#lists[index]
    if (list) this.#unlist(index, list)
    else {
      if (startBefore === start && endBefore === end) return
      this.#boundaries.remove(startBefore)
      this.#boundaries.remove(endBefore)
    }
    this.touch(index)
    if (before !== timed) this.count += timed ? 1 : -1
    this.#place(index, start, end)
    this.#boundaries.add(start)
    this.#boundaries.add(end)
  }

  #place(index: number, start: number, end: number): void {
    this.start[index] = start
    this.end[index] = end
    packTime(start, this.packed, index * 4)
    packTime(end, this.packed, index * 4 + 2)
  }

  #unlist(index: number, list: Float64Array): void {
    for (const bound of list) this.#boundaries.remove(bound)
    this.#lists[index] = undefined
    this.#listed.delete(index)
    this.#stale += list.length / 2 - 1
  }

  #setList(index: number, bounds: Float64Array, length: number): void {
    if (index >= this.start.length) {
      this.reserve(index + 1)
      this.#grow(this.#capacity)
    }
    const old = this.#lists[index]
    if (old && sameBounds(old, bounds, length)) return
    const before = this.timed(index)
    if (old) {
      for (const bound of old) this.#boundaries.remove(bound)
      this.#stale += old.length / 2 - 1
    } else {
      this.#boundaries.remove(this.start[index] ?? Number.NEGATIVE_INFINITY)
      this.#boundaries.remove(this.end[index] ?? Number.POSITIVE_INFINITY)
      this.#listed.add(index)
    }
    const list = bounds.slice(0, length)
    this.#lists[index] = list
    for (let at = 0; at < length; at++) {
      this.#boundaries.add(list[at] ?? 0)
      if (at > 1 && at % 2 === 0) {
        this.#extraKeys.push(timeKey(list[at] ?? 0))
        this.#extraOwners.push(index)
      }
    }
    this.touch(index)
    if (!before) this.count++
    const period = choose(list, this.#placing)
    this.#place(index, list[period * 2] ?? 0, list[period * 2 + 1] ?? 0)
  }

  touch(index: number): void {
    this.changes.add(index, this.#capacity)
  }

  write(index: number, span: readonly [number, number] | null): void {
    if (span) this.set(index, span[0], span[1])
    else this.clear(index)
  }

  read(index: number, value: unknown): void {
    if (!listed(value) && !(value instanceof Periods)) {
      if (parseSpan(value)) this.set(index, spanStart, spanEnd)
      else this.clear(index)
      return
    }
    const count = readPeriods(value)
    if (count === noPeriods) this.clear(index)
    else if (count === 0) this.set(index, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
    else if (count === 1) this.set(index, merged[0] ?? 0, merged[1] ?? 0)
    else this.#setList(index, merged, count * 2)
  }

  clear(index: number): void {
    if (index < this.start.length && this.timed(index)) {
      this.set(index, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)
    }
  }

  select(filter: TimeFilter | null): void {
    if (!filter || filter === this.#placing) return
    const old = this.#placing
    this.#placing = filter
    if (this.#listed.size === 0) return
    if (!old || filter.fade > 0 || old.fade > 0) {
      this.#replaceAll()
      return
    }
    if (old.endKey === filter.endKey && old.point === filter.point) return
    this.#cross(Math.min(old.endKey, filter.endKey), Math.max(old.endKey, filter.endKey))
  }

  #cross(low: number, high: number): void {
    const extras = this.#extraKeys.length
    if (
      (extras > rebuildFloor && extras * 8 > this.#keys.length) ||
      this.#stale > Math.max(rebuildFloor, this.#keys.length / 2)
    ) {
      this.#rebuild()
    }
    const keys = this.#keys
    const from = lowerBound(keys, low)
    const to = upperBound(keys, high)
    if ((to - from) * 2 > this.#listed.size) {
      this.#replaceAll()
      return
    }
    for (let at = from; at < to; at++) this.#replace(this.#owners[at] ?? 0)
    const extraKeys = this.#extraKeys
    for (let at = 0; at < extraKeys.length; at++) {
      const key = extraKeys[at] ?? 0
      if (key >= low && key <= high) this.#replace(this.#extraOwners[at] ?? 0)
    }
  }

  #rebuild(): void {
    let size = 0
    for (const index of this.#listed) size += (this.#lists[index]?.length ?? 2) / 2 - 1
    const keys = new Float64Array(size)
    let at = 0
    for (const index of this.#listed) {
      const list = this.#lists[index] as Float64Array
      for (let bound = 2; bound < list.length; bound += 2) keys[at++] = timeKey(list[bound] ?? 0)
    }
    const sorted = keys.slice().sort()
    const owners = new Int32Array(size)
    const filled = new Int32Array(size)
    at = 0
    for (const index of this.#listed) {
      const list = this.#lists[index] as Float64Array
      for (let bound = 2; bound < list.length; bound += 2) {
        const first = lowerBound(sorted, keys[at++] ?? 0)
        owners[first + (filled[first] ?? 0)] = index
        filled[first] = (filled[first] ?? 0) + 1
      }
    }
    this.#keys = sorted
    this.#owners = owners
    this.#extraKeys = []
    this.#extraOwners = []
    this.#stale = 0
  }

  #replaceAll(): void {
    for (const index of this.#listed) this.#replace(index)
  }

  #replace(index: number): void {
    const list = this.#lists[index]
    if (!list) return
    const period = choose(list, this.#placing)
    const start = list[period * 2] ?? 0
    const end = list[period * 2 + 1] ?? 0
    if (Object.is(this.start[index], start) && Object.is(this.end[index], end)) return
    this.#place(index, start, end)
    this.swaps.add(index, this.#capacity)
  }

  pack(index: number, filter: TimeFilter | null, out: Float32Array, at: number): void {
    const list = this.#lists[index]
    if (list) packPeriod(list, choose(list, filter), out, at)
  }

  shown(index: number, filter: TimeFilter | null): boolean {
    if (this.count === 0 || !filter) return true
    if (filter !== this.#placing && this.#listed.size > 0) {
      const list = this.#lists[index]
      if (list) {
        packPeriod(list, choose(list, filter), scratchSpan, 0)
        return filter.covers(scratchSpan, 0)
      }
    }
    return filter.covers(this.packed, index * 4)
  }

  opacity(index: number, filter: TimeFilter | null): number {
    if (this.count === 0 || !filter) return 1
    if (filter !== this.#placing && this.#listed.size > 0) {
      const list = this.#lists[index]
      if (list) {
        const period = choose(list, filter)
        packPeriod(list, period, scratchSpan, 0)
        if (!filter.covers(scratchSpan, 0)) return 0
        return filter.depth(list[period * 2] ?? 0, list[period * 2 + 1] ?? 0)
      }
    }
    if (!filter.covers(this.packed, index * 4)) return 0
    return filter.depth(
      this.start[index] ?? Number.NEGATIVE_INFINITY,
      this.end[index] ?? Number.POSITIVE_INFINITY,
    )
  }

  step(filter: TimeFilter | null): number {
    if (this.count === 0 || !filter) return 0
    const sorted = this.#boundaries.sorted(this.start.length)
    if (!sorted) return filter.serial
    const n = sorted.length * 2 + 1
    const from = lowerBound(sorted, filter.start) + upperBound(sorted, filter.start)
    const to = lowerBound(sorted, filter.end) + upperBound(sorted, filter.end)
    return ((from * n + to) * 2 + (filter.point ? 1 : 0)) * 2 + (filter.fade > 0 ? 1 : 0)
  }
}
