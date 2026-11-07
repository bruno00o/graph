const trackedLimit = 4096

export class Boundaries {
  readonly #exact: number
  readonly #rescan: (visit: (value: number) => void) => void
  #uses: Map<number, number> | null = new Map()
  #sorted: Float64Array | null = null
  #writes = 0

  constructor(exact: number, rescan: (visit: (value: number) => void) => void) {
    this.#exact = exact
    this.#rescan = rescan
  }

  add(value: number): void {
    if (!Number.isFinite(value)) return
    const uses = this.#uses
    if (!uses) {
      this.#writes++
      return
    }
    const count = uses.get(value) ?? 0
    uses.set(value, count + 1)
    if (count > 0) return
    this.#sorted = null
    if (uses.size > trackedLimit) {
      this.#uses = null
      this.#writes = 0
    }
  }

  remove(value: number): void {
    if (!Number.isFinite(value)) return
    const uses = this.#uses
    if (!uses) {
      this.#writes++
      return
    }
    const count = uses.get(value) ?? 0
    if (count > 1) uses.set(value, count - 1)
    else if (count === 1) {
      uses.delete(value)
      this.#sorted = null
    }
  }

  sorted(slots: number): Float64Array | null {
    if (!this.#uses && this.#writes >= Math.max(trackedLimit, slots)) this.#recount()
    const uses = this.#uses
    if (!uses || uses.size > this.#exact) return null
    if (!this.#sorted) this.#sorted = Float64Array.from(uses.keys()).sort()
    return this.#sorted
  }

  #recount(): void {
    this.#writes = 0
    const uses = new Map<number, number>()
    let overflow = false
    this.#rescan((value) => {
      if (overflow || !Number.isFinite(value)) return
      uses.set(value, (uses.get(value) ?? 0) + 1)
      if (uses.size > trackedLimit) overflow = true
    })
    if (overflow) return
    this.#uses = uses
    this.#sorted = null
  }
}
