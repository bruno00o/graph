import type { Key } from '../types'
import { IndexPool } from './index-pool'

const none = -1
const empty = -1
const removed = -2
const fields = 4

function grownInts(array: Int32Array, length: number, fill = none): Int32Array {
  if (array.length >= length) return array
  const next = new Int32Array(Math.max(64, array.length * 2, length)).fill(fill)
  next.set(array)
  return next
}

function grownBytes(array: Uint8Array, length: number): Uint8Array {
  if (array.length >= length) return array
  const next = new Uint8Array(Math.max(64, array.length * 2, length))
  next.set(array)
  return next
}

function grownOrders(array: Float64Array, length: number): Float64Array {
  if (array.length >= length) return array
  const next = new Float64Array(Math.max(64, array.length * 2, length))
  next.set(array)
  return next
}

function hash(slot: number, low: number, high: number, value: number): number {
  let h = Math.imul(low, 0x9e3779b1) ^ Math.imul(high + 0x7f4a7c15, 0x85ebca77)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) ^ Math.imul(slot + 0x165667b1, 0xc2b2ae3d)
  h ^= Math.imul(value + 0x27d4eb2f, 0x165667b1)
  h ^= h >>> 13
  return Math.imul(h, 0x9e3779b1) ^ (h >>> 16)
}

export class EdgeMerges {
  slot: Int32Array = new Int32Array(0)
  source: Int32Array = new Int32Array(0)
  target: Int32Array = new Int32Array(0)
  count: Int32Array = new Int32Array(0)
  folded: Int32Array = new Int32Array(0)
  head: Int32Array = new Int32Array(0)
  carrier: Int32Array = new Int32Array(0)
  open: Uint8Array = new Uint8Array(0)
  of: Int32Array = new Int32Array(0)
  next: Int32Array = new Int32Array(0)
  #tail: Int32Array = new Int32Array(0)
  #first: Int32Array = new Int32Array(0)
  #previous: Int32Array = new Int32Array(0)
  #order: Float64Array = new Float64Array(0)
  #shown: Uint8Array = new Uint8Array(0)
  #keys: Int32Array = new Int32Array(0)
  #valueIds: Int32Array = new Int32Array(0)
  #table: Int32Array = new Int32Array(0)
  #mask = -1
  #used = 0
  #live = 0
  readonly #pool = new IndexPool()
  readonly #values = new Map<Key, number>()
  readonly #valueKeys: (Key | undefined)[] = []
  #valueUses: Int32Array = new Int32Array(0)
  readonly #valuePool = new IndexPool()

  get size(): number {
    return this.#live
  }

  value(id: number): Key | undefined {
    const value = this.#valueIds[id] ?? none
    return value < 0 ? undefined : this.#valueKeys[value]
  }

  reserveEdges(length: number): void {
    this.of = grownInts(this.of, length)
    this.next = grownInts(this.next, length)
    this.#previous = grownInts(this.#previous, length)
    this.#order = grownOrders(this.#order, length)
    this.#shown = grownBytes(this.#shown, length)
  }

  first(id: number): number {
    const known = this.#first[id] ?? none
    if (known >= 0) return known
    let first = none
    let least = Number.POSITIVE_INFINITY
    for (let at = this.head[id] ?? none; at >= 0; at = this.next[at] ?? none) {
      const order = this.#order[at] ?? 0
      if (order < least) {
        least = order
        first = at
      }
    }
    this.#first[id] = first
    return first
  }

  ordered(id: number): number[] {
    const members: number[] = []
    const order = this.#order
    let sorted = true
    let last = Number.NEGATIVE_INFINITY
    for (let at = this.head[id] ?? none; at >= 0; at = this.next[at] ?? none) {
      const current = order[at] ?? 0
      if (current < last) sorted = false
      last = current
      members.push(at)
    }
    if (!sorted) members.sort((a, b) => (order[a] ?? 0) - (order[b] ?? 0))
    return members
  }

