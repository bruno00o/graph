export class IndexPool {
  #next: number
  #free: number[] = []

  constructor(used = 0) {
    this.#next = used
  }

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
