import { KeyIndex } from '../core/key-index'
import type { Key } from '../types'
import { orderByTime } from './order'

export interface Cut {
  readonly time: number
  readonly inclusive: boolean
}

export function before(time: number, cut: Cut): boolean {
  return time < cut.time || (cut.inclusive && time === cut.time)
}

function grownInts(array: Int32Array, length: number): Int32Array {
  if (length <= array.length) return array
  const next = new Int32Array(Math.max(16, array.length * 2, length))
  next.set(array)
  return next
}

function grownFloats(array: Float64Array, length: number): Float64Array {
  if (length <= array.length) return array
  const next = new Float64Array(Math.max(16, array.length * 2, length))
  next.set(array)
  return next
}

export class HistoryIndex {
  readonly #elements = new KeyIndex()
  readonly keys: Key[] = []
  times: Float64Array = new Float64Array(0)
  owners: Int32Array = new Int32Array(0)
  values: unknown[] = []
  size = 0
  live = 0
  sorted: Int32Array = new Int32Array(0)
  sortedTimes: Float64Array = new Float64Array(0)
  version = 0
  #first: Int32Array = new Int32Array(1)
  #list: Int32Array = new Int32Array(0)
  #extra: (number[] | undefined)[] = []
  #extras = 0
  #added: number[] = []
  #removed = 0
  #changed = new Map<number, number>()
  #entries: Map<Key, number> | null = null

  get elementCount(): number {
    return this.keys.length
  }

  elementOf(key: Key): number {
    return this.#elements.get(key)
  }

