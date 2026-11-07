import type {
  EdgeMark,
  Key,
  LiveSource,
  NodeMark,
  SourceChange,
  SourceSubscription,
} from '../types'
import { isKey, toAccessor } from './accessor'
import { type KeyedItems, KeyMap, NativeKeyMap } from './key-map'
import { isLiveSource } from './live-source'
import { shallowEqual } from './shallow-equal'

export type ElementKind = 'nodes' | 'edges'

const comparedApart: ReadonlySet<string> = new Set(['merge', 'aggregate', 'scales'])

export type AnyMark = NodeMark<unknown> | EdgeMark<unknown>

/** A problem in the data: an item without a key, or a key already taken by an earlier item. */
export type GraphIssue =
  | { readonly type: 'missing-key'; readonly kind: ElementKind; readonly datum: unknown }
  | { readonly type: 'duplicate-key'; readonly kind: ElementKind; readonly key: Key }
  | {
      readonly type: 'missing-parent'
      readonly kind: 'nodes'
      readonly key: Key
      readonly parent: Key
    }
  | {
      readonly type: 'parent-cycle'
      readonly kind: 'nodes'
      readonly key: Key
      readonly parent: Key
    }
  | {
      readonly type: 'missing-carrier'
      readonly kind: 'edges'
      readonly key: Key
      readonly carrier: Key
    }

export interface Source<M extends AnyMark> {
  readonly slot: number
  mark: M
  readonly live: LiveSource<unknown> | null
  readonly items: KeyedItems<unknown>
  readonly queue: SourceChange<unknown>[]
  subscription: SourceSubscription | null
  retired: boolean
  previous: KeyedItems<unknown> | null
  forced: boolean
}

export interface PackedSource<M extends AnyMark> extends Source<M> {
  readonly items: KeyMap<unknown>
}

function isPacked<M extends AnyMark>(source: Source<M>): source is PackedSource<M> {
  return source.items instanceof KeyMap && source.items.dense
}

function holds(items: KeyedItems<unknown>, key: Key, datum: unknown): boolean {
  const known = items.get(key)
  return known === datum && (known !== undefined || items.has(key))
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
  position: number,
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

  get pendingCount(): number {
    let count = this.#dirty.size
    for (const source of this.#fresh) count += source.items.size
    return count
  }

  sole(): PackedSource<M> | null {
    const source = this.#fresh[0]
    if (!source || this.#fresh.length !== 1 || this.#dirty.size > 0) return null
    return this.#sources.length === 1 && this.#sources[0] === source && isPacked(source)
      ? source
      : null
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
      visit(key, forced, owner?.source, owner?.datum, -1)
    }
    const fresh = this.#fresh
    fresh.forEach((source, position) => {
      if (this.#sources.length === 1 && dirty.size === 0) {
        source.items.forEach((datum, key, at) => {
          visit(key, false, source, datum, at)
        })
        return
      }
      source.items.forEach((_, key) => {
        if (dirty.has(key)) return
        if (fresh.some((other, at) => at < position && other.items.has(key))) return
        const owner = this.owner(key)
        visit(key, false, owner?.source, owner?.datum, -1)
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
      if (source.queue.length > 64) source.items.reserve(source.items.size + source.queue.length)
      for (const change of source.queue) {
        if (change.type === 'delete') {
          source.items.delete(change.key)
          this.#markDirty(change.key)
          continue
        }
        source.items.set(change.key, change.value)
        if (source.forced || !previous || !holds(previous, change.key, change.value)) {
          this.#markDirty(change.key, source.forced)
        }
      }
      source.queue.length = 0
      if (!previous) continue
      previous.forEach((_, key) => {
        if (!source.items.has(key)) this.#markDirty(key)
      })
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
    const optionsChanged =
      old !== undefined && !shallowEqual(old.mark.options, mark.options, comparedApart)
    const data = mark.data
    if (isLiveSource(data)) {
      if (old?.live === data) {
        old.mark = mark
        if (optionsChanged) {
          old.items.forEach((_, key) => {
            this.#markDirty(key, true)
          })
        }
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
    old.items.forEach((_, key) => {
      if (!source.items.has(key)) this.#markDirty(key)
    })
    source.items.forEach((datum, key) => {
      if (optionsChanged || !holds(old.items, key, datum)) {
        this.#markDirty(key, optionsChanged)
      }
    })
    return source
  }

  #collect(source: Source<M>, data: Iterable<unknown>): void {
    const keyOf = toAccessor<unknown, unknown>(source.mark.options.key ?? 'id')
    if (Array.isArray(data)) {
      source.items.reserve(data.length)
      if (this.#collectUnique(source.items, data, keyOf)) return
    }
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
    items: KeyedItems<unknown>,
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
      if (!items.set(key, datum)) {
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
      items: live ? new NativeKeyMap() : new KeyMap(),
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
    const markKey = (_: unknown, key: Key) => {
      this.#markDirty(key)
    }
    source.previous?.forEach(markKey)
    source.items.forEach(markKey)
  }

  #markDirty(key: Key, forced = false): void {
    this.#dirty.set(key, forced || this.#dirty.get(key) === true)
  }
}
