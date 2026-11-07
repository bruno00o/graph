const largeCells = 64
const cellBudget = 4

export class Obstacles {
  readonly capacity: number
  readonly boxes: Float64Array
  readonly present: Uint8Array
  readonly #mark: Uint32Array
  #generation = 0
  readonly #ignore: Uint32Array
  #ignoring = 1
  readonly #cell: number
  readonly #minX: number
  readonly #minY: number
  readonly #cols: number
  readonly #rows: number
  readonly #offsets: Uint32Array
  readonly #items: Uint32Array
  readonly #large: Uint32Array
  readonly size: number

  constructor(xy: Float32Array, extents: Float32Array, margin: number) {
    const capacity = Math.min(xy.length >> 1, extents.length >> 1)
    this.capacity = capacity
    this.boxes = new Float64Array(capacity * 4)
    this.present = new Uint8Array(capacity)
    this.#mark = new Uint32Array(capacity)
    this.#ignore = new Uint32Array(capacity)
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    let count = 0
    let sides = 0
    for (let index = 0; index < capacity; index++) {
      const hw = extents[index * 2] ?? 0
      const hh = extents[index * 2 + 1] ?? 0
      const x = xy[index * 2] ?? 0
      const y = xy[index * 2 + 1] ?? 0
      if (!(hw > 0 && hh > 0) || !Number.isFinite(x) || !Number.isFinite(y)) continue
      const box = index * 4
      this.boxes[box] = x - hw - margin
      this.boxes[box + 1] = y - hh - margin
      this.boxes[box + 2] = x + hw + margin
      this.boxes[box + 3] = y + hh + margin
      this.present[index] = 1
      minX = Math.min(minX, this.boxes[box] ?? 0)
      minY = Math.min(minY, this.boxes[box + 1] ?? 0)
      maxX = Math.max(maxX, this.boxes[box + 2] ?? 0)
      maxY = Math.max(maxY, this.boxes[box + 3] ?? 0)
      sides += hw + hh + margin * 2
      count++
    }
    this.size = count > 0 ? sides / count : 1
    if (count === 0) {
      minX = 0
      minY = 0
      maxX = 1
      maxY = 1
    }
    const width = Math.max(maxX - minX, 1e-6)
    const height = Math.max(maxY - minY, 1e-6)
    let cell = Math.max(this.size * 2, 1e-6)
    while ((width / cell + 1) * (height / cell + 1) > count * cellBudget + 1024) cell *= 1.5
    this.#cell = cell
    this.#minX = minX
    this.#minY = minY
    this.#cols = Math.max(1, Math.ceil(width / cell) + 1)
    this.#rows = Math.max(1, Math.ceil(height / cell) + 1)
    const cells = this.#cols * this.#rows
    const counts = new Uint32Array(cells + 1)
    const large: number[] = []
    const each = (index: number, visit: (at: number) => void): boolean => {
      const box = index * 4
      const c0 = this.#col(this.boxes[box] ?? 0)
      const c1 = this.#col(this.boxes[box + 2] ?? 0)
      const r0 = this.#row(this.boxes[box + 1] ?? 0)
      const r1 = this.#row(this.boxes[box + 3] ?? 0)
      if ((c1 - c0 + 1) * (r1 - r0 + 1) > largeCells) return false
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) visit(r * this.#cols + c)
      return true
    }
    for (let index = 0; index < capacity; index++) {
      if (this.present[index] !== 1) continue
      if (
        !each(index, (at) => {
          counts[at + 1] = (counts[at + 1] ?? 0) + 1
        })
      ) {
        large.push(index)
      }
    }
    for (let at = 0; at < cells; at++) counts[at + 1] = (counts[at + 1] ?? 0) + (counts[at] ?? 0)
    this.#offsets = counts.slice()
    const cursor = counts
    this.#items = new Uint32Array(counts[cells] ?? 0)
    for (let index = 0; index < capacity; index++) {
      if (this.present[index] !== 1) continue
      each(index, (at) => {
        const slot = cursor[at] ?? 0
        this.#items[slot] = index
        cursor[at] = slot + 1
      })
    }
    this.#large = Uint32Array.from(large)
  }

  #col(x: number): number {
    return Math.min(this.#cols - 1, Math.max(0, Math.floor((x - this.#minX) / this.#cell)))
  }

  #row(y: number): number {
    return Math.min(this.#rows - 1, Math.max(0, Math.floor((y - this.#minY) / this.#cell)))
  }

  ignore(nodes: readonly number[], parents: Int32Array | null): void {
    this.#ignoring++
    if (this.#ignoring === 0xffffffff) {
      this.#ignore.fill(0)
      this.#ignoring = 1
    }
    for (const node of nodes) {
      let at = node
      for (let depth = 0; depth < 256 && at >= 0 && at < this.capacity; depth++) {
        this.#ignore[at] = this.#ignoring
        at = parents ? (parents[at] ?? -1) : -1
      }
    }
  }

  ignored(index: number): boolean {
    return this.#ignore[index] === this.#ignoring
  }

  #fresh(): number {
    this.#generation++
    if (this.#generation === 0xffffffff) {
      this.#mark.fill(0)
      this.#generation = 1
    }
    return this.#generation
  }

  query(x0: number, y0: number, x1: number, y1: number, visit: (index: number) => boolean): void {
    const generation = this.#fresh()
    const c0 = this.#col(Math.min(x0, x1))
    const c1 = this.#col(Math.max(x0, x1))
    const r0 = this.#row(Math.min(y0, y1))
    const r1 = this.#row(Math.max(y0, y1))
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const at = r * this.#cols + c
        const end = this.#offsets[at + 1] ?? 0
        for (let slot = this.#offsets[at] ?? 0; slot < end; slot++) {
          const index = this.#items[slot] ?? 0
          if (this.#mark[index] === generation) continue
          this.#mark[index] = generation
          if (visit(index)) return
        }
      }
    }
    for (const index of this.#large) {
      if (this.#mark[index] === generation) continue
      this.#mark[index] = generation
      if (visit(index)) return
    }
  }

  crosses(index: number, x0: number, y0: number, x1: number, y1: number): boolean {
    const box = index * 4
    const left = Math.min(x0, x1)
    const right = Math.max(x0, x1)
    const top = Math.min(y0, y1)
    const bottom = Math.max(y0, y1)
    const bx0 = this.boxes[box] ?? 0
    const by0 = this.boxes[box + 1] ?? 0
    const bx1 = this.boxes[box + 2] ?? 0
    const by1 = this.boxes[box + 3] ?? 0
    if (top === bottom) return by0 < top && top < by1 && bx0 < right && left < bx1
    if (left === right) return bx0 < left && left < bx1 && by0 < bottom && top < by1
    return bx0 < right && left < bx1 && by0 < bottom && top < by1
  }

  blocked(x0: number, y0: number, x1: number, y1: number): boolean {
    let hit = false
    this.query(x0, y0, x1, y1, (index) => {
      if (this.#ignore[index] === this.#ignoring) return false
      hit = this.crosses(index, x0, y0, x1, y1)
      return hit
    })
    return hit
  }
}
