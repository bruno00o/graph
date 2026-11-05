export class IndexPool {
  #next = 0
  #free: number[] = []

  get capacity(): number {
    return this.#next
  }

  acquire(): number {
    return this.#free.pop() ?? this.#next++
  }

  release(index: number): void {
    this.#free.push(index)
  }
}
