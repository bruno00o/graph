const goldenTurn = 2.399963229728653
const primeX = 73856093
const primeY = 19349663
const candidateStep = 0.3
const nearby = 24
const choices = 24

export class CellTable {
  #mask: number
  #x: Int32Array
  #y: Int32Array
  #value: Int32Array
  #count = 0

  constructor(expected: number) {
    let size = 16
    while (size < expected * 2) size *= 2
    this.#mask = size - 1
    this.#x = new Int32Array(size)
    this.#y = new Int32Array(size)
    this.#value = new Int32Array(size).fill(-1)
  }

  #slot(cx: number, cy: number): number {
    let hash = Math.imul(cx, primeX) ^ Math.imul(cy, primeY)
    hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b)
    let slot = (hash ^ (hash >>> 13)) & this.#mask
    for (;;) {
      if ((this.#value[slot] ?? -1) < 0) return slot
      if (this.#x[slot] === cx && this.#y[slot] === cy) return slot
      slot = (slot + 1) & this.#mask
    }
  }

  get(cx: number, cy: number): number {
    return this.#value[this.#slot(cx, cy)] ?? -1
  }

  set(cx: number, cy: number, value: number): void {
    const slot = this.#slot(cx, cy)
    if ((this.#value[slot] ?? -1) < 0) {
      this.#x[slot] = cx
      this.#y[slot] = cy
      this.#count++
    }
    this.#value[slot] = value
    if (this.#count * 2 > this.#mask) this.#grow()
  }

  #grow(): void {
    const x = this.#x
    const y = this.#y
    const value = this.#value
    const size = (this.#mask + 1) * 2
    this.#mask = size - 1
    this.#x = new Int32Array(size)
    this.#y = new Int32Array(size)
    this.#value = new Int32Array(size).fill(-1)
    for (let slot = 0; slot < value.length; slot++) {
      const entry = value[slot] ?? -1
      if (entry < 0) continue
      const at = this.#slot(x[slot] ?? 0, y[slot] ?? 0)
      this.#x[at] = x[slot] ?? 0
      this.#y[at] = y[slot] ?? 0
      this.#value[at] = entry
    }
  }
}

export class Occupancy {
  readonly #cell: number
  readonly #gap: number
  readonly #step: number
  readonly #heads: CellTable
  readonly #x: Float64Array
  readonly #y: Float64Array
  readonly #r: Float64Array
  readonly #pile: Int32Array
  readonly #cursor: Int32Array
  #node: Int32Array
  #next: Int32Array
  #entries = 0

  constructor(capacity: number, cell: number, gap: number) {
    this.#cell = cell > 0 && Number.isFinite(cell) ? cell : 1
    this.#gap = gap
    this.#step = this.#cell * candidateStep
    this.#heads = new CellTable(capacity)
    this.#x = new Float64Array(capacity)
    this.#y = new Float64Array(capacity)
    this.#r = new Float64Array(capacity)
    this.#pile = new Int32Array(capacity)
    this.#cursor = new Int32Array(capacity)
    this.#node = new Int32Array(Math.max(capacity * 2, 16))
    this.#next = new Int32Array(this.#node.length)
  }

  add(index: number, x: number, y: number, r: number, pile: number = index): void {
    this.#x[index] = x
    this.#y[index] = y
    this.#r[index] = r
    this.#pile[index] = pile
    if (pile === index) this.#cursor[index] = 1
    const reach = r + this.#gap / 2
    const cell = this.#cell
    const x0 = Math.floor((x - reach) / cell)
    const x1 = Math.floor((x + reach) / cell)
    const y0 = Math.floor((y - reach) / cell)
    const y1 = Math.floor((y + reach) / cell)
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (this.#entries === this.#node.length) this.#grow()
        const entry = this.#entries++
        this.#node[entry] = index
        this.#next[entry] = this.#heads.get(cx, cy)
        this.#heads.set(cx, cy, entry)
      }
    }
  }

  #blocker(x: number, y: number, r: number): number {
    const gap = this.#gap
    const reach = r + gap / 2
    const cell = this.#cell
    const x0 = Math.floor((x - reach) / cell)
    const x1 = Math.floor((x + reach) / cell)
    const y0 = Math.floor((y - reach) / cell)
    const y1 = Math.floor((y + reach) / cell)
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (let entry = this.#heads.get(cx, cy); entry >= 0; entry = this.#next[entry] ?? -1) {
          const other = this.#node[entry] ?? 0
          const need = r + (this.#r[other] ?? 0) + gap
          const dx = (this.#x[other] ?? 0) - x
          const dy = (this.#y[other] ?? 0) - y
          if (dx * dx + dy * dy < need * need) return other
        }
      }
    }
    return -1
  }

  place(index: number, x: number, y: number, r: number, out: Float32Array): void {
    const blocker = this.#blocker(x, y, r)
    if (blocker < 0) {
      this.#put(index, x, y, r, index, out)
      return
    }
    const step = this.#step
    for (let at = 1; at <= nearby; at++) {
      const reach = step * Math.sqrt(at)
      const cx = x + Math.cos(at * goldenTurn) * reach
      const cy = y + Math.sin(at * goldenTurn) * reach
      if (this.#blocker(cx, cy, r) >= 0) continue
      this.#put(index, cx, cy, r, this.#find(blocker), out)
      return
    }
    const pile = this.#find(blocker)
    const rootX = this.#x[pile] ?? 0
    const rootY = this.#y[pile] ?? 0
    let first = -1
    let best = -1
    let bestX = 0
    let bestY = 0
    let bestDistance = Number.POSITIVE_INFINITY
    let last = Number.POSITIVE_INFINITY
    for (let at = this.#cursor[pile] ?? 1; at < last; at++) {
      const reach = step * Math.sqrt(at)
      const cx = rootX + Math.cos(at * goldenTurn) * reach
      const cy = rootY + Math.sin(at * goldenTurn) * reach
      const other = this.#blocker(cx, cy, r)
      if (other >= 0) {
        const joined = this.#find(other)
        if (joined !== pile) this.#pile[joined] = pile
        continue
      }
      if (first < 0) {
        first = at
        last = at + choices
      }
      const distance = (cx - x) * (cx - x) + (cy - y) * (cy - y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = at
        bestX = cx
        bestY = cy
      }
    }
    this.#cursor[pile] = best === first ? first + 1 : first
    this.#put(index, bestX, bestY, r, pile, out)
  }

  #find(index: number): number {
    const pile = this.#pile
    let at = index
    for (;;) {
      const up = pile[at] ?? at
      if (up === at) return at
      const above = pile[up] ?? up
      pile[at] = above
      at = above
    }
  }

  #put(index: number, x: number, y: number, r: number, pile: number, out: Float32Array): void {
    this.add(index, x, y, r, pile)
    out[index * 2] = x
    out[index * 2 + 1] = y
  }
  #grow(): void {
    const node = new Int32Array(this.#node.length * 2)
    const next = new Int32Array(node.length)
    node.set(this.#node)
    next.set(this.#next)
    this.#node = node
    this.#next = next
  }
}
