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
  #values = new Map<number, number>()
  #extent: Extent | null = null
  #stale = false

  get extent(): Extent | null {
    if (this.#stale) {
      this.#stale = false
      this.#extent = null
      for (const value of this.#values.values()) this.#include(value)
    }
    return this.#extent
  }

  ids(): IterableIterator<number> {
    return this.#values.keys()
  }

  set(id: number, value: number): void {
    const previous = this.#values.get(id)
    this.#values.set(id, value)
    if (previous !== undefined && this.#isBound(previous)) this.#stale = true
    if (!this.#stale) this.#include(value)
  }

  delete(id: number): void {
    const previous = this.#values.get(id)
    if (previous === undefined) return
    this.#values.delete(id)
    if (this.#isBound(previous)) this.#stale = true
  }

  clear(): void {
    this.#values.clear()
    this.#extent = null
    this.#stale = false
  }

  #isBound(value: number): boolean {
    return this.#extent !== null && (value === this.#extent[0] || value === this.#extent[1])
  }

  #include(value: number): void {
    this.#extent =
      this.#extent === null
        ? [value, value]
        : [Math.min(this.#extent[0], value), Math.max(this.#extent[1], value)]
  }
}
