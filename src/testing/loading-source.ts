import type { Key, LiveSource, SourceChange, SourceSubscription } from '../types'

type Listener<T> = (changes: ReadonlyArray<SourceChange<T>>) => void

class Statuses {
  readonly listeners: Set<() => void> = new Set()
  status: string | undefined

  constructor(status: string | undefined) {
    this.status = status
  }

  on(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  set(status: string | undefined): void {
    this.status = status
    for (const listener of [...this.listeners]) listener()
  }
}

export class LoadingSource<T extends { readonly id: Key }> implements LiveSource<T> {
  readonly items: Map<Key, T> = new Map()
  readonly listeners: Set<Listener<T>> = new Set()
  readonly own: Statuses
  readonly held: Statuses | null

  constructor(status: string | null = 'loading', subscription?: string) {
    this.own = new Statuses(status ?? undefined)
    this.held = subscription === undefined ? null : new Statuses(subscription)
  }

  get status(): string | undefined {
    return this.own.status
  }

  get watchers(): number {
    return this.own.listeners.size + (this.held?.listeners.size ?? 0)
  }

  on(_event: 'status:change', listener: () => void): () => void {
    return this.own.on(listener)
  }

  subscribeChanges(
    callback: Listener<T>,
    options?: { includeInitialState?: boolean },
  ): SourceSubscription {
    this.listeners.add(callback)
    if (options?.includeInitialState && this.items.size > 0) {
      callback([...this.items.values()].map((value) => this.#insert(value)))
    }
    const held = this.held
    const unsubscribe = () => {
      this.listeners.delete(callback)
    }
    if (!held) return { unsubscribe }
    return {
      unsubscribe,
      get status() {
        return held.status
      },
      on: (_event, listener) => held.on(listener),
    }
  }

  add(...values: T[]): void {
    const changes = values.map((value) => {
      const change = this.#insert(value)
      this.items.set(value.id, value)
      return change
    })
    for (const listener of [...this.listeners]) listener(changes)
  }

  set(status: string | undefined): void {
    this.own.set(status)
  }

  setSubscription(status: string | undefined): void {
    this.held?.set(status)
  }

  #insert(value: T): SourceChange<T> {
    return { type: this.items.has(value.id) ? 'update' : 'insert', key: value.id, value }
  }
}
