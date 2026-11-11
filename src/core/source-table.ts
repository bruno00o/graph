import type {
  EdgeMark,
  Key,
  LiveSource,
  NodeMark,
  ShapeMark,
  SourceChange,
  SourceSubscription,
} from '../types'
import { isKey, toAccessor } from './accessor'
import type { AnyIssue, ElementKind, MissingKeyIssue } from './issues'
import { type KeyedItems, KeyMap, NativeKeyMap } from './key-map'
import { isLiveSource, type Readiness, sourceReadiness, watchReadiness } from './live-source'
import { sameOptions } from './same-options'

export type { ElementKind }

const comparedApart: ReadonlySet<string> = new Set([
  'merge',
  'aggregate',
  'betweenGroups',
  'scales',
])

const queueFloor = 1024

const noItems: KeyedItems<unknown> = new NativeKeyMap()

export type AnyMark = NodeMark<unknown> | EdgeMark<unknown> | ShapeMark<unknown>

export interface Source<M extends AnyMark> {
  readonly slot: number
  mark: M
  readonly live: LiveSource<unknown> | null
  readonly items: KeyMap<unknown> | NativeKeyMap<unknown>
  readonly queue: SourceChange<unknown>[]
  subscription: SourceSubscription | null
  retired: boolean
  previous: KeyedItems<unknown> | null
  readonly issues: AnyIssue[]
  rejected: Map<unknown, MissingKeyIssue<ElementKind>> | null
  readiness: Readiness
  unwatch: (() => void) | null
}

export interface PackedSource<M extends AnyMark> extends Source<M> {
  readonly items: KeyMap<unknown>
}

interface LiveState<M extends AnyMark> extends Source<M> {
  readonly live: LiveSource<unknown>
  readonly items: NativeKeyMap<unknown>
}

export interface SourcePlan<M extends AnyMark> {
  readonly marks: readonly M[]
  readonly next: readonly Source<M>[]
}

function isPacked<M extends AnyMark>(source: Source<M>): source is PackedSource<M> {
  return source.items instanceof KeyMap
}

function isLive<M extends AnyMark>(source: Source<M>): source is LiveState<M> {
  return source.live !== null
}

function holds(items: KeyedItems<unknown>, key: Key, datum: unknown): boolean {
  const known = items.get(key)
  return known === datum && (known !== undefined || items.has(key))
}

function createSource<
  M extends AnyMark,
  L extends LiveSource<unknown> | null,
  I extends KeyMap<unknown> | NativeKeyMap<unknown>,
>(slot: number, mark: M, live: L, items: I): Source<M> & { readonly live: L; readonly items: I } {
  return {
    slot,
    mark,
    live,
    items,
    queue: [],
    subscription: null,
    retired: false,
    previous: null,
    issues: [],
    rejected: null,
    readiness: 'ready',
    unwatch: null,
  }
}

