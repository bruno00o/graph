import type { GraphModel } from '../core/graph-model'
import type { LiveSource } from '../types'
import type { Emitter, GraphDataStatus } from './events'
import type { GraphState } from './graph-instance'

interface Waiter {
  readonly resolve: () => void
  readonly reject: (reason: unknown) => void
}

const noSources: readonly LiveSource<unknown>[] = Object.freeze([])

export const loadedData: GraphDataStatus = Object.freeze({ loading: false, failed: noSources })

export interface DataStatusSource {
  readonly model: GraphModel
  readonly emitter: Emitter
  state(): GraphState
  patch(next: Partial<GraphState>): void
  wait(): number
  flush(): void
  request(): void
  released(): void
  destroyed(): boolean
}

function sameSources(
  a: readonly LiveSource<unknown>[],
  b: readonly LiveSource<unknown>[],
): boolean {
  return a.length === b.length && a.every((source, at) => source === b[at])
}

export class DataStatus {
  readonly #source: DataStatusSource
  #waiters: Waiter[] = []
  #timer: ReturnType<typeof setTimeout> | null = null
  #expired = false
  #held = false
  #seen = -1

  constructor(source: DataStatusSource) {
    this.#source = source
  }

  get loading(): boolean {
    return this.#source.model.loadingSources > 0
  }

  holds(): boolean {
    const { model } = this.#source
    if (this.#expired || model.loadingSources === 0) return false
    const wait = this.#source.wait()
    if (!(wait > 0)) return false
    this.#held = true
    if (model.nodeCount === 0 || this.#timer !== null || wait === Number.POSITIVE_INFINITY) {
      return true
    }
    this.#timer = setTimeout(() => {
      this.#timer = null
      this.#expired = true
      this.#source.request()
    }, wait)
    return true
  }

  refresh(): void {
    const source = this.#source
    const { model } = source
    if (source.destroyed()) return
    const version = model.readinessVersion
    const loading = model.loadingSources > 0
    if (!loading) this.#settle()
    if (version !== this.#seen) {
      this.#seen = version
      const current = source.state().data
      const failed = model.failedSources()
      if (current.loading !== loading || !sameSources(current.failed, failed)) {
        const data: GraphDataStatus =
          !loading && failed.length === 0
            ? loadedData
            : Object.freeze({
                loading,
                failed: failed.length === 0 ? noSources : Object.freeze(failed),
              })
        source.patch({ data })
        source.emitter.emit('loadingchange', data)
        if (source.destroyed()) return
      }
    }
    if (this.#held && !this.holds()) {
      this.#held = false
      source.released()
    }
    if (!loading) this.#resolve()
  }

  loaded(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#waiters.push({ resolve, reject })
      if (!this.loading) {
        this.#source.flush()
        this.refresh()
      }
    })
  }

  destroy(reason: unknown): void {
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = null
    const waiting = this.#waiters
    this.#waiters = []
    for (const waiter of waiting) waiter.reject(reason)
  }

  #settle(): void {
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = null
    this.#expired = false
  }

  #resolve(): void {
    if (this.#waiters.length === 0) return
    const waiting = this.#waiters
    this.#waiters = []
    for (const waiter of waiting) waiter.resolve()
  }
}