  #intern(key: Key): number {
    const known = this.#elements.get(key)
    if (known !== -1) return known
    const element = this.keys.length
    this.#elements.add(key, element)
    this.keys.push(key)
    return element
  }

  reserve(count: number): void {
    this.times = grownFloats(this.times, count)
    this.owners = grownInts(this.owners, count)
  }

  add(key: Key, time: number, values: unknown, entry?: Key): void {
    const id = this.size++
    this.reserve(this.size)
    const element = this.#intern(key)
    this.times[id] = time + 0
    this.owners[id] = element
    this.values[id] = values
    this.live++
    this.#added.push(id)
    this.#touch(element, time)
    if (entry !== undefined) {
      this.#entries ??= new Map()
      this.#entries.set(entry, id)
    }
  }

  load(key: Key, time: number, values: unknown): void {
    const id = this.size++
    if (id >= this.times.length) this.reserve(id + 1)
    this.times[id] = time + 0
    this.owners[id] = this.#intern(key)
    this.values[id] = values
    this.live++
  }

  build(): void {
    this.#rebuild()
    this.version++
  }

  remove(entry: Key): void {
    const id = this.#entries?.get(entry)
    if (id === undefined) return
    this.#entries?.delete(entry)
    const element = this.owners[id] ?? -1
    if (element < 0) return
    this.owners[id] = -1
    this.values[id] = undefined
    this.live--
    this.#removed++
    this.#touch(element, this.times[id] ?? 0)
  }

  #touch(element: number, time: number): void {
    const known = this.#changed.get(element)
    if (known === undefined || time < known) this.#changed.set(element, time)
  }

  settle(): Map<number, number> | null {
    const changed = this.#changed
    if (changed.size === 0) return null
    this.#changed = new Map()
    const added = this.#added
    this.#added = []
    const removed = this.#removed
    this.#removed = 0
    const dead = this.size - this.live
    const churn = added.length + removed + this.#extras
    if (this.version === 0 || churn * 8 > this.live || dead * 8 > this.size) this.#rebuild()
    else this.#patch(added, changed)
    this.version++
    return changed
  }

  bound(cut: Cut): number {
    const times = this.sortedTimes
    let low = 0
    let high = this.sorted.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (before(times[middle] ?? 0, cut)) low = middle + 1
      else high = middle
    }
    return low
  }

  count(element: number): number {
    const extra = this.#extra[element]
    if (extra) return extra.length
    if (element + 1 >= this.#first.length) return 0
    return (this.#first[element + 1] ?? 0) - (this.#first[element] ?? 0)
  }

  at(element: number, at: number): number {
    const extra = this.#extra[element]
    if (extra) return extra[at] ?? 0
    return this.#list[(this.#first[element] ?? 0) + at] ?? 0
  }

  countBefore(element: number, cut: Cut): number {
    let low = 0
    let high = this.count(element)
    while (low < high) {
      const middle = (low + high) >>> 1
      if (before(this.times[this.at(element, middle)] ?? 0, cut)) low = middle + 1
      else high = middle
    }
    return low
  }

  #rebuild(): void {
    const size = this.size
    const live = this.live
    const remap = live === size ? null : new Int32Array(size).fill(-1)
    if (remap) {
      const times = new Float64Array(live)
      const owners = new Int32Array(live)
      const values: unknown[] = new Array(live)
      let next = 0
      for (let id = 0; id < size; id++) {
        const owner = this.owners[id] ?? -1
        if (owner < 0) continue
        remap[id] = next
        times[next] = this.times[id] ?? 0
        owners[next] = owner
        values[next] = this.values[id]
        next++
      }
      this.times = times
      this.owners = owners
      this.values = values
      this.size = live
      const entries = this.#entries
      if (entries) for (const [entry, id] of entries) entries.set(entry, remap[id] ?? -1)
    }
    const ids = new Int32Array(live)
    for (let id = 0; id < live; id++) ids[id] = id
    const sorted = orderByTime(this.times, ids)
    const sortedTimes = new Float64Array(live)
    for (let at = 0; at < live; at++) sortedTimes[at] = this.times[sorted[at] ?? 0] ?? 0
    this.sorted = sorted
    this.sortedTimes = sortedTimes
    const elements = this.keys.length
    const first = new Int32Array(elements + 1)
    for (let id = 0; id < live; id++) {
      const owner = this.owners[id] ?? 0
      first[owner + 1] = (first[owner + 1] ?? 0) + 1
    }
    for (let element = 0; element < elements; element++) {
      first[element + 1] = (first[element + 1] ?? 0) + (first[element] ?? 0)
    }
    const fill = first.slice(0, elements)
    const list = new Int32Array(live)
    for (let at = 0; at < live; at++) {
      const id = sorted[at] ?? 0
      const owner = this.owners[id] ?? 0
      const place = fill[owner] ?? 0
      fill[owner] = place + 1
      list[place] = id
    }
    this.#first = first
    this.#list = list
    this.#extra = []
    this.#extras = 0
  }

  #patch(added: readonly number[], changed: ReadonlyMap<number, number>): void {
    for (const element of changed.keys()) {
      const length = this.count(element)
      const list: number[] = []
      for (let at = 0; at < length; at++) {
        const id = this.at(element, at)
        if ((this.owners[id] ?? -1) === element) list.push(id)
      }
      const old = this.#extra[element]
      if (old) this.#extras -= old.length
      this.#extra[element] = list
      this.#extras += list.length
    }
    const kept = added.filter((id) => (this.owners[id] ?? -1) >= 0)
    if (kept.length === 0) return
    const order = orderByTime(this.times, Int32Array.from(kept))
    for (let at = 0; at < order.length; at++) {
      const id = order[at] ?? 0
      const element = this.owners[id] ?? 0
      const list = this.#extra[element] as number[]
      const time = this.times[id] ?? 0
      let low = 0
      let high = list.length
      while (low < high) {
        const middle = (low + high) >>> 1
        if ((this.times[list[middle] ?? 0] ?? 0) <= time) low = middle + 1
        else high = middle
      }
      list.splice(low, 0, id)
      this.#extras++
    }
    const length = this.sorted.length
    const total = length + order.length
    const sorted = new Int32Array(total)
    const sortedTimes = new Float64Array(total)
    let a = 0
    let b = 0
    for (let out = 0; out < total; out++) {
      const timeA = a < length ? (this.sortedTimes[a] ?? 0) : Infinity
      const id = b < order.length ? (order[b] ?? 0) : -1
      const timeB = id >= 0 ? (this.times[id] ?? 0) : Infinity
      if (a < length && (id < 0 || timeA <= timeB)) {
        sorted[out] = this.sorted[a] ?? 0
        sortedTimes[out] = timeA
        a++
      } else {
        sorted[out] = id
        sortedTimes[out] = timeB
        b++
      }
    }
    this.sorted = sorted
    this.sortedTimes = sortedTimes
  }
}
