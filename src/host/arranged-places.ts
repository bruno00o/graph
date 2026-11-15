import type { Layout } from '../types'

const none = -2

export class ArrangedPlaces {
  #parent = new Int32Array(0)
  #offset = new Float64Array(0)
  readonly #layouts = new Map<number, Layout>()

  get empty(): boolean {
    return this.#parent.length === 0
  }

  record(index: number, parent: number, dx: number, dy: number): void {
    if (index >= this.#parent.length) {
      const size = Math.max(index + 1, this.#parent.length * 2, 64)
      const parents = new Int32Array(size).fill(none)
      parents.set(this.#parent)
      const offsets = new Float64Array(size * 2)
      offsets.set(this.#offset)
      this.#parent = parents
      this.#offset = offsets
    }
    this.#parent[index] = parent
    this.#offset[index * 2] = dx
    this.#offset[index * 2 + 1] = dy
  }

  offset(index: number, parent: number): readonly [number, number] | null {
    if (parent < 0 || this.#parent[index] !== parent) return null
    return [this.#offset[index * 2] ?? 0, this.#offset[index * 2 + 1] ?? 0]
  }

  arrangedWith(container: number, layout: Layout): void {
    this.#layouts.set(container, layout)
  }

  layout(container: number): Layout | null {
    return this.#layouts.get(container) ?? null
  }

  forget(index: number): void {
    if (index < this.#parent.length) this.#parent[index] = none
    this.#layouts.delete(index)
  }
}
