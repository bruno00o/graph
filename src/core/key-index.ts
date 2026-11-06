import type { Key } from '../types'

const integer = 1
const decimal = 2
const shortText = 3
const tagBits = 4
const tagMask = 15
const stride = 3
const maxLoad = 0.7
const minCapacity = 16
const toUnit = 2 ** -32

export const maxKeyValue: number = 2 ** 27 - 1

const float = new Float64Array(1)
const words = new Int32Array(float.buffer)

let tag = 0
let first = 0
let second = 0

function mix(kind: number, a: number, b: number): number {
  let h = Math.imul(a, 0xcc9e2d51) ^ Math.imul(((b << 16) | (b >>> 16)) ^ kind, 0x1b873593)
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

function encode(key: Key): boolean {
  if (typeof key === 'number') {
    if ((key | 0) === key) {
      tag = integer
      first = key | 0
      second = 0
      return true
    }
    float[0] = key
    tag = decimal
    first = words[0] ?? 0
    second = words[1] ?? 0
    return true
  }
  const length = key.length
  if (length > 8) return false
  let low = 0
  let high = 0
  for (let at = 0; at < length; at++) {
    const code = key.charCodeAt(at)
    if (code > 255) return false
    if (at < 4) low |= code << (at * 8)
    else high |= code << ((at - 4) * 8)
  }
  tag = shortText + length
  first = low
  second = high
  return true
}

export class KeyIndex {
  #slots: Int32Array = new Int32Array(0)
  #capacity = 0
  #count = 0
  #expected = 0
  #long: Map<Key, number> = new Map()

  get size(): number {
    return this.#count + this.#long.size
  }

  reserve(count: number): void {
    this.#expected = Math.max(this.#expected, count)
  }

  get(key: Key): number {
    if (!encode(key)) return this.#long.get(key) ?? -1
    if (this.#count === 0) return -1
    const kind = tag
    const a = first
    const b = second
    const capacity = this.#capacity
    const slots = this.#slots
    let at = Math.floor(mix(kind, a, b) * toUnit * capacity)
    for (;;) {
      const p = at * stride
      const head = slots[p] ?? 0
      if (head === 0) return -1
      if ((head & tagMask) === kind && slots[p + 1] === a && slots[p + 2] === b) {
        return head >>> tagBits
      }
      if (++at === capacity) at = 0
    }
  }

  add(key: Key, value: number): number {
    if (!encode(key)) {
      const known = this.#long.get(key)
      if (known !== undefined) return known
      this.#long.set(key, value)
      return -1
    }
    if (value > maxKeyValue) throw new RangeError(`graph: more than ${maxKeyValue} keys`)
    if (this.#count + 1 > this.#capacity * maxLoad) {
      this.#resize(Math.max(minCapacity, this.#capacity * 2, Math.ceil(this.#expected / maxLoad)))
      this.#expected = 0
    }
    const kind = tag
    const a = first
    const b = second
    const capacity = this.#capacity
    const slots = this.#slots
    let at = Math.floor(mix(kind, a, b) * toUnit * capacity)
    for (;;) {
      const p = at * stride
      const head = slots[p] ?? 0
      if (head === 0) {
        slots[p] = value * (tagMask + 1) + kind
        slots[p + 1] = a
        slots[p + 2] = b
        this.#count++
        return -1
      }
      if ((head & tagMask) === kind && slots[p + 1] === a && slots[p + 2] === b) {
        return head >>> tagBits
      }
      if (++at === capacity) at = 0
    }
  }

  delete(key: Key): number {
    if (!encode(key)) {
      const known = this.#long.get(key)
      if (known === undefined) return -1
      this.#long.delete(key)
      return known
    }
    if (this.#count === 0) return -1
    const kind = tag
    const a = first
    const b = second
    const capacity = this.#capacity
    const slots = this.#slots
    let at = Math.floor(mix(kind, a, b) * toUnit * capacity)
    for (;;) {
      const p = at * stride
      const head = slots[p] ?? 0
      if (head === 0) return -1
      if ((head & tagMask) === kind && slots[p + 1] === a && slots[p + 2] === b) {
        this.#shift(at)
        this.#count--
        return head >>> tagBits
      }
      if (++at === capacity) at = 0
    }
  }

  copy(from: KeyIndex): void {
    this.#slots = from.#slots.slice()
    this.#capacity = from.#capacity
    this.#count = from.#count
    this.#expected = 0
    this.#long = new Map(from.#long)
  }

  clear(): void {
    this.#slots.fill(0)
    this.#count = 0
    this.#expected = 0
    this.#long.clear()
  }

  #shift(from: number): void {
    const slots = this.#slots
    const capacity = this.#capacity
    let hole = from
    let next = from
    for (;;) {
      if (++next === capacity) next = 0
      const p = next * stride
      const head = slots[p] ?? 0
      if (head === 0) break
      const a = slots[p + 1] ?? 0
      const b = slots[p + 2] ?? 0
      const home = Math.floor(mix(head & tagMask, a, b) * toUnit * capacity)
      const stays = hole <= next ? home > hole && home <= next : home > hole || home <= next
      if (stays) continue
      const q = hole * stride
      slots[q] = head
      slots[q + 1] = a
      slots[q + 2] = b
      hole = next
    }
    const q = hole * stride
    slots[q] = 0
    slots[q + 1] = 0
    slots[q + 2] = 0
  }

  #resize(capacity: number): void {
    const old = this.#slots
    const oldCapacity = this.#capacity
    const slots = new Int32Array(capacity * stride)
    for (let at = 0; at < oldCapacity; at++) {
      const p = at * stride
      const head = old[p] ?? 0
      if (head === 0) continue
      const a = old[p + 1] ?? 0
      const b = old[p + 2] ?? 0
      let to = Math.floor(mix(head & tagMask, a, b) * toUnit * capacity)
      while ((slots[to * stride] ?? 0) !== 0) if (++to === capacity) to = 0
      const q = to * stride
      slots[q] = head
      slots[q + 1] = a
      slots[q + 2] = b
    }
    this.#slots = slots
    this.#capacity = capacity
  }
}
