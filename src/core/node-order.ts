const digits = 1 << 16
const counts = new Uint32Array(digits)
const scratch = new Float64Array(1)
const scratchWords = new Uint32Array(scratch.buffer)

function sortableWords(value: number, hi: Uint32Array, lo: Uint32Array, at: number): void {
  scratch[0] = value
  const low = scratchWords[0] ?? 0
  const high = scratchWords[1] ?? 0
  if ((high & 0x80000000) !== 0) {
    hi[at] = ~high >>> 0
    lo[at] = ~low >>> 0
  } else {
    hi[at] = (high | 0x80000000) >>> 0
    lo[at] = low
  }
}

function before(values: Float64Array, a: number, b: number): boolean {
  const va = values[a] ?? 0
  const vb = values[b] ?? 0
  return va < vb || (va === vb && a < b)
}

export class NodeOrder {
  used = false
  version = 0
  length = 0
  list: Uint32Array = new Uint32Array(0)
  #capacity = 0
  #values: Float64Array = new Float64Array(0)
  #rank: Uint32Array = new Uint32Array(0)
  #listed: Uint8Array = new Uint8Array(0)
  #touched: Uint8Array = new Uint8Array(0)
  #changed: number[] = []
  #full = false

  use(): void {
    if (this.used) return
    this.used = true
    this.#full = true
  }

  rankOf(index: number): number {
    return this.used && this.#listed[index] === 1 ? (this.#rank[index] ?? index) : index
  }

  valueOf(index: number): number {
    return this.#values[index] ?? 0
  }

  set(index: number, value: unknown): void {
    if (!this.used) return
    const order = typeof value === 'number' && Number.isFinite(value) ? value + 0 : 0
    this.#reserve(index)
    if (this.#listed[index] === 1 && this.#values[index] === order) return
    this.#values[index] = order
    this.#touch(index)
  }

  remove(index: number): void {
    if (!this.used || index >= this.#capacity || this.#listed[index] !== 1) return
    this.#touch(index)
  }

  settle(alive: Uint8Array, capacity: number): boolean {
    if (!this.used) return false
    this.#reserve(capacity - 1)
    const changed = this.#changed
    if (!this.#full && changed.length === 0) return false
    if (this.#full || changed.length * 8 > this.length) this.#sortAll(alive, capacity)
    else this.#merge(alive)
    for (const index of changed) this.#touched[index] = 0
    changed.length = 0
    this.#full = false
    this.version++
    return true
  }

  #touch(index: number): void {
    if (this.#touched[index] === 1) return
    this.#touched[index] = 1
    this.#changed.push(index)
  }

  #reserve(index: number): void {
    if (index < this.#capacity) return
    const capacity = Math.max(64, this.#capacity * 2, index + 1)
    const values = new Float64Array(capacity)
    values.set(this.#values)
    this.#values = values
    const rank = new Uint32Array(capacity)
    rank.set(this.#rank)
    this.#rank = rank
    const listed = new Uint8Array(capacity)
    listed.set(this.#listed)
    this.#listed = listed
    const touched = new Uint8Array(capacity)
    touched.set(this.#touched)
    this.#touched = touched
    const list = new Uint32Array(capacity)
    list.set(this.list.subarray(0, this.length))
    this.list = list
    this.#capacity = capacity
  }

  #sortAll(alive: Uint8Array, capacity: number): void {
    const listed = this.#listed
    listed.fill(0)
    let count = 0
    for (let index = 0; index < capacity; index++) if (alive[index] === 1) count++
    let indices = new Uint32Array(count)
    let hi = new Uint32Array(count)
    let lo = new Uint32Array(count)
    let at = 0
    for (let index = 0; index < capacity; index++) {
      if (alive[index] !== 1) continue
      indices[at] = index
      sortableWords(this.#values[index] ?? 0, hi, lo, at)
      at++
    }
    let nextIndices = new Uint32Array(count)
    let nextHi = new Uint32Array(count)
    let nextLo = new Uint32Array(count)
    for (let pass = 0; pass < 4; pass++) {
      const words = pass < 2 ? lo : hi
      const shift = pass % 2 === 0 ? 0 : 16
      counts.fill(0)
      for (let i = 0; i < count; i++) {
        const digit = ((words[i] ?? 0) >>> shift) & 0xffff
        counts[digit] = (counts[digit] ?? 0) + 1
      }
      if (count === 0 || counts[((words[0] ?? 0) >>> shift) & 0xffff] === count) continue
      let sum = 0
      for (let digit = 0; digit < digits; digit++) {
        const n = counts[digit] ?? 0
        counts[digit] = sum
        sum += n
      }
      for (let i = 0; i < count; i++) {
        const digit = ((words[i] ?? 0) >>> shift) & 0xffff
        const to = counts[digit] ?? 0
        counts[digit] = to + 1
        nextIndices[to] = indices[i] ?? 0
        nextHi[to] = hi[i] ?? 0
        nextLo[to] = lo[i] ?? 0
      }
      ;[indices, nextIndices] = [nextIndices, indices]
      ;[hi, nextHi] = [nextHi, hi]
      ;[lo, nextLo] = [nextLo, lo]
    }
    this.list.set(indices)
    this.length = count
    const rank = this.#rank
    for (let position = 0; position < count; position++) {
      const index = indices[position] ?? 0
      rank[index] = position
      listed[index] = 1
    }
  }

  #merge(alive: Uint8Array): void {
    const values = this.#values
    const touched = this.#touched
    const listed = this.#listed
    const moved: number[] = []
    for (const index of this.#changed) {
      listed[index] = 0
      if (alive[index] === 1) moved.push(index)
    }
    moved.sort((a, b) => (values[a] ?? 0) - (values[b] ?? 0) || a - b)
    const list = this.list
    let kept = 0
    for (let position = 0; position < this.length; position++) {
      const index = list[position] ?? 0
      if (touched[index] !== 1) list[kept++] = index
    }
    const total = kept + moved.length
    let from = kept - 1
    let take = moved.length - 1
    for (let to = total - 1; to >= 0; to--) {
      const next = moved[take]
      if (next !== undefined && (from < 0 || before(values, list[from] ?? 0, next))) {
        list[to] = next
        take--
      } else {
        list[to] = list[from] ?? 0
        from--
      }
    }
    this.length = total
    const rank = this.#rank
    for (let position = 0; position < total; position++) rank[list[position] ?? 0] = position
    for (const index of moved) listed[index] = 1
  }
}
