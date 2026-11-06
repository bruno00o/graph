export class IndexSet implements Iterable<number> {
  #items: Uint32Array = new Uint32Array(64)
  #marks: Uint8Array = new Uint8Array(64)
  #size = 0

  get size(): number {
    return this.#size
  }

  has(index: number): boolean {
    return this.#marks[index] === 1
  }

  add(index: number): void {
    if (index >= this.#marks.length) {
      const marks = new Uint8Array(Math.max(this.#marks.length * 2, index + 1))
      marks.set(this.#marks)
      this.#marks = marks
    }
    if (this.#marks[index] === 1) return
    this.#marks[index] = 1
    if (this.#size === this.#items.length) {
      const items = new Uint32Array(this.#items.length * 2)
      items.set(this.#items)
      this.#items = items
    }
    this.#items[this.#size++] = index
  }

  indices(): Uint32Array {
    return this.#items.subarray(0, this.#size)
  }

  clear(): void {
    const items = this.#items
    for (let at = 0; at < this.#size; at++) this.#marks[items[at] ?? 0] = 0
    this.#size = 0
  }

  *[Symbol.iterator](): Iterator<number> {
    for (let at = 0; at < this.#size; at++) yield this.#items[at] ?? 0
  }
}
