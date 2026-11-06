import {
  type DefaultError,
  type QueryClient,
  type QueryKey,
  QueryObserver,
  type QueryObserverOptions,
} from '@tanstack/query-core'
import { createStore, type ReadonlyStore } from '@tanstack/store'
import type { Key, LiveSource, SourceChange, SourceSubscription } from '../types'

export interface ExplorationData<TNode, TEdge> {
  readonly nodes: readonly TNode[]
  readonly edges: readonly TEdge[]
}

export interface ExplorationOptions<
  TNode,
  TEdge,
  TQueryFnData = ExplorationData<TNode, TEdge>,
  TError = DefaultError,
  TQueryKey extends QueryKey = QueryKey,
> {
  readonly roots: Iterable<Key>
  readonly neighbors: (
    key: Key,
  ) => QueryObserverOptions<
    TQueryFnData,
    TError,
    ExplorationData<TNode, TEdge>,
    TQueryFnData,
    TQueryKey
  >
  readonly nodeKey?: (node: TNode) => Key
  readonly edgeKey?: (edge: TEdge) => Key
}

export interface ExplorationState {
  readonly expanded: readonly Key[]
  readonly loading: readonly Key[]
  readonly errors: ReadonlyMap<Key, unknown>
}

export interface Exploration<TNode, TEdge> {
  readonly nodes: LiveSource<TNode>
  readonly edges: LiveSource<TEdge>
  readonly store: ReadonlyStore<ExplorationState>
  expand(key: Key): void
  collapse(key: Key): void
  toggle(key: Key): void
  reset(): void
  destroy(): void
}

type Listener<T> = (changes: ReadonlyArray<SourceChange<T>>) => void

class ElementSource<T> implements LiveSource<T> {
  readonly values = new Map<Key, T>()
  readonly holders = new Map<Key, Set<Key>>()
  readonly #listeners = new Set<Listener<T>>()
  readonly #onActive: (delta: number) => void

  constructor(onActive: (delta: number) => void) {
    this.#onActive = onActive
  }

  subscribeChanges(
    callback: Listener<T>,
    options?: { includeInitialState?: boolean },
  ): SourceSubscription {
    this.#listeners.add(callback)
    if (options?.includeInitialState && this.values.size > 0) {
      callback([...this.values].map(([key, value]) => ({ type: 'insert', key, value })))
    }
    this.#onActive(1)
    let active = true
    return {
      unsubscribe: () => {
        if (!active) return
        active = false
        this.#listeners.delete(callback)
        this.#onActive(-1)
      },
    }
  }

  hold(owner: Key, items: ReadonlyMap<Key, T>, changes: SourceChange<T>[]): void {
    for (const [key, value] of items) {
      let holders = this.holders.get(key)
      if (!holders) {
        holders = new Set()
        this.holders.set(key, holders)
      }
      holders.add(owner)
      const previous = this.values.get(key)
      if (previous === value) continue
      this.values.set(key, value)
      changes.push({ type: previous === undefined ? 'insert' : 'update', key, value })
    }
  }

  release(owner: Key, keys: Iterable<Key>, pinned: ReadonlySet<Key>, changes: SourceChange<T>[]) {
    for (const key of keys) {
      const holders = this.holders.get(key)
      if (!holders?.delete(owner) || holders.size > 0 || pinned.has(key)) continue
      this.holders.delete(key)
      const value = this.values.get(key)
      this.values.delete(key)
      if (value !== undefined) changes.push({ type: 'delete', key, value })
    }
  }

