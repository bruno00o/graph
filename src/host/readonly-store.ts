import type { Observer, ReadonlyStore, Store, Subscription } from '@tanstack/store'

class SourceView<T> {
  readonly #source: Store<T>
  readonly #listeners = new Set<(value: T) => void>()
  #upstream: Subscription | null = null
  #delivering = false

  constructor(source: Store<T>) {
    this.#source = source
  }

  get state(): T {
    return this.#source.state
  }

  get(): T {
    return this.#source.state
  }

  subscribe(observerOrFn: Observer<T> | ((value: T) => void)): Subscription {
    const next =
      typeof observerOrFn === 'function' ? observerOrFn : observerOrFn.next?.bind(observerOrFn)
    const listener = (value: T) => next?.(value)
    this.#listeners.add(listener)
    this.#upstream ??= this.#source.subscribe(() => this.#deliver())
    return {
      unsubscribe: () => {
        if (!this.#listeners.delete(listener) || this.#listeners.size > 0) return
        this.#upstream?.unsubscribe()
        this.#upstream = null
      },
    }
  }

  #deliver(): void {
    if (this.#delivering) return
    this.#delivering = true
    try {
      let value: T
      do {
        value = this.#source.state
        for (const listener of [...this.#listeners]) {
          if (this.#listeners.has(listener)) listener(value)
        }
      } while (this.#source.state !== value)
    } finally {
      this.#delivering = false
    }
  }
}

export function readonlyOf<T>(source: Store<T>): ReadonlyStore<T> {
  return new SourceView(source) as unknown as ReadonlyStore<T>
}
