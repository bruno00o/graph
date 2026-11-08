import {
  type DefaultError,
  type QueryClient,
  type QueryKey,
  QueryObserver,
  type QueryObserverOptions,
} from '@tanstack/query-core'
import { createStore, type ReadonlyStore } from '@tanstack/store'
import { toAccessor } from '../core/accessor'
import { readonlyOf } from '../host/readonly-store'
import type { Key, KeyChannel, LiveSource, SourceChange, SourceSubscription } from '../types'

/** Data of a neighborhood query: the nodes and edges around the expanded node. */
export interface ExplorationData<TNode, TEdge> {
  /** Nodes of the neighborhood. */
  readonly nodes: readonly TNode[]
  /** Edges of the neighborhood. */
  readonly edges: readonly TEdge[]
}

/** Options of `createExploration`. */
export interface ExplorationOptions<
  TNode,
  TEdge,
  TQueryFnData = ExplorationData<TNode, TEdge>,
  TError = DefaultError,
  TQueryKey extends QueryKey = QueryKey,
> {
  /** Nodes expanded at once and never removed. */
  readonly roots: Iterable<Key>
  /**
   * Query options for the neighborhood of a node, whose data, or `select` result, is
   * `{ nodes, edges }`.
   */
  readonly neighbors: (
    key: Key,
  ) => QueryObserverOptions<
    TQueryFnData,
    TError,
    ExplorationData<TNode, TEdge>,
    TQueryFnData,
    TQueryKey
  >
  /**
   * Key of a node: a field name or a function. Required when the nodes have no `id` field.
   * @default 'id'
   */
  readonly nodeKey?: KeyChannel<TNode> | undefined
  /**
   * Key of an edge: a field name or a function. Required when the edges have no `id` field.
   * @default 'id'
   */
  readonly edgeKey?: KeyChannel<TEdge> | undefined
}

/** What the store of an exploration holds. */
export interface ExplorationState {
  /** Keys of the expanded nodes. */
  readonly expanded: readonly Key[]
  /** Keys whose query is fetching. */
  readonly loading: readonly Key[]
  /** Error of each failed query, by key. A key given to `retry` leaves it until it fails again. */
  readonly errors: ReadonlyMap<Key, unknown>
}

/**
 * Neighborhoods loaded on demand, exposed as two live sources. Queries only run while a source has
 * a subscriber.
 */
