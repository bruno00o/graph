import type { ElementRef, GraphChanges, GraphModel } from '../core/graph-model'
import type { StateBuffers, StateKind } from '../core/state-buffers'
import { builtInStates } from '../core/state-names'
import type { Key } from '../types'
import type { ElementKeys, ElementKeysInput } from './events'

interface Members {
  readonly nodes: Set<Key>
  readonly edges: Set<Key>
}

export interface RegistryChanges {
  readonly selection: boolean
  readonly hovered: boolean
  readonly focused: boolean
}

const highlightBits = 0b111
const highlightStates: readonly string[] = ['selected', 'hovered', 'focused']
const kinds: readonly StateKind[] = ['nodes', 'edges']

function members(): Members {
  return { nodes: new Set(), edges: new Set() }
}

export class StateRegistry {
  readonly #model: GraphModel
  readonly #buffers: StateBuffers
  readonly #members = new Map<string, Members>()
  #names: readonly string[] = builtInStates
  #highlightDirty = true

  constructor(model: GraphModel, buffers: StateBuffers) {
    this.#model = model
    this.#buffers = buffers
    for (const name of builtInStates) this.#members.set(name, members())
  }

  get names(): readonly string[] {
    return this.#names
  }

  define(free: readonly string[]): boolean {
    const names = [...builtInStates, ...free]
    if (names.length === this.#names.length && names.every((name, i) => name === this.#names[i])) {
      return false
    }
    for (const name of this.#members.keys()) {
      if (!names.includes(name)) this.#members.delete(name)
    }
    for (const name of names) if (!this.#members.has(name)) this.#members.set(name, members())
    this.#names = names
    this.#rebuild()
    return true
  }

  bit(name: string): number {
    return this.#names.indexOf(name)
  }

  members(name: string): ElementKeys {
    const entry = this.#entry(name)
    return { nodes: [...entry.nodes], edges: [...entry.edges] }
  }

  has(name: string, kind: StateKind, key: Key): boolean {
    return this.#members.get(name)?.[kind].has(key) ?? false
  }

  set(name: string, input: ElementKeysInput): boolean {
    const entry = this.#entry(name)
    let changed = false
    for (const kind of kinds) {
      const next = new Set(input[kind] ?? [])
      for (const key of [...entry[kind]]) {
        if (!next.has(key)) changed = this.#toggle(name, kind, key, false) || changed
      }
      for (const key of next) changed = this.#toggle(name, kind, key, true) || changed
    }
    return changed
  }

  add(name: string, input: ElementKeysInput): boolean {
    this.#entry(name)
    let changed = false
    for (const kind of kinds) {
      for (const key of input[kind] ?? []) changed = this.#toggle(name, kind, key, true) || changed
    }
    return changed
  }

  remove(name: string, input: ElementKeysInput): boolean {
    this.#entry(name)
    let changed = false
    for (const kind of kinds) {
      for (const key of input[kind] ?? []) changed = this.#toggle(name, kind, key, false) || changed
    }
    return changed
  }

  clear(name: string): boolean {
    return this.set(name, {})
  }

  apply(changes: GraphChanges): RegistryChanges {
    let selection = false
    let hovered = false
    let focused = false
    const forget = (kind: StateKind, removed: readonly ElementRef[]) => {
      for (const { key, index } of removed) {
        this.#setMask(kind, index, 0)
        for (const name of builtInStates) {
          if (!this.#members.get(name)?.[kind].delete(key)) continue
          if (name === 'selected') selection = true
          if (name === 'hovered') hovered = true
          if (name === 'focused') focused = true
        }
      }
    }
    const learn = (kind: StateKind, added: readonly ElementRef[]) => {
      for (const { key, index } of added) this.#setMask(kind, index, this.#maskOf(kind, key))
    }
    forget('nodes', changes.nodes.removed)
    forget('edges', changes.edges.removed)
    learn('nodes', changes.nodes.added)
    learn('edges', changes.edges.added)
    return { selection, hovered, focused }
  }

  takeHighlighted(): void {
    if (!this.#highlightDirty) return
    this.#highlightDirty = false
    const indices = (kind: StateKind) => {
      const found = new Set<number>()
      for (const name of highlightStates) {
        for (const key of this.#members.get(name)?.[kind] ?? []) {
          const index = this.#index(kind, key)
          if (index >= 0) found.add(index)
        }
      }
      return [...found]
    }
    this.#buffers.setHighlighted(indices('nodes'), indices('edges'))
  }

  #entry(name: string): Members {
    const entry = this.#members.get(name)
    if (!entry) throw new Error(`graph: unknown state "${name}"`)
    return entry
  }

  #toggle(name: string, kind: StateKind, key: Key, on: boolean): boolean {
    const set = this.#entry(name)[kind]
    if (set.has(key) === on) return false
    if (on) set.add(key)
    else set.delete(key)
    const index = this.#index(kind, key)
    if (index >= 0) this.#setMask(kind, index, this.#maskOf(kind, key))
    return true
  }

  #index(kind: StateKind, key: Key): number {
    const record = kind === 'nodes' ? this.#model.node(key) : this.#model.edge(key)
    return record?.index ?? -1
  }

  #maskOf(kind: StateKind, key: Key): number {
    let mask = 0
    this.#names.forEach((name, bit) => {
      if (this.#members.get(name)?.[kind].has(key)) mask |= 1 << bit
    })
    return mask >>> 0
  }

  #setMask(kind: StateKind, index: number, mask: number): void {
    const current = kind === 'nodes' ? this.#buffers.nodeMask : this.#buffers.edgeMask
    if ((((current[index] ?? 0) ^ mask) & highlightBits) !== 0) this.#highlightDirty = true
    if (kind === 'nodes') this.#buffers.setNode(index, mask)
    else this.#buffers.setEdge(index, mask)
  }

  #rebuild(): void {
    for (const kind of kinds) {
      const records = kind === 'nodes' ? this.#model.nodes() : this.#model.edges()
      for (const record of records)
        this.#setMask(kind, record.index, this.#maskOf(kind, record.key))
    }
  }
}
