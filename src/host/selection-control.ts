import { checkLists, type StringCheck, stringCheck } from '../core/key-list'
import { freeStateNames, isBuiltInState } from '../core/state-names'
import type { SupportIndex } from '../core/support'
import type { GraphDefinition, Key, SupportWalk } from '../types'
import { emptyKeys, kindOf, mergedKeys, requestMemory, sameKeys, toKeys } from './element-keys'
import type { ElementKeys, Emitter, GraphSelectionEvent, GraphTarget } from './events'
import type { GraphSelection, GraphState, GraphStates } from './graph-instance'
import { isolated } from './isolate'
import { PendingRequests } from './requests'
import type { StateRegistry } from './state-registry'

export interface SelectionSource {
  readonly controlled: boolean
  readonly registry: StateRegistry
  readonly support: SupportIndex
  readonly emitter: Emitter
  state(): GraphState
  patch(next: Partial<GraphState>): void
  definition(): GraphDefinition
  request(): void
}

export class SelectionControl {
  readonly #asks = new PendingRequests<ElementKeys>(sameKeys, requestMemory)
  #listener: ((event: GraphSelectionEvent) => void) | undefined
  #lit: readonly string[] = []
  readonly #source: SelectionSource
  readonly check: StringCheck = stringCheck()

  constructor(
    source: SelectionSource,
    listener: ((event: GraphSelectionEvent) => void) | undefined,
  ) {
    this.#source = source
    this.#listener = isolated(listener)
  }

  listen(listener: (event: GraphSelectionEvent) => void): void {
    this.#listener = isolated(listener)
  }

  freeStates(): Record<string, ElementKeys> {
    const registry = this.#source.registry
    return Object.fromEntries(
      freeStateNames(this.#source.definition().states).map((name) => [
        name,
        registry.members(name),
      ]),
    )
  }

  publish(): void {
    const selection = this.#source.registry.members('selected')
    this.#source.patch({ selection })
    this.lightSupport()
    this.#source.emitter.emit('selectionchange', { selection })
    this.#source.request()
  }

  base(): ElementKeys {
    return this.#asks.base(this.#source.registry.members('selected'))
  }

  #ask(next: ElementKeys): void {
    this.#asks.send(next)
    this.#listener?.({ selection: next })
  }

  askCurrent(): void {
    this.#ask(this.#source.registry.members('selected'))
  }

  ask(next: ElementKeys): void {
    if (this.#source.controlled) {
      if (!sameKeys(this.base(), next)) this.#ask(next)
    } else if (this.#source.registry.set('selected', next)) {
      this.publish()
    }
  }

  answer(keys: ElementKeys): void {
    this.#asks.answer(keys)
    if (this.#source.registry.set('selected', keys)) this.publish()
  }

  clear(): void {
    this.ask(emptyKeys(this.#source.registry.shaped))
  }

  select(clicked: GraphTarget | null, modifier: boolean): void {
    const mode = this.#source.definition().interaction.select
    if (mode === false) return
    const additive = mode === 'multiple' && modifier
    const empty = emptyKeys(this.#source.registry.shaped)
    if (!clicked) {
      if (!additive) this.ask(empty)
      return
    }
    const kind = kindOf[clicked.kind]
    if (kind === 'shapes' && !this.#source.registry.shaped) return
    const current = this.base()
    const merged = mergedKeys(clicked)
    if (merged) {
      const chosen = new Set(current.edges)
      const all = merged.every((key) => chosen.has(key))
      const others = additive ? current.edges.filter((key) => !merged.includes(key)) : []
      this.ask({
        ...empty,
        nodes: additive ? current.nodes : [],
        edges: additive && all ? others : [...others, ...merged],
        ...(additive && current.shapes ? { shapes: current.shapes } : {}),
      })
      return
    }
    const listed = current[kind] ?? []
    if (!additive) this.ask({ ...empty, [kind]: [clicked.key] })
    else if (listed.includes(clicked.key))
      this.ask({ ...current, [kind]: listed.filter((key) => key !== clicked.key) })
    else this.ask({ ...current, [kind]: [...listed, clicked.key] })
  }

  publishState(name: string): void {
    const source = this.#source
    source.patch({ states: { ...source.state().states, [name]: source.registry.members(name) } })
    source.request()
  }

  lightSupport(): void {
    const { registry, support } = this.#source
    const lit = this.#source.definition().support
    const names = lit ? [lit.carriers, lit.carried] : [null, null]
    for (const name of this.#lit) {
      if (!names.includes(name) && registry.names.includes(name) && registry.set(name, {})) {
        this.publishState(name)
      }
    }
    this.#lit = names.filter((name): name is string => name !== null)
    if (!lit || !support.active) return
    const selected = registry.members('selected').edges
    const light = (name: string | null, walk: (key: Key) => SupportWalk) => {
      if (name === null) return
      const nodes = new Set<Key>()
      const edges = new Set<Key>()
      for (const key of selected) {
        const found = walk(key)
        for (const edge of found.edges) edges.add(edge)
        for (const node of found.nodes) nodes.add(node)
      }
      if (registry.set(name, { nodes, edges })) this.publishState(name)
    }
    light(lit.carriers, (key) => support.carriers(key))
    light(lit.carried, (key) => support.carried(key))
  }

  #declared(name: string): string {
    if (isBuiltInState(name) || !Object.hasOwn(this.#source.definition().states, name)) {
      throw new Error(`graph: unknown state "${name}"`)
    }
    return name
  }

  selectionApi(): GraphSelection {
    return {
      get: () => this.#source.state().selection,
      set: (keys) => {
        checkLists(this.check, keys, 'selection.set({ $ })')
        this.ask(toKeys(keys, this.#source.registry.shaped))
      },
      clear: () => this.clear(),
    }
  }

  statesApi(): GraphStates {
    const { registry } = this.#source
    return {
      set: (name, keys) => {
        checkLists(this.check, keys, 'states.set(name, { $ })')
        if (registry.set(this.#declared(name), keys)) this.publishState(name)
      },
      add: (name, keys) => {
        checkLists(this.check, keys, 'states.add(name, { $ })')
        if (registry.add(this.#declared(name), keys)) this.publishState(name)
      },
      remove: (name, keys) => {
        checkLists(this.check, keys, 'states.remove(name, { $ })')
        if (registry.remove(this.#declared(name), keys)) this.publishState(name)
      },
      clear: (name) => {
        const names =
          name === undefined
            ? freeStateNames(this.#source.definition().states)
            : [this.#declared(name)]
        for (const each of names) if (registry.clear(each)) this.publishState(each)
      },
      has: (name, element) => registry.has(this.#declared(name), kindOf[element.kind], element.key),
      get: (name) => this.#source.state().states[this.#declared(name)] ?? registry.members(name),
    }
  }
}
