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
}

export interface Owner<M extends AnyMark> {
  readonly source: Source<M>
  readonly datum: unknown
}

export class SourceTable<M extends AnyMark> {
  readonly dirty: Map<Key, boolean> = new Map()
  readonly remarked: Source<M>[] = []
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

  drain(): void {
    for (const source of this.#sources) {
      for (const change of source.queue) {
        if (change.type === 'delete') source.items.delete(change.key)
        else source.items.set(change.key, change.value)
        this.#markDirty(change.key)
      }
      source.queue.length = 0
    }
  }

  owner(key: Key): Owner<M> | undefined {
    let owner: Owner<M> | undefined
    for (const source of this.#sources) {
      if (!source.items.has(key)) continue
      if (owner) {
        this.#issues.push({ type: 'duplicate-key', kind: this.#kind, key })
        break
      }
      owner = { source, datum: source.items.get(key) }
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
    this.dirty.clear()
    this.remarked.length = 0
  }

  #reconcile(slot: number, mark: M, old: Source<M> | undefined): Source<M> {
    if (old?.mark === mark) return old
    const optionsChanged = old !== undefined && !shallowEqual(old.mark.options, mark.options)
    const data = mark.data
    if (isLiveSource(data)) {
      if (old?.live === data) {
        old.mark = mark
        this.#refresh(old, optionsChanged)
        return old
      }
      if (old) this.#retire(old)
      const source = this.#create(slot, mark, data)
      source.subscription = data.subscribeChanges(
        (changes) => {
          if (source.retired || changes.length === 0) return
          for (const change of changes) source.queue.push(change)
          this.#notify()
        },
        { includeInitialState: true },
      )
      return source
    }
    const source = this.#create(slot, mark, null)
    this.#collect(source, data)
    if (!old || old.live) {
      if (old) this.#retire(old)
      for (const key of source.items.keys()) this.#markDirty(key)
      return source
    }
    old.retired = true
    for (const key of old.items.keys()) if (!source.items.has(key)) this.#markDirty(key)
    for (const [key, datum] of source.items) {
      if (optionsChanged || !old.items.has(key) || old.items.get(key) !== datum) {
        this.#markDirty(key, optionsChanged)
      }
    }
    if (!optionsChanged) this.remarked.push(source)
    return source
  }

  #refresh(source: Source<M>, optionsChanged: boolean): void {
    if (!optionsChanged) {
      this.remarked.push(source)
      return
    }
    for (const key of source.items.keys()) this.#markDirty(key, true)
  }

  #collect(source: Source<M>, data: Iterable<unknown>): void {
    const keyOf = toAccessor<unknown, unknown>(source.mark.options.key ?? 'id')
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

  #create(slot: number, mark: M, live: LiveSource<unknown> | null): Source<M> {
    return { slot, mark, live, items: new Map(), queue: [], subscription: null, retired: false }
  }

  #retire(source: Source<M>): void {
    source.retired = true
    source.subscription?.unsubscribe()
    source.subscription = null
    for (const key of source.items.keys()) this.#markDirty(key)
  }

  #markDirty(key: Key, forced = false): void {
    this.dirty.set(key, forced || this.dirty.get(key) === true)
  }
}
