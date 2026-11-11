import type { EdgeMark, Key, Mark, SupportWalk, SupportWalkOptions } from '../types'
import { isKey, toAccessor } from './accessor'
import type { GraphChanges, GraphModel } from './graph-model'
import type { AnyIssue } from './issues'

type Read = (datum: unknown) => unknown

export const noWalk: SupportWalk = Object.freeze({
  edges: Object.freeze([]),
  depths: Object.freeze([]),
  nodes: Object.freeze([]),
})

function carriersOf(value: unknown): readonly Key[] | null {
  if (isKey(value)) return [value]
  return Array.isArray(value) && value.length > 0 ? (value as readonly Key[]) : null
}

function limitOf(options: SupportWalkOptions): number {
  const limit = options.maxDepth ?? Number.POSITIVE_INFINITY
  if (!(limit >= 0)) throw new RangeError('graph: maxDepth must be a number, 0 or more')
  return limit
}

export class SupportIndex {
  readonly #model: GraphModel
  readonly #readers = new WeakMap<EdgeMark<unknown>, Read | null>()
  readonly #down = new Map<Key, readonly Key[]>()
  readonly #missing = new Map<Key, Set<Key>>()
  #up: Map<Key, Key[]> | null = null
  #active = false
  #issueVersion = 0
  version = 0

  constructor(model: GraphModel) {
    this.#model = model
  }

  get active(): boolean {
    return this.#active
  }

  get issueVersion(): number {
    return this.#issueVersion
  }

  collectIssues(into: AnyIssue[]): void {
    for (const [carrier, keys] of this.#missing) {
      for (const key of keys) into.push({ type: 'missing-carrier', kind: 'edges', key, carrier })
    }
  }

  setMarks(marks: readonly Mark[]): void {
    if (this.#active) return
    this.#active = marks.some(
      (mark) =>
        mark.type === 'edges' && (mark as EdgeMark<unknown>).options.supportedBy !== undefined,
    )
  }

  apply(changes: GraphChanges): boolean {
    if (!this.#active) return false
    const model = this.#model
    let changed = false
    const removed = changes.edges.removed
    const up = removed.length > 0 && this.#down.size > 0 ? this.#upward() : this.#up
    for (const { key } of removed) {
      if (model.edge(key)) continue
      if (this.#unlink(key)) changed = true
      const dependents = up?.get(key)
      if (!dependents || dependents.length === 0) continue
      changed = true
      for (const dependent of dependents) if (model.edge(dependent)) this.#miss(key, dependent)
    }
    if (this.#missing.size > 0) {
      for (const { key } of changes.edges.added) {
        if (this.#missing.delete(key)) this.#issueVersion++
      }
    }
    const linked = this.#down.size > 0
    let lastMark: EdgeMark<unknown> | null = null
    let read: Read | null = null
    for (const refs of [changes.edges.added, changes.edges.updated]) {
      for (const { key, index } of refs) {
        const record = model.edgeAt(index)
        if (!record || record.key !== key) continue
        if (record.mark !== lastMark) {
          lastMark = record.mark
          read = this.#reader(lastMark)
        }
        if (!read && (!linked || !this.#down.has(key))) continue
        const carriers = read ? carriersOf(read(record.datum)) : null
        const before = linked ? (this.#down.get(key) ?? null) : null
        if (carriers === before) continue
        changed = true
        if (before) this.#unlink(key)
        if (!carriers) continue
        this.#down.set(key, carriers)
        if (this.#up) this.#link(this.#up, key, carriers)
        for (const carrier of carriers) {
          if (isKey(carrier) && !model.edge(carrier)) this.#miss(carrier, key)
        }
      }
    }
    if (changed) this.version++
    return changed
  }

  carriers(key: Key, options: SupportWalkOptions = {}): SupportWalk {
    return this.#walk(key, limitOf(options), this.#down)
  }

  carried(key: Key, options: SupportWalkOptions = {}): SupportWalk {
    const limit = limitOf(options)
    return this.#active ? this.#walk(key, limit, this.#upward()) : noWalk
  }

  clear(): void {
    this.#down.clear()
    this.#up = null
    if (this.#missing.size === 0) return
    this.#missing.clear()
    this.#issueVersion++
  }

  #miss(carrier: Key, key: Key): void {
    let keys = this.#missing.get(carrier)
    if (!keys) {
      keys = new Set()
      this.#missing.set(carrier, keys)
    }
    if (keys.has(key)) return
    keys.add(key)
    this.#issueVersion++
  }

  #upward(): Map<Key, Key[]> {
    if (this.#up) return this.#up
    const up = new Map<Key, Key[]>()
    for (const [key, carriers] of this.#down) this.#link(up, key, carriers)
    this.#up = up
    return up
  }

  #link(up: Map<Key, Key[]>, key: Key, carriers: readonly Key[]): void {
    for (const carrier of carriers) {
      if (!isKey(carrier)) continue
      const dependents = up.get(carrier)
      if (dependents) dependents.push(key)
      else up.set(carrier, [key])
    }
  }

  #reader(mark: EdgeMark<unknown>): Read | null {
    let read = this.#readers.get(mark)
    if (read === undefined) {
      const channel = mark.options.supportedBy
      read = channel === undefined ? null : toAccessor<unknown, unknown>(channel)
      this.#readers.set(mark, read)
    }
    return read
  }

  #unlink(key: Key): boolean {
    const carriers = this.#down.get(key)
    if (!carriers) return false
    this.#down.delete(key)
    if (this.#missing.size > 0) {
      for (const carrier of carriers) {
        const keys = isKey(carrier) ? this.#missing.get(carrier) : undefined
        if (!keys?.delete(key)) continue
        this.#issueVersion++
        if (keys.size === 0) this.#missing.delete(carrier)
      }
    }
    const up = this.#up
    if (!up) return true
    for (const carrier of carriers) {
      const dependents = isKey(carrier) ? up.get(carrier) : undefined
      if (!dependents) continue
      const at = dependents.lastIndexOf(key)
      if (at < 0) continue
      dependents.splice(at, 1)
      if (dependents.length === 0) up.delete(carrier)
    }
    return true
  }

  #walk(start: Key, limit: number, links: ReadonlyMap<Key, readonly Key[]>): SupportWalk {
    const model = this.#model
    if (!this.#active || limit < 1 || !model.edge(start)) return noWalk
    const seen = new Set<Key>([start])
    const edges: Key[] = []
    const depths: number[] = []
    let level: Key[] = [start]
    for (let depth = 1; depth <= limit && level.length > 0; depth++) {
      const next: Key[] = []
      for (const edge of level) {
        for (const linked of links.get(edge) ?? []) {
          if (!isKey(linked) || seen.has(linked) || !model.edge(linked)) continue
          seen.add(linked)
          edges.push(linked)
          depths.push(depth)
          next.push(linked)
        }
      }
      level = next
    }
    if (edges.length === 0) return noWalk
    const nodes: Key[] = []
    const ends = new Set<Key>()
    for (const edge of edges) {
      const record = model.edge(edge)
      if (!record) continue
      for (const end of [record.source, record.target]) {
        if (ends.has(end)) continue
        ends.add(end)
        nodes.push(end)
      }
    }
    return { edges, depths, nodes }
  }
}