function release<M extends AnyMark>(source: Source<M>): void {
  source.retired = true
  source.unwatch?.()
  source.unwatch = null
  source.subscription?.unsubscribe()
  source.subscription = null
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
  readonly #duplicates: Map<Key, AnyIssue> = new Map()
  readonly #notify: () => void
  #sources: Source<M>[] = []
  #settled: M[] = []
  #restyled: Set<number> | null = null
  #draining = false
  #issueVersion = 0
  #readinessVersion = 0

  constructor(kind: ElementKind, notify: () => void) {
    this.#kind = kind
    this.#notify = notify
  }

  get issueVersion(): number {
    return this.#issueVersion
  }

  get readinessVersion(): number {
    return this.#readinessVersion
  }

  get loadingCount(): number {
    let count = 0
    for (const source of this.#sources) if (source.readiness === 'loading') count++
    return count
  }

  collectFailed(into: LiveSource<unknown>[]): void {
    for (const source of this.#sources) {
      if (source.readiness === 'error' && source.live) into.push(source.live)
    }
  }

  collectIssues(into: AnyIssue[]): void {
    for (const source of this.#sources) {
      for (const issue of source.issues) into.push(issue)
      if (source.rejected) for (const issue of source.rejected.values()) into.push(issue)
    }
    for (const issue of this.#duplicates.values()) into.push(issue)
  }

  prepare(marks: readonly M[]): SourcePlan<M> {
    const next: Source<M>[] = []
    try {
      marks.forEach((mark, slot) => {
        next.push(this.#prepare(slot, mark, this.#sources[slot]))
      })
    } catch (error) {
      this.abandon({ marks, next })
      throw error
    }
    return { marks, next }
  }

  abandon(plan: SourcePlan<M>): void {
    plan.next.forEach((source, slot) => {
      if (source !== this.#sources[slot]) release(source)
    })
  }

  commit(plan: SourcePlan<M>): void {
    const previous = this.#sources
    const { marks, next } = plan
    const replaced: Source<M>[] = []
    this.#sources = [...next]
    const unready = (source: Source<M>) => source.readiness !== 'ready'
    const added = next.filter((source) => !previous.includes(source))
    const gone = previous.filter((source) => !next.includes(source))
    if (added.some(unready) || gone.some(unready)) this.#readinessVersion++
    next.forEach((source, slot) => {
      const old = previous[slot]
      if (source === old) {
        old.mark = marks[slot] as M
        return
      }
      if (old) replaced.push(old)
      if (isLive(source)) {
        if (!old) return
        source.previous = old.previous ?? (this.#fresh.includes(old) ? noItems : old.items)
        this.#notify()
        this.#retire(old, false)
        return
      }
      if (!old || old.live || this.#fresh.includes(old)) {
        if (old) this.#retire(old)
        this.#fresh.push(source)
        return
      }
      old.retired = true
      old.items.forEach((_, key) => {
        if (!source.items.has(key)) this.#markDirty(key)
      })
      source.items.forEach((datum, key) => {
        if (!holds(old.items, key, datum)) this.#markDirty(key)
      })
    })
    for (const old of previous.slice(next.length)) {
      replaced.push(old)
      this.#retire(old)
    }
    for (const old of replaced) {
      if (old.issues.length > 0 || (old.rejected?.size ?? 0) > 0) this.#issueVersion++
    }
    this.#restyled = this.#restyledSlots()
  }

  get pending(): boolean {
    return this.#dirty.size > 0 || this.#fresh.length > 0 || this.#restyled !== null
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
    this.#restyled = null
    this.#draining = false
    this.#settled = this.#sources.map((source) => source.mark)
  }

  markAt(slot: number): M {
    const mark = this.#sources[slot]?.mark ?? this.#settled[slot]
    if (!mark) throw new Error(`graph: no ${this.#kind} mark at position ${slot}`)
    return mark
  }

  drain(): void {
    this.#draining = true
    const restyled = this.#restyled
    for (const source of this.#sources) {
      if (isLive(source)) this.#apply(source)
      const previous = source.previous
      if (previous) {
        previous.forEach((_, key) => {
          if (!source.items.has(key)) this.#markDirty(key)
        })
        source.previous = null
      }
      if (restyled?.has(source.slot)) {
        source.items.forEach((_, key) => {
          this.#markDirty(key, true)
        })
      }
    }
  }

  owner(key: Key): Owner<M> | undefined {
    let owner: Owner<M> | undefined
    for (const source of this.#sources) {
      const datum = source.items.get(key)
      if (datum === undefined && !source.items.has(key)) continue
      if (owner) {
        if (!this.#duplicates.has(key)) {
          this.#duplicates.set(key, { type: 'duplicate-key', kind: this.#kind, key })
          this.#issueVersion++
        }
        return owner
      }
      owner = { source, datum }
    }
    if (this.#duplicates.size > 0 && this.#duplicates.delete(key)) this.#issueVersion++
    return owner
  }

  destroy(): void {
    for (const source of this.#sources) release(source)
    this.#sources = []
    this.#duplicates.clear()
    this.#issueVersion++
    this.#readinessVersion++
    this.clearDirty()
  }

  #prepare(slot: number, mark: M, old: Source<M> | undefined): Source<M> {
    if (old && (old.mark === mark || (old.live !== null && old.live === mark.data))) return old
    const data = mark.data
    if (!isLiveSource(data)) {
      const source = createSource(slot, mark, null, new KeyMap<unknown>())
      this.#collect(source, data)
      return source
    }
    const source: LiveState<M> = createSource(slot, mark, data, new NativeKeyMap<unknown>())
    try {
      source.subscription = data.subscribeChanges(
        (changes) => {
          this.#receive(source, changes)
        },
        { includeInitialState: true },
      )
      source.unwatch = watchReadiness(data, source.subscription, () => {
        this.#recheck(source)
      })
      source.readiness = sourceReadiness(data, source.subscription)
    } catch (error) {
      release(source)
      throw error
    }
    return source
  }

  #recheck(source: LiveState<M>): void {
    if (source.retired) return
    const readiness = sourceReadiness(source.live, source.subscription)
    if (readiness === source.readiness) return
    source.readiness = readiness
    if (this.#sources[source.slot] !== source) return
    this.#readinessVersion++
    this.#notify()
  }

  #receive(source: LiveState<M>, changes: ReadonlyArray<SourceChange<unknown>>): void {
    if (source.retired || changes.length === 0) return
    const queue = source.queue
    const queued = queue.length
    let rejected = false
    for (const change of changes) {
      if (isKey(change.key)) queue.push(change)
      else if (this.#reject(source, change)) rejected = true
    }
    if (queue.length === queued && !rejected) return
    if (
      !this.#draining &&
      this.#sources[source.slot] === source &&
      queue.length > Math.max(queueFloor, source.items.size)
    ) {
      this.#apply(source)
    }
    this.#notify()
  }

  #reject(source: LiveState<M>, change: SourceChange<unknown>): boolean {
    const rejected = source.rejected ?? new Map<unknown, MissingKeyIssue>()
    source.rejected = rejected
    if (change.type === 'delete') {
      if (!rejected.delete(change.key)) return false
    } else {
      if (rejected.get(change.key)?.datum === change.value) return false
      rejected.set(change.key, { type: 'missing-key', kind: this.#kind, datum: change.value })
    }
    this.#issueVersion++
    return true
  }

  #apply(source: LiveState<M>): void {
    const { queue, items, previous } = source
    for (const change of queue) {
      const key = change.key
      if (change.type === 'delete') {
        items.delete(key)
        this.#markDirty(key)
        continue
      }
      items.set(key, change.value)
      if (!previous || !holds(previous, key, change.value)) this.#markDirty(key)
    }
    queue.length = 0
  }

  #restyledSlots(): Set<number> | null {
    let restyled: Set<number> | null = null
    this.#sources.forEach((source, slot) => {
      const settled = this.#settled[slot]
      if (settled === undefined || settled === source.mark) return
      if (sameOptions(settled.options, source.mark.options, comparedApart)) return
      restyled ??= new Set()
      restyled.add(slot)
    })
    return restyled
  }

  #collect(source: PackedSource<M>, data: Iterable<unknown>): void {
    const items = source.items
    const keyOf = toAccessor<unknown, unknown>(source.mark.options.key ?? 'id')
    if (Array.isArray(data)) {
      items.reserve(data.length)
      if (this.#collectUnique(source, data, keyOf)) {
        if (source.issues.length > 0) this.#issueVersion++
        return
      }
    }
    const issues = source.issues
    let repeated: Set<Key> | null = null
    for (const datum of data) {
      const key = keyOf(datum)
      if (!isKey(key)) {
        issues.push({ type: 'missing-key', kind: this.#kind, datum })
        continue
      }
      if (items.has(key)) {
        repeated ??= new Set()
        if (!repeated.has(key)) {
          repeated.add(key)
          issues.push({ type: 'duplicate-key', kind: this.#kind, key })
        }
        continue
      }
      items.set(key, datum)
    }
    if (issues.length > 0) this.#issueVersion++
  }

  #collectUnique(
    source: PackedSource<M>,
    data: readonly unknown[],
    keyOf: (datum: unknown) => unknown,
  ): boolean {
    const items = source.items
    for (const datum of data) {
      const key = keyOf(datum)
      if (!isKey(key)) {
        source.issues.push({ type: 'missing-key', kind: this.#kind, datum })
        continue
      }
      if (!items.set(key, datum)) {
        items.clear()
        source.issues.length = 0
        return false
      }
    }
    return true
  }

  #retire(source: Source<M>, forget = true): void {
    const fresh = this.#fresh.indexOf(source)
    if (fresh >= 0) this.#fresh.splice(fresh, 1)
    release(source)
    if (fresh >= 0 || !forget) return
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