export interface Exploration<TNode, TEdge> {
  /** Live source of the loaded nodes, to pass to `nodes()`. */
  readonly nodes: LiveSource<TNode>
  /** Live source of the loaded edges, to pass to `edges()`. */
  readonly edges: LiveSource<TEdge>
  /** Read-only TanStack Store of the expanded keys, the keys being fetched and the errors. */
  readonly store: ReadonlyStore<ExplorationState>
  /** Starts a query observer for the neighborhood of a node, and adds its result. */
  expand(key: Key): void
  /** Stops the query of a node and removes what no other expansion holds. Roots stay. */
  collapse(key: Key): void
  /** Expands or collapses a node. */
  toggle(key: Key): void
  /**
   * Fetches again the neighborhood of a node whose query failed, and clears its error meanwhile.
   * Does nothing for a key that is not expanded or whose query has not failed.
   */
  retry(key: Key): void
  /** Collapses every expansion but the roots, then expands the roots again. */
  reset(): void
  /** Stops every query observer for good. */
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

/**
 * Loads the neighborhood of a node with a TanStack Query when it is expanded, and exposes what is
 * loaded as live sources, keyed by `nodeKey` and `edgeKey`. Creating it fetches nothing until a
 * mark subscribes. Give `neighbors` before the keys, so that their functions read typed items.
 */
export function createExploration<
  TNode,
  TEdge,
  TQueryFnData = ExplorationData<TNode, TEdge>,
  TError = DefaultError,
  TQueryKey extends QueryKey = QueryKey,
>(
  client: QueryClient,
  options: ExplorationOptions<TNode, TEdge, TQueryFnData, TError, TQueryKey> & {
    readonly nodeKey: KeyChannel<NoInfer<TNode>>
    readonly edgeKey: KeyChannel<NoInfer<TEdge>>
  },
): Exploration<TNode, TEdge>
/**
 * Loads neighborhoods on demand as live sources, with nodes keyed by `nodeKey` and edges by their
 * `id` field.
 */
export function createExploration<
  TNode,
  TEdge extends { readonly id: Key },
  TQueryFnData = ExplorationData<TNode, TEdge>,
  TError = DefaultError,
  TQueryKey extends QueryKey = QueryKey,
>(
  client: QueryClient,
  options: ExplorationOptions<TNode, TEdge, TQueryFnData, TError, TQueryKey> & {
    readonly nodeKey: KeyChannel<NoInfer<TNode>>
  },
): Exploration<TNode, TEdge>
/**
 * Loads neighborhoods on demand as live sources, with nodes keyed by their `id` field and edges
 * by `edgeKey`.
 */
export function createExploration<
  TNode extends { readonly id: Key },
  TEdge,
  TQueryFnData = ExplorationData<TNode, TEdge>,
  TError = DefaultError,
  TQueryKey extends QueryKey = QueryKey,
>(
  client: QueryClient,
  options: ExplorationOptions<TNode, TEdge, TQueryFnData, TError, TQueryKey> & {
    readonly edgeKey: KeyChannel<NoInfer<TEdge>>
  },
): Exploration<TNode, TEdge>
/** Loads neighborhoods on demand as live sources, keyed by the `id` field of their items. */
export function createExploration<
  TNode extends { readonly id: Key },
  TEdge extends { readonly id: Key },
  TQueryFnData = ExplorationData<TNode, TEdge>,
  TError = DefaultError,
  TQueryKey extends QueryKey = QueryKey,
>(
  client: QueryClient,
  options: ExplorationOptions<TNode, TEdge, TQueryFnData, TError, TQueryKey>,
): Exploration<TNode, TEdge>
export function createExploration<TNode, TEdge, TQueryFnData, TError, TQueryKey extends QueryKey>(
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
  const nodeKey = toAccessor<TNode, Key>(options.nodeKey ?? 'id')
  const edgeKey = toAccessor<TEdge, Key>(options.edgeKey ?? 'id')
  const roots = new Set(options.roots)
  const expansions = new Map<Key, Expansion>()
  const retried = new Map<Key, boolean>()
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
  const readonlyStore: ReadonlyStore<ExplorationState> = readonlyOf(store)

  function publish(): void {
    const loading: Key[] = []
    const errors = new Map<Key, unknown>()
    for (const [key, expansion] of expansions) {
      const result = expansion.observer.getCurrentResult()
      if (result.isFetching) loading.push(key)
      if (result.error && !retried.has(key)) errors.set(key, result.error)
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

  function track(key: Key, fetching: boolean): void {
    const fetched = retried.get(key)
    if (fetched === undefined) return
    if (fetching) retried.set(key, true)
    else if (fetched) retried.delete(key)
  }

  function start(key: Key): void {
    const expansion = expansions.get(key)
    if (!expansion || expansion.stop || destroyed) return
    const { observer } = expansion
    expansion.stop = observer.subscribe((result) => {
      track(key, result.isFetching)
      apply(key, result.data)
      publish()
    })
    if (retried.get(key) === false && !observer.getCurrentResult().isFetching) {
      void observer.refetch()
    }
    const result = observer.getCurrentResult()
    track(key, result.isFetching)
    apply(key, result.data)
    publish()
  }

  function retry(key: Key): void {
    const expansion = expansions.get(key)
    if (!expansion || destroyed || retried.has(key)) return
    const { observer } = expansion
    if (!observer.getCurrentResult().error) return
    retried.set(key, false)
    if (expansion.stop) {
      void observer.refetch()
      track(key, observer.getCurrentResult().isFetching)
    }
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
    retried.delete(key)
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
    retry,
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
