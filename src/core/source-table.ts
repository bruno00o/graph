import type {
  EdgeMark,
  Key,
  LiveSource,
  NodeMark,
  SourceChange,
  SourceSubscription,
} from '../types'
import { isKey, toAccessor } from './accessor'
import { isLiveSource } from './live-source'
import { shallowEqual } from './shallow-equal'

export type ElementKind = 'nodes' | 'edges'

export type AnyMark = NodeMark<unknown> | EdgeMark<unknown>

/** A problem in the data: an item without a key, or a key already taken by an earlier item. */
export type GraphIssue =
  | { readonly type: 'missing-key'; readonly kind: ElementKind; readonly datum: unknown }
  | { readonly type: 'duplicate-key'; readonly kind: ElementKind; readonly key: Key }

export interface Source<M extends AnyMark> {
  readonly slot: number
  mark: M
  readonly live: LiveSource<unknown> | null
  readonly items: Map<Key, unknown>
  readonly queue: SourceChange<unknown>[]
  subscription: SourceSubscription | null
  retired: boolean
  previous: ReadonlyMap<Key, unknown> | null
  forced: boolean
}

export interface Owner<M extends AnyMark> {
  readonly source: Source<M>
  readonly datum: unknown
}

export type DirtyVisitor<M extends AnyMark> = (
  key: Key,
  forced: boolean,
  source: Source<M> | undefined,
  datum: unknown,
) => void

export class SourceTable<M extends AnyMark> {
  readonly #dirty: Map<Key, boolean> = new Map()
  readonly #fresh: Source<M>[] = []
  readonly #kind: ElementKind
  readonly #issues: GraphIssue[]
  readonly #notify: () => void
  #sources: Source<M>[] = []

  constructor(kind: ElementKind, issues: GraphIssue[], notify: () => void) {
    this.#kind = kind
    this.#issues = issues
    this.#notify = notify
  }

  setMarks(marks: readonly M[]): void {
    const previous = this.#sources
    this.#sources = marks.map((mark, slot) => this.#reconcile(slot, mark, previous[slot]))
    for (const old of previous.slice(marks.length)) this.#retire(old)
  }

  get pending(): boolean {
    return this.#dirty.size > 0 || this.#fresh.length > 0
  }

