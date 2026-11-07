import type { ElementRef, GraphChanges, GraphModel } from '../core/graph-model'
import type { StateBuffers, StateKind } from '../core/state-buffers'
import { builtInStates } from '../core/state-names'
import type { Key } from '../types'
import type { ElementKeys, ElementKeysInput } from './events'

interface Members {
  readonly nodes: Set<Key>
  readonly edges: Set<Key>
}

export interface EdgeDisplay {
  indexOf(key: Key): number
  keysAt(index: number): readonly Key[] | null
}

export interface RegistryChanges {
  readonly selection: boolean
  readonly hovered: boolean
  readonly focused: boolean
}

export type LayerOf = (kind: StateKind, index: number) => number

const kinds: readonly StateKind[] = ['nodes', 'edges']
const scanShare = 16

function members(): Members {
  return { nodes: new Set(), edges: new Set() }
}

export class StateRegistry {
  readonly #model: GraphModel
  readonly #buffers: StateBuffers
  readonly #members = new Map<string, Members>()
  readonly #display: EdgeDisplay | null
  readonly #layerOf: LayerOf | null
  #names: readonly string[] = builtInStates
  #highlightDirty = true
  #raised: readonly [number, number] = [-1, -1]
  #pending: Set<number> | null = null

  constructor(
    model: GraphModel,
    buffers: StateBuffers,
    display: EdgeDisplay | null = null,
    layerOf: LayerOf | null = null,
  ) {
    this.#model = model
    this.#buffers = buffers
    this.#display = display
    this.#layerOf = layerOf
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
    return this.#batch(() => {
      let changed = false
      for (const kind of kinds) {
        const next = new Set(input[kind] ?? [])
        for (const key of [...entry[kind]]) {
          if (!next.has(key)) changed = this.#toggle(name, kind, key, false) || changed
        }
        for (const key of next) changed = this.#toggle(name, kind, key, true) || changed
      }
      return changed
    })
  }

  add(name: string, input: ElementKeysInput): boolean {
    this.#entry(name)
    return this.#batch(() => {
      let changed = false
      for (const kind of kinds) {
        for (const key of input[kind] ?? [])
          changed = this.#toggle(name, kind, key, true) || changed
      }
      return changed
    })
  }

  remove(name: string, input: ElementKeysInput): boolean {
    this.#entry(name)
    return this.#batch(() => {
      let changed = false
      for (const kind of kinds) {
        for (const key of input[kind] ?? [])
          changed = this.#toggle(name, kind, key, false) || changed
      }
      return changed
    })
  }

  refreshEdges(indices: readonly number[]): void {
    if (!this.#display || indices.length === 0) return
    this.#highlightDirty = true
    for (const index of indices) this.#writeEdge(index)
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
      if (!this.#hasMembers(kind)) return
      for (const { key, index } of added) {
        if (kind === 'edges' && this.#display) this.#writeEdge(index)
        else this.#setMask(kind, index, this.#maskOf(kind, key))
      }
    }
    forget('nodes', changes.nodes.removed)
    forget('edges', changes.edges.removed)
    learn('nodes', changes.nodes.added)
    learn('edges', changes.edges.added)
    return { selection, hovered, focused }
  }

  reorder(): void {
    this.#highlightDirty = true
  }

  takeHighlighted(): void {
    const buffers = this.#buffers
    const raised = [buffers.nodeRaise, buffers.edgeRaise] as const
    if (!this.#highlightDirty && raised[0] === this.#raised[0] && raised[1] === this.#raised[1]) {
      return
    }
    this.#highlightDirty = false
    this.#raised = raised
    buffers.setHighlighted(this.#raisedIndices('nodes'), this.#raisedIndices('edges'))
  }

  #raisedIndices(kind: StateKind): number[] {
    const raise = this.#buffers.raised(kind)
    if (raise === 0) return []
    const masks = kind === 'nodes' ? this.#buffers.nodeMask : this.#buffers.edgeMask
    let members = 0
    this.#names.forEach((name, bit) => {
      if ((raise & (1 << bit)) !== 0) members += this.#members.get(name)?.[kind].size ?? 0
    })
    let found: number[]
    if (members * scanShare < masks.length) {
      const seen = new Set<number>()
      this.#names.forEach((name, bit) => {
        if ((raise & (1 << bit)) === 0) return
        for (const key of this.#members.get(name)?.[kind] ?? []) {
          const index = this.#index(kind, key)
          if (index >= 0 && ((masks[index] ?? 0) & raise) !== 0) seen.add(index)
        }
      })
      found = [...seen].sort((a, b) => a - b)
    } else {
      found = []
      for (let index = 0; index < masks.length; index++) {
        if (((masks[index] ?? 0) & raise) !== 0) found.push(index)
      }
    }
    return this.#byLayer(kind, found)
  }

  #byLayer(kind: StateKind, indices: number[]): number[] {
    const layerOf = this.#layerOf
    if (!layerOf || indices.length < 2) return indices
    const layers = indices.map((index) => layerOf(kind, index))
    const first = layers[0]
    if (layers.every((layer) => layer === first)) return indices
    const order = indices.map((_, at) => at)
    order.sort((a, b) => (layers[a] ?? 0) - (layers[b] ?? 0) || a - b)
    return order.map((at) => indices[at] ?? 0)
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
    if (index < 0) return true
    if (kind === 'nodes' || !this.#display) this.#setMask(kind, index, this.#maskOf(kind, key))
    else if (this.#pending) this.#pending.add(index)
    else this.#writeEdge(index)
    return true
  }

  #batch(run: () => boolean): boolean {
    if (!this.#display || this.#pending) return run()
    const pending = new Set<number>()
    this.#pending = pending
    try {
      return run()
    } finally {
      this.#pending = null
      for (const index of pending) this.#writeEdge(index)
    }
  }

  #writeEdge(index: number): void {
    const keys = this.#display?.keysAt(index)
    if (!keys) {
      const key = this.#model.edgeAt(index)?.key
      if (key !== undefined) this.#setMask('edges', index, this.#maskOf('edges', key))
      return
    }
    let mask = 0
    for (const key of keys) mask |= this.#maskOf('edges', key)
    this.#setMask('edges', index, mask >>> 0)
  }

  #index(kind: StateKind, key: Key): number {
    if (kind === 'edges' && this.#display) return this.#display.indexOf(key)
    const record = kind === 'nodes' ? this.#model.node(key) : this.#model.edge(key)
    return record?.index ?? -1
  }

  #hasMembers(kind: StateKind): boolean {
    for (const entry of this.#members.values()) if (entry[kind].size > 0) return true
    return false
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
    if ((((current[index] ?? 0) ^ mask) & this.#buffers.raised(kind)) !== 0) {
      this.#highlightDirty = true
    }
    if (kind === 'nodes') this.#buffers.setNode(index, mask)
    else this.#buffers.setEdge(index, mask)
  }

  #rebuild(): void {
    for (const record of this.#model.nodes())
      this.#setMask('nodes', record.index, this.#maskOf('nodes', record.key))
    for (const record of this.#model.edges()) {
      if (!this.#display) {
        this.#setMask('edges', record.index, this.#maskOf('edges', record.key))
        continue
      }
      const index = this.#display.indexOf(record.key)
      if (index >= 0) this.#writeEdge(index)
    }
  }
}
