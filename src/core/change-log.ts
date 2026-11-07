export interface LogCursor {
  epoch: number
  at: number
}

const minLimit = 4096

export class ChangeLog {
  #items: Uint32Array = new Uint32Array(64)
  #length = 0
  #epoch = 0
  #active = false

  get epoch(): number {
    return this.#epoch
  }

  get length(): number {
    return this.#length
  }

  add(index: number, capacity: number): void {
    if (!this.#active) return
    if (this.#length >= Math.max(minLimit, capacity)) {
      this.#epoch++
      this.#length = 0
    }
    if (this.#length === this.#items.length) {
      const items = new Uint32Array(this.#items.length * 2)
      items.set(this.#items)
      this.#items = items
    }
    this.#items[this.#length++] = index
  }

  cursor(): LogCursor {
    this.#active = true
    return { epoch: this.#epoch, at: this.#length }
  }

  since(cursor: LogCursor): Uint32Array | null {
    if (cursor.epoch !== this.#epoch || cursor.at > this.#length) return null
    return this.#items.subarray(cursor.at, this.#length)
  }
}
