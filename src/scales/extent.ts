export type Extent = readonly [number, number]

export function sameExtent(a: Extent | null, b: Extent | null): boolean {
  return a === b || (a !== null && b !== null && a[0] === b[0] && a[1] === b[1])
}

export function combineExtents(a: Extent | null, b: Extent | null): Extent | null {
  if (a === null) return b
  if (b === null) return a
  return [Math.min(a[0], b[0]), Math.max(a[1], b[1])]
}

export class ExtentTracker {
  #values: Float64Array = new Float64Array(0)
  #count = 0
  #min = Number.POSITIVE_INFINITY
  #max = Number.NEGATIVE_INFINITY
  #extent: Extent | null = null
  #stale = false

  get extent(): Extent | null {
    if (this.#stale) {
      this.#stale = false
      this.#min = Number.POSITIVE_INFINITY
      this.#max = Number.NEGATIVE_INFINITY
      const values = this.#values
      for (let id = 0; id < values.length; id++) {
        const value = values[id] ?? Number.NaN
        if (value < this.#min) this.#min = value
        if (value > this.#max) this.#max = value
      }
    }
    if (this.#count === 0) this.#extent = null
    else if (this.#extent?.[0] !== this.#min || this.#extent[1] !== this.#max) {
      this.#extent = [this.#min, this.#max]
    }
    return this.#extent
  }

  forEachId(visit: (id: number) => void): void {
    const values = this.#values
    for (let id = 0; id < values.length; id++) {
      if (!Number.isNaN(values[id] ?? Number.NaN)) visit(id)
    }
  }

  set(id: number, value: number): void {
    if (id >= this.#values.length) this.#grow(id)
    const previous = this.#values[id] ?? Number.NaN
    this.#values[id] = value
    if (Number.isNaN(previous)) this.#count++
    else if (previous === this.#min || previous === this.#max) this.#stale = true
    if (!this.#stale) {
      if (value < this.#min) this.#min = value
      if (value > this.#max) this.#max = value
    }
  }

  delete(id: number): void {
    const previous = this.#values[id] ?? Number.NaN
    if (Number.isNaN(previous)) return
    this.#values[id] = Number.NaN
    this.#count--
    if (previous === this.#min || previous === this.#max) this.#stale = true
  }

  clear(): void {
    this.#values.fill(Number.NaN)
    this.#count = 0
    this.#min = Number.POSITIVE_INFINITY
    this.#max = Number.NEGATIVE_INFINITY
    this.#extent = null
    this.#stale = false
  }

  #grow(id: number): void {
    const next = new Float64Array(Math.max(64, this.#values.length * 2, id + 1)).fill(Number.NaN)
    next.set(this.#values)
    this.#values = next
  }
}