  isDirty(key: Key): boolean {
    if (this.#dirty.has(key)) return true
    for (const source of this.#fresh) if (source.items.has(key)) return true
    return false
  }

  forEachDirty(visit: DirtyVisitor<M>): void {
    const dirty = this.#dirty
    for (const [key, forced] of dirty) {
      const owner = this.owner(key)
      visit(key, forced, owner?.source, owner?.datum)
    }
    const fresh = this.#fresh
    fresh.forEach((source, position) => {
      if (this.#sources.length === 1 && dirty.size === 0) {
        source.items.forEach((datum, key) => {
          visit(key, false, source, datum)
        })
        return
      }
      source.items.forEach((_, key) => {
        if (dirty.has(key)) return
        if (fresh.some((other, at) => at < position && other.items.has(key))) return
        const owner = this.owner(key)
        visit(key, false, owner?.source, owner?.datum)
      })
    })
  }

  clearDirty(): void {
    this.#dirty.clear()
    this.#fresh.length = 0
  }

  markAt(slot: number): M {
    const source = this.#sources[slot]
    if (!source) throw new Error(`graph: no ${this.#kind} mark at position ${slot}`)
    return source.mark
  }

  drain(): void {
    for (const source of this.#sources) {
      const previous = source.previous
      for (const change of source.queue) {
        if (change.type === 'delete') {
          source.items.delete(change.key)
          this.#markDirty(change.key)
          continue
        }
        source.items.set(change.key, change.value)
        if (
          source.forced ||
          !previous ||
          previous.get(change.key) !== change.value ||
          !previous.has(change.key)
        ) {
          this.#markDirty(change.key, source.forced)
        }
      }
      source.queue.length = 0
      if (!previous) continue
      for (const key of previous.keys()) if (!source.items.has(key)) this.#markDirty(key)
      source.previous = null
      source.forced = false
    }
  }

  owner(key: Key): Owner<M> | undefined {
    let owner: Owner<M> | undefined
    for (const source of this.#sources) {
      const datum = source.items.get(key)
      if (datum === undefined && !source.items.has(key)) continue
      if (owner) {
        this.#issues.push({ type: 'duplicate-key', kind: this.#kind, key })
        break
      }
      owner = { source, datum }
    }
    return owner
  }

  destroy(): void {
    for (const source of this.#sources) {
      source.retired = true
      source.subscription?.unsubscribe()
      source.subscription = null
    }
    this.#sources = []
    this.clearDirty()
  }

  #reconcile(slot: number, mark: M, old: Source<M> | undefined): Source<M> {
    if (old?.mark === mark) return old
    const optionsChanged = old !== undefined && !shallowEqual(old.mark.options, mark.options)
    const data = mark.data
    if (isLiveSource(data)) {
      if (old?.live === data) {
        old.mark = mark
        if (optionsChanged) for (const key of old.items.keys()) this.#markDirty(key, true)
        return old
      }
      const source = this.#create(slot, mark, data)
      if (old) {
        source.previous = old.previous ?? old.items
        source.forced = optionsChanged || old.forced
        this.#notify()
      }
      source.subscription = data.subscribeChanges(
        (changes) => {
          if (source.retired || changes.length === 0) return
          for (const change of changes) source.queue.push(change)
          this.#notify()
        },
        { includeInitialState: true },
      )
      if (old) this.#retire(old, false)
      return source
    }
    const source = this.#create(slot, mark, null)
    this.#collect(source, data)
    if (!old || old.live || this.#fresh.includes(old)) {
      if (old) this.#retire(old)
      this.#fresh.push(source)
      return source
    }
    old.retired = true
    for (const key of old.items.keys()) if (!source.items.has(key)) this.#markDirty(key)
    for (const [key, datum] of source.items) {
      if (optionsChanged || !old.items.has(key) || old.items.get(key) !== datum) {
        this.#markDirty(key, optionsChanged)
      }
    }
    return source
  }

  #collect(source: Source<M>, data: Iterable<unknown>): void {
    const keyOf = toAccessor<unknown, unknown>(source.mark.options.key ?? 'id')
    if (Array.isArray(data) && this.#collectUnique(source.items, data, keyOf)) return
    for (const datum of data) {
      const key = keyOf(datum)
      if (!isKey(key)) {
        this.#issues.push({ type: 'missing-key', kind: this.#kind, datum })
        continue
      }
      if (source.items.has(key)) {
        this.#issues.push({ type: 'duplicate-key', kind: this.#kind, key })
        continue
      }
      source.items.set(key, datum)
    }
  }

  #collectUnique(
    items: Map<Key, unknown>,
    data: readonly unknown[],
    keyOf: (datum: unknown) => unknown,
  ): boolean {
    const issues = this.#issues.length
    for (const datum of data) {
      const key = keyOf(datum)
      if (!isKey(key)) {
        this.#issues.push({ type: 'missing-key', kind: this.#kind, datum })
        continue
      }
      const size = items.size
      items.set(key, datum)
      if (items.size === size) {
        items.clear()
        this.#issues.length = issues
        return false
      }
    }
    return true
  }

  #create(slot: number, mark: M, live: LiveSource<unknown> | null): Source<M> {
    return {
      slot,
      mark,
      live,
      items: new Map(),
      queue: [],
      subscription: null,
      retired: false,
      previous: null,
      forced: false,
    }
  }

  #retire(source: Source<M>, forget = true): void {
    const fresh = this.#fresh.indexOf(source)
    if (fresh >= 0) this.#fresh.splice(fresh, 1)
    source.retired = true
    source.subscription?.unsubscribe()
    source.subscription = null
    if (!forget && fresh < 0) return
    for (const key of source.previous?.keys() ?? []) this.#markDirty(key)
    for (const key of source.items.keys()) this.#markDirty(key)
  }

  #markDirty(key: Key, forced = false): void {
    this.#dirty.set(key, forced || this.#dirty.get(key) === true)
  }
}
