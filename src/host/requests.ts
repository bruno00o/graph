export class PendingRequests<T> {
  readonly #same: (a: T, b: T) => boolean
  readonly #memory: number
  #sent: T[] = []

  constructor(same: (a: T, b: T) => boolean, memory: number) {
    this.#same = same
    this.#memory = memory
  }

  base(committed: T): T {
    return this.#sent[this.#sent.length - 1] ?? committed
  }

  send(value: T): void {
    this.#sent.push(value)
    if (this.#sent.length > this.#memory) this.#sent.shift()
  }

  answer(value: T): void {
    const at = this.#sent.findIndex((sent) => this.#same(sent, value))
    this.#sent = at < 0 ? [] : this.#sent.slice(at + 1)
  }
}