  find(
    slot: number,
    source: number,
    target: number,
    directed: boolean,
    value: Key | undefined,
    lifted = false,
  ): number {
    const low = directed ? source : Math.min(source, target)
    const high = directed ? target : Math.max(source, target)
    const valueId = value === undefined ? none : this.#valueId(value)
    const tag = slot * 4 + (directed ? 0 : 1) + (lifted ? 2 : 0)
    if ((this.#used + 1) * 2 > this.#mask + 1) this.#resize(Math.max(16, (this.#live + 1) * 2))
    const found = this.#locate(tag, low, high, valueId)
    if (found >= 0) return this.#table[found] ?? none
    const id = this.#pool.acquire()
    this.#reserveAggregates(id + 1)
    const at = id * fields
    this.#keys[at] = tag
    this.#keys[at + 1] = low
    this.#keys[at + 2] = high
    this.#keys[at + 3] = valueId
    this.#valueIds[id] = valueId
    if (valueId >= 0) this.#valueUses[valueId] = (this.#valueUses[valueId] ?? 0) + 1
    this.slot[id] = slot
    this.source[id] = source
    this.target[id] = target
    this.count[id] = 0
    this.folded[id] = 0
    this.head[id] = none
    this.#tail[id] = none
    this.#first[id] = none
    this.carrier[id] = none
    this.open[id] = 0
    const free = -found - 1
    if (this.#table[free] === empty) this.#used++
    this.#table[free] = id
    this.#live++
    return id
  }

  join(id: number, edge: number, shown: boolean, order: number): void {
    this.reserveEdges(edge + 1)
    this.#order[edge] = order
    const first = this.#first[id] ?? none
    if ((this.count[id] ?? 0) === 0) this.#first[id] = edge
    else if (first >= 0 && order < (this.#order[first] ?? 0)) this.#first[id] = edge
    const tail = this.#tail[id] ?? none
    this.of[edge] = id
    this.next[edge] = none
    this.#previous[edge] = tail
    if (tail >= 0) this.next[tail] = edge
    else this.head[id] = edge
    this.#tail[id] = edge
    this.count[id] = (this.count[id] ?? 0) + 1
    this.#shown[edge] = shown ? 1 : 0
    if (!shown) this.folded[id] = (this.folded[id] ?? 0) + 1
  }

  wasShown(edge: number): boolean {
    return this.#shown[edge] === 1
  }

  setShown(edge: number, shown: boolean): void {
    const id = this.of[edge] ?? none
    if (id < 0 || this.wasShown(edge) === shown) return
    this.#shown[edge] = shown ? 1 : 0
    this.folded[id] = (this.folded[id] ?? 0) + (shown ? -1 : 1)
  }

  leave(edge: number): number {
    const id = this.of[edge] ?? none
    if (id < 0) return none
    const previous = this.#previous[edge] ?? none
    const next = this.next[edge] ?? none
    if (previous >= 0) this.next[previous] = next
    else this.head[id] = next
    if (next >= 0) this.#previous[next] = previous
    else this.#tail[id] = previous
    this.of[edge] = none
    this.next[edge] = none
    this.#previous[edge] = none
    this.count[id] = (this.count[id] ?? 1) - 1
    if (this.#shown[edge] !== 1) this.folded[id] = (this.folded[id] ?? 1) - 1
    if (this.#first[id] === edge) this.#first[id] = none
    return id
  }

  release(id: number): void {
    if ((this.count[id] ?? 0) > 0 || (this.slot[id] ?? none) < 0) return
    const at = id * fields
    const found = this.#locate(
      this.#keys[at] ?? 0,
      this.#keys[at + 1] ?? 0,
      this.#keys[at + 2] ?? 0,
      this.#keys[at + 3] ?? 0,
    )
    if (found >= 0) this.#table[found] = removed
    const valueId = this.#valueIds[id] ?? none
    if (valueId >= 0) {
      const uses = (this.#valueUses[valueId] ?? 1) - 1
      this.#valueUses[valueId] = uses
      if (uses === 0) {
        const value = this.#valueKeys[valueId]
        if (value !== undefined) this.#values.delete(value)
        this.#valueKeys[valueId] = undefined
        this.#valuePool.release(valueId)
      }
    }
    this.slot[id] = none
    this.carrier[id] = none
    this.#live--
    this.#pool.release(id)
  }

  alive(id: number): boolean {
    return (this.slot[id] ?? none) >= 0
  }

  forEach(visit: (id: number) => void): void {
    for (let id = 0; id < this.#pool.capacity; id++) if (this.alive(id)) visit(id)
  }

  #valueId(value: Key): number {
    const known = this.#values.get(value)
    if (known !== undefined) return known
    const id = this.#valuePool.acquire()
    this.#valueUses = grownInts(this.#valueUses, id + 1, 0)
    this.#valueUses[id] = 0
    this.#valueKeys[id] = value
    this.#values.set(value, id)
    return id
  }

  #reserveAggregates(length: number): void {
    if (this.slot.length >= length) return
    this.slot = grownInts(this.slot, length)
    this.source = grownInts(this.source, length)
    this.target = grownInts(this.target, length)
    this.count = grownInts(this.count, length, 0)
    this.folded = grownInts(this.folded, length, 0)
    this.head = grownInts(this.head, length)
    this.#tail = grownInts(this.#tail, length)
    this.#first = grownInts(this.#first, length)
    this.carrier = grownInts(this.carrier, length)
    this.open = grownBytes(this.open, length)
    this.#valueIds = grownInts(this.#valueIds, length)
    this.#keys = grownInts(this.#keys, this.slot.length * fields, 0)
  }

  #locate(tag: number, low: number, high: number, value: number): number {
    const keys = this.#keys
    const table = this.#table
    let at = hash(tag, low, high, value) & this.#mask
    let free = -1
    for (;;) {
      const id = table[at] ?? empty
      if (id === empty) return -(free >= 0 ? free : at) - 1
      if (id === removed) {
        if (free < 0) free = at
      } else {
        const base = id * fields
        if (
          keys[base] === tag &&
          keys[base + 1] === low &&
          keys[base + 2] === high &&
          keys[base + 3] === value
        )
          return at
      }
      at = (at + 1) & this.#mask
    }
  }

  #resize(minimum: number): void {
    let capacity = 16
    while (capacity < minimum) capacity *= 2
    this.#table = new Int32Array(capacity).fill(empty)
    this.#mask = capacity - 1
    this.#used = 0
    const keys = this.#keys
    for (let id = 0; id < this.#pool.capacity; id++) {
      if (!this.alive(id)) continue
      const base = id * fields
      const found = this.#locate(
        keys[base] ?? 0,
        keys[base + 1] ?? 0,
        keys[base + 2] ?? 0,
        keys[base + 3] ?? 0,
      )
      this.#table[-found - 1] = id
      this.#used++
    }
  }
}
