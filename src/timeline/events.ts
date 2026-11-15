import { toTime } from '../core/time-range'
import type { Accessor } from '../types'
import { mergeSorted } from './histogram'

const empty = new Float64Array(0)

function lowerBound(values: Float64Array, value: number): number {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if ((values[middle] ?? 0) < value) low = middle + 1
    else high = middle
  }
  return low
}

function upperBound(values: Float64Array, value: number): number {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if ((values[middle] ?? 0) <= value) low = middle + 1
    else high = middle
  }
  return low
}

function kindOf(value: unknown): string {
  if (typeof value === 'string') return value
  return typeof value === 'number' ? String(value) : ''
}

export interface EventReaders<E> {
  readonly time: Accessor<E, unknown>
  readonly kind: Accessor<E, unknown>
}

export class EventCounts<E> {
  kinds: string[] = []
  times: Float64Array[] = []
  hidden: Uint8Array = new Uint8Array(0)
  #ids = new Map<string, number>()
  #data: readonly E[] = []
  #readers: EventReaders<E> | null = null
  #listed: readonly string[] = []
  #time: Float64Array = empty
  #kind: Int32Array = new Int32Array(0)
  #order: Uint32Array | null = null
  #sorted: Float64Array = empty

  set(data: readonly E[], readers: EventReaders<E>, listed: readonly string[]): boolean {
    const previous = this.#data
    if (
      data === previous &&
      this.#readers !== null &&
      this.#readers.time === readers.time &&
      this.#readers.kind === readers.kind &&
      sameList(listed, this.#listed)
    ) {
      return false
    }
    const appended =
      this.#readers !== null &&
      this.#readers.time === readers.time &&
      this.#readers.kind === readers.kind &&
      sameList(listed, this.#listed) &&
      startsWith(data, previous)
    this.#data = data
    this.#readers = readers
    this.#listed = listed
    if (appended) this.#append(previous.length)
    else this.#rebuild()
    return true
  }

  hide(names: ReadonlySet<string>): void {
    this.hidden = new Uint8Array(this.kinds.length)
    for (let id = 0; id < this.kinds.length; id++) {
      if (names.has(this.kinds[id] ?? '')) this.hidden[id] = 1
    }
  }

  count(kind: number, from: number, to: number): number {
    const times = this.times[kind] ?? empty
    return lowerBound(times, to) - lowerBound(times, from)
  }

  first(): number {
    let first = Number.POSITIVE_INFINITY
    for (const times of this.times) if (times.length > 0) first = Math.min(first, times[0] ?? first)
    return first
  }

  last(): number {
    let last = Number.NEGATIVE_INFINITY
    for (const times of this.times) {
      if (times.length > 0) last = Math.max(last, (times[times.length - 1] ?? last) + 1)
    }
    return last
  }

  after(time: number): number {
    let next = Number.POSITIVE_INFINITY
    for (let id = 0; id < this.times.length; id++) {
      if (this.hidden[id] === 1) continue
      const times = this.times[id] ?? empty
      const at = upperBound(times, time)
      if (at < times.length) next = Math.min(next, times[at] ?? next)
    }
    return next
  }

  before(time: number): number {
    let previous = Number.NEGATIVE_INFINITY
    for (let id = 0; id < this.times.length; id++) {
      if (this.hidden[id] === 1) continue
      const times = this.times[id] ?? empty
      const at = lowerBound(times, time)
      if (at > 0) previous = Math.max(previous, times[at - 1] ?? previous)
    }
    return previous
  }

  read(from: number, to: number): E[] {
    const order = this.#sortedOrder()
    const sorted = this.#sorted
    const found: E[] = []
    const end = from === to ? upperBound(sorted, to) : lowerBound(sorted, to)
    for (let at = lowerBound(sorted, from); at < end; at++) {
      const index = order[at] ?? 0
      if (this.hidden[this.#kind[index] ?? 0] === 1) continue
      const item = this.#data[index]
      if (item !== undefined) found.push(item)
    }
    return found
  }

  #sortedOrder(): Uint32Array {
    if (this.#order) return this.#order
    const time = this.#time
    const length = this.#data.length
    let valid = 0
    for (let index = 0; index < length; index++) if (!Number.isNaN(time[index])) valid++
    const order = new Uint32Array(valid)
    let at = 0
    for (let index = 0; index < length; index++) {
      if (!Number.isNaN(time[index])) order[at++] = index
    }
    order.sort((a, b) => (time[a] ?? 0) - (time[b] ?? 0) || a - b)
    const sorted = new Float64Array(valid)
    for (let index = 0; index < valid; index++) sorted[index] = time[order[index] ?? 0] ?? 0
    this.#order = order
    this.#sorted = sorted
    return order
  }

  #idOf(kind: string): number {
    let id = this.#ids.get(kind)
    if (id === undefined) {
      id = this.kinds.length
      this.kinds.push(kind)
      this.#ids.set(kind, id)
    }
    return id
  }

  #read(from: number, buckets: number[][]): void {
    const readers = this.#readers
    if (!readers) return
    const data = this.#data
    for (let index = from; index < data.length; index++) {
      const item = data[index] as E
      const time = toTime(readers.time(item))
      this.#time[index] = time
      if (Number.isNaN(time)) {
        this.#kind[index] = -1
        continue
      }
      const id = this.#idOf(kindOf(readers.kind(item)))
      this.#kind[index] = id
      let bucket = buckets[id]
      if (!bucket) {
        bucket = []
        buckets[id] = bucket
      }
      bucket.push(time)
    }
  }

  #rebuild(): void {
    this.kinds = []
    this.#ids = new Map()
    for (const kind of this.#listed) this.#idOf(kind)
    const length = this.#data.length
    this.#time = new Float64Array(length)
    this.#kind = new Int32Array(length)
    const buckets: number[][] = []
    this.#read(0, buckets)
    this.times = this.kinds.map((_, id) => Float64Array.from(buckets[id] ?? []).sort())
    this.#order = null
  }

  #append(from: number): void {
    const length = this.#data.length
    if (length > this.#time.length) {
      const time = new Float64Array(Math.max(length, this.#time.length * 2))
      time.set(this.#time)
      const kind = new Int32Array(time.length)
      kind.set(this.#kind)
      this.#time = time
      this.#kind = kind
    }
    const buckets: number[][] = []
    this.#read(from, buckets)
    this.times = this.kinds.map((_, id) => {
      const base = this.times[id] ?? empty
      const added = buckets[id]
      return added ? mergeSorted(base, empty, Float64Array.from(added).sort()) : base
    })
    if (from < length) this.#order = null
  }
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false
  return true
}

function startsWith<E>(data: readonly E[], previous: readonly E[]): boolean {
  if (previous.length === 0 || data.length < previous.length) return false
  for (let index = 0; index < previous.length; index++) {
    if (data[index] !== previous[index]) return false
  }
  return true
}
