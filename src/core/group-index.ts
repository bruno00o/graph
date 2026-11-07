import type { Key, LiveSource, NodeGroup, SourceChange, SourceSubscription } from '../types'
import { isKey } from './accessor'
import type { Read } from './compile-mark'

const mark = '\uE000'

function tagged(value: Key): string {
  return typeof value === 'number' ? `n${value}` : `s${value}`
}

export function groupKey(name: string, value: Key, parent: Key | undefined): string {
  const own = `${mark}${name}${mark}${tagged(value)}`
  return parent === undefined ? own : `${own}${mark}${tagged(parent)}`
}

interface GroupEntry<T> {
  readonly key: string
  readonly value: Key
  readonly parent: Key | undefined
  readonly members: Map<Key, T>
  item: NodeGroup<T> | null
}

export interface GroupSpec {
  readonly name: string
  readonly by: Read
  readonly key: Read
  readonly parent: Read | null
  readonly min: number
}

export class GroupIndex<T> {
  readonly #spec: GroupSpec
  readonly #memberOf = new Map<Key, GroupEntry<T>>()
  readonly #groups = new Map<string, GroupEntry<T>>()
  readonly #moved = new Set<Key>()
  readonly #touched = new Set<GroupEntry<T>>()

  constructor(spec: GroupSpec) {
    this.#spec = spec
  }

  get min(): number {
    return this.#spec.min
  }

  groupOf(key: Key): string | undefined {
    const entry = this.#memberOf.get(key)
    return entry && entry.members.size >= this.#spec.min ? entry.key : undefined
  }

  members(): IterableIterator<Key> {
    return this.#memberOf.keys()
  }

  add(datum: T): void {
    const key = this.#spec.key(datum)
    if (isKey(key)) this.set(key, datum)
  }

  set(key: Key, datum: T): void {
    const value = this.#spec.by(datum)
    if (!isKey(value)) {
      this.delete(key)
      return
    }
    const parentValue = this.#spec.parent?.(datum)
    const parent = isKey(parentValue) ? parentValue : undefined
    const target = groupKey(this.#spec.name, value, parent)
    const current = this.#memberOf.get(key)
    if (current?.key === target) {
      current.members.set(key, datum)
      this.#touch(current)
      return
    }
    if (current) this.#leave(key, current)
    let entry = this.#groups.get(target)
    if (!entry) {
      entry = { key: target, value, parent, members: new Map(), item: null }
      this.#groups.set(target, entry)
    }
    entry.members.set(key, datum)
    this.#memberOf.set(key, entry)
    this.#touch(entry)
    const size = entry.members.size
    const min = this.#spec.min
    if (size === min) for (const member of entry.members.keys()) this.#moved.add(member)
    else if (size > min || current) this.#moved.add(key)
  }

  delete(key: Key): void {
    const current = this.#memberOf.get(key)
    if (current) this.#leave(key, current)
  }

  clear(): void {
    this.#memberOf.clear()
    this.#groups.clear()
    this.#moved.clear()
    this.#touched.clear()
  }

  takeMoved(): readonly Key[] {
    if (this.#moved.size === 0) return []
    const moved = [...this.#moved]
    this.#moved.clear()
    return moved
  }

  takeTouched(): readonly string[] {
    const touched: string[] = []
    for (const entry of this.#touched) touched.push(entry.key)
    this.#touched.clear()
    return touched
  }

  item(key: string): NodeGroup<T> | undefined {
    const entry = this.#groups.get(key)
    if (!entry || entry.members.size < this.#spec.min) return undefined
    if (entry.item) return entry.item
    const keys = Object.freeze([...entry.members.keys()])
    const data = Object.freeze([...entry.members.values()])
    entry.item = Object.freeze({
      key: entry.key,
      value: entry.value,
      count: keys.length,
      keys,
      data,
      ...(entry.parent !== undefined ? { parent: entry.parent } : {}),
    })
    return entry.item
  }

  items(): NodeGroup<T>[] {
    const items: NodeGroup<T>[] = []
    for (const key of this.#groups.keys()) {
      const item = this.item(key)
      if (item) items.push(item)
    }
    return items
  }

  #touch(entry: GroupEntry<T>): void {
    entry.item = null
    this.#touched.add(entry)
  }

  #leave(key: Key, entry: GroupEntry<T>): void {
    const before = entry.members.size
    entry.members.delete(key)
    this.#memberOf.delete(key)
    this.#touch(entry)
    const min = this.#spec.min
    if (before >= min) this.#moved.add(key)
    if (before === min) for (const member of entry.members.keys()) this.#moved.add(member)
    if (entry.members.size === 0) this.#groups.delete(entry.key)
  }
}

export interface Grouping {
  readonly index: GroupIndex<unknown>
  readonly folded: boolean
}

const groupings = new WeakMap<object, Grouping>()

export function registerGrouping(owner: object, grouping: Grouping): void {
  groupings.set(owner, grouping)
}

export function groupingOf(owner: object): Grouping | undefined {
  return groupings.get(owner)
}

type Listener<T> = (changes: ReadonlyArray<SourceChange<NodeGroup<T>>>) => void

export class GroupSource<T> implements LiveSource<NodeGroup<T>> {
  readonly index: GroupIndex<T>
  readonly #source: LiveSource<T>
  readonly #listeners = new Set<Listener<T>>()
  readonly #emitted = new Map<string, NodeGroup<T>>()
  #upstream: SourceSubscription | null = null

  constructor(source: LiveSource<T>, spec: GroupSpec) {
    this.#source = source
    this.index = new GroupIndex(spec)
  }

  subscribeChanges(
    callback: Listener<T>,
    options?: { includeInitialState?: boolean },
  ): SourceSubscription {
    if (this.#upstream && options?.includeInitialState && this.#emitted.size > 0) {
      callback([...this.#emitted.entries()].map(([key, value]) => ({ type: 'insert', key, value })))
    }
    this.#listeners.add(callback)
    if (!this.#upstream) {
      this.index.clear()
      this.#emitted.clear()
      this.#upstream = this.#source.subscribeChanges((changes) => this.#apply(changes), {
        includeInitialState: true,
      })
    }
    return {
      unsubscribe: () => {
        this.#listeners.delete(callback)
        if (this.#listeners.size > 0 || !this.#upstream) return
        this.#upstream.unsubscribe()
        this.#upstream = null
      },
    }
  }

  #apply(changes: ReadonlyArray<SourceChange<T>>): void {
    const index = this.index
    for (const change of changes) {
      if (change.type === 'delete') index.delete(change.key)
      else index.set(change.key, change.value)
    }
    const out: SourceChange<NodeGroup<T>>[] = []
    for (const key of index.takeTouched()) {
      const item = index.item(key)
      const before = this.#emitted.get(key)
      if (item) {
        this.#emitted.set(key, item)
        out.push({ type: before ? 'update' : 'insert', key, value: item })
      } else if (before) {
        this.#emitted.delete(key)
        out.push({ type: 'delete', key, value: before })
      }
    }
    if (out.length === 0) return
    for (const listener of this.#listeners) listener(out)
  }
}