  emit(changes: ReadonlyArray<SourceChange<T>>): void {
    if (changes.length === 0) return
    for (const listener of [...this.#listeners]) listener(changes)
  }
}

function defaultKey(item: unknown): Key {
  return (item as { readonly id: Key }).id
}

export function createExploration<
  TNode,
  TEdge,
  TQueryFnData = ExplorationData<TNode, TEdge>,
  TError = DefaultError,
  TQueryKey extends QueryKey = QueryKey,
>(
  client: QueryClient,
  options: ExplorationOptions<TNode, TEdge, TQueryFnData, TError, TQueryKey>,
): Exploration<TNode, TEdge> {
  type Observer = QueryObserver<
    TQueryFnData,
    TError,
    ExplorationData<TNode, TEdge>,
    TQueryFnData,
    TQueryKey
  >
  interface Expansion {
    readonly observer: Observer
    stop: (() => void) | null
    nodes: Set<Key>
    edges: Set<Key>
  }
  const nodeKey = options.nodeKey ?? defaultKey
  const edgeKey = options.edgeKey ?? defaultKey
  const roots = new Set(options.roots)
  const expansions = new Map<Key, Expansion>()
  let subscribers = 0
  let destroyed = false

  const onActive = (delta: number) => {
    const before = subscribers
    subscribers += delta
    if (before === 0 && subscribers > 0) for (const key of expansions.keys()) start(key)
    if (before > 0 && subscribers === 0)
      for (const expansion of expansions.values()) halt(expansion)
  }
  const nodes = new ElementSource<TNode>(onActive)
  const edges = new ElementSource<TEdge>(onActive)

  const store = createStore<ExplorationState>({ expanded: [], loading: [], errors: new Map() })
  const readonlyStore: ReadonlyStore<ExplorationState> = createStore(() => store.state)

  function publish(): void {
    const loading: Key[] = []
    const errors = new Map<Key, unknown>()
    for (const [key, expansion] of expansions) {
      const result = expansion.observer.getCurrentResult()
      if (result.isFetching) loading.push(key)
      if (result.error) errors.set(key, result.error)
    }
    store.setState(() => ({ expanded: [...expansions.keys()], loading, errors }))
  }

  function apply(key: Key, data: ExplorationData<TNode, TEdge> | undefined): void {
    const expansion = expansions.get(key)
    if (!expansion || !data) return
    const nodeItems = new Map<Key, TNode>()
    for (const node of data.nodes) nodeItems.set(nodeKey(node), node)
    const edgeItems = new Map<Key, TEdge>()
    for (const edge of data.edges) edgeItems.set(edgeKey(edge), edge)
    const nodeChanges: SourceChange<TNode>[] = []
    const edgeChanges: SourceChange<TEdge>[] = []
    nodes.hold(key, nodeItems, nodeChanges)
    edges.hold(key, edgeItems, edgeChanges)
    nodes.holders.get(key)?.add(key)
    edges.release(
      key,
      [...expansion.edges].filter((edge) => !edgeItems.has(edge)),
      new Set(),
      edgeChanges,
    )
    nodes.release(
      key,
      [...expansion.nodes].filter((node) => node !== key && !nodeItems.has(node)),
      roots,
      nodeChanges,
    )
    expansion.nodes = new Set([...nodeItems.keys(), key])
    expansion.edges = new Set(edgeItems.keys())
    nodes.emit(nodeChanges)
    edges.emit(edgeChanges)
  }

  function start(key: Key): void {
    const expansion = expansions.get(key)
    if (!expansion || expansion.stop || destroyed) return
    const { observer } = expansion
    expansion.stop = observer.subscribe((result) => {
      apply(key, result.data)
      publish()
    })
    apply(key, observer.getCurrentResult().data)
    publish()
  }

  function halt(expansion: Expansion): void {
    expansion.stop?.()
    expansion.stop = null
  }

  function expand(key: Key): void {
    if (destroyed || expansions.has(key)) return
    const observer = new QueryObserver(client, options.neighbors(key))
    expansions.set(key, { observer, stop: null, nodes: new Set([key]), edges: new Set() })
    if (subscribers > 0) start(key)
    else publish()
  }

  function collapse(key: Key): void {
    const expansion = expansions.get(key)
    if (!expansion) return
    halt(expansion)
    expansions.delete(key)
    const nodeChanges: SourceChange<TNode>[] = []
    const edgeChanges: SourceChange<TEdge>[] = []
    edges.release(key, expansion.edges, new Set(), edgeChanges)
    nodes.release(key, expansion.nodes, roots, nodeChanges)
    edges.emit(edgeChanges)
    nodes.emit(nodeChanges)
    publish()
  }

  for (const root of roots) expand(root)

  return {
    nodes,
    edges,
    store: readonlyStore,
    expand,
    collapse,
    toggle: (key) => (expansions.has(key) ? collapse(key) : expand(key)),
    reset() {
      for (const key of [...expansions.keys()]) if (!roots.has(key)) collapse(key)
      for (const root of roots) expand(root)
    },
    destroy() {
      for (const expansion of expansions.values()) halt(expansion)
      destroyed = true
    },
  }
}
