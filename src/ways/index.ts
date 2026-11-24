import { isKey, toAccessor } from '../core/accessor'
import type { Adjacency, GraphModel } from '../core/graph-model'
import { stringCheck } from '../core/key-list'
import { type PathSource, pathSourceOf } from '../core/path-registry'
import type { PathGroups } from '../core/paths'
import { sameOptions } from '../core/same-options'
import type { GraphCore } from '../host/mount-graph'
import type {
  EdgeDatum,
  GraphPath,
  Key,
  KeyList,
  Mark,
  NodeDatum,
  PathFinder,
  PathWeight,
} from '../types'
import { WaysSearch } from './ways'

/** Options of `ways`. `M` is the union of the marks, whose items the functions read. */
export interface WaysOptions<M extends Mark = Mark> {
  /**
   * The exits to reach: a function of the node item and key, or a list of keys. Keys of missing
   * nodes are skipped.
   */
  readonly exits: ((datum: NodeDatum<M>, key: Key) => boolean) | KeyList<Key>
  /**
   * What may fail when counting the ways out: `'node'`, any node or edge may fail, or `'edge'`,
   * an edge or an exit only.
   * @default 'node'
   */
  readonly failure?: 'node' | 'edge' | undefined
  /** Nodes the analysis may enter, the exits included: a function of the item and the key. */
  readonly nodes?: ((datum: NodeDatum<M>, key: Key) => boolean) | undefined
  /** Edges the analysis may cross: a function of the item and the key. */
  readonly edges?: ((datum: EdgeDatum<M>, key: Key) => boolean) | undefined
  /**
   * Analyzes the graph as drawn: nodes and edges hidden by the time window or by their zoom range
   * are left out, a folded group stands for the nodes it hides, the edges inside it are left out,
   * and an end hidden in a folded group is replaced by the group. Otherwise the analysis runs on
   * every node and edge of the data, folded, filtered or not.
   * @default false
   */
  readonly visible?: boolean | undefined
}

/** Options of `pair`. `M` is the union of the marks, whose items the functions read. */
export interface PairOptions<M extends Mark = Mark> extends WaysOptions<M> {
  /**
   * Cost of crossing an edge: a field or a function of its item. The pair is the one with the
   * lowest sum of weights. An edge without a finite weight cannot be crossed, and a negative
   * weight throws a `RangeError`. Without it, every edge costs 1.
   */
  readonly weight?: PathWeight<EdgeDatum<M>> | undefined
}

/** A node with a single way out, found by `ways`. */
export interface OneWay {
  /** Key of the node. */
  readonly key: Key
  /**
   * Key of the node every path from `key` to an exit passes through: an exit, or a node listed
   * in `two`.
   */
  readonly through: Key
}

/** A chain of nodes between two exits, found by `ways`. */
export interface GraphChain {
  /** Keys of the nodes along the chain. */
  readonly nodes: readonly Key[]
  /**
   * Keys of the edges along the chain, the two edges to the exits included: one more than
   * `nodes`.
   */
  readonly edges: readonly Key[]
  /**
   * Keys of the exits the chain ends on: two distinct exits when the chain is covered, the same
   * exit twice when the chain returns to its own exit.
   */
  readonly ends: readonly [Key, Key]
  /** Whether the chain has two ways out: `ends` holds two distinct exits. */
  readonly covered: boolean
}

/**
 * Ways out to exits, found by `ways`: nodes with two ways out to two distinct exits, nodes with
 * a single way out, nodes with none, the chains between exits, and the weak points of the graph.
 */
export interface GraphWays {
  /** Keys of the exits found. */
  readonly exits: readonly Key[]
  /** Keys of the nodes with two ways out to two distinct exits, the exits excluded. */
  readonly two: readonly Key[]
  /** Nodes with a single way out, and the node each one passes through. */
  readonly one: readonly OneWay[]
  /** Keys of the nodes no exit is reachable from, the exits excluded. */
  readonly none: readonly Key[]
  /** Chains of nodes between exits, the covered chains first. */
  readonly chains: readonly GraphChain[]
  /**
   * Articulation nodes and bridges of the graph with the exits joined to a virtual node, the
   * virtual node and its edges excluded.
   */
  readonly weak: {
    /** Keys of the nodes whose loss cuts at least one node off from every exit. */
    readonly nodes: readonly Key[]
    /** Keys of the edges whose loss cuts at least one node off from every exit. */
    readonly edges: readonly Key[]
  }
}

const noWays: GraphWays = Object.freeze({
  exits: Object.freeze([]),
  two: Object.freeze([]),
  one: Object.freeze([]),
  none: Object.freeze([]),
  chains: Object.freeze([]),
  weak: Object.freeze({ nodes: Object.freeze([]), edges: Object.freeze([]) }),
})

const check = stringCheck()
const search = new WaysSearch()
const cache = new WeakMap<object, { stamp: number; options: object; result: GraphWays }>()

function failureOf(failure: 'node' | 'edge' | undefined): 'node' | 'edge' {
  if (failure === undefined || failure === 'node') return 'node'
  if (failure === 'edge') return 'edge'
  throw new TypeError("graph: failure must be 'node' or 'edge'")
}

function nodeFilterOf<M extends Mark>(
  source: PathSource,
  options: WaysOptions<M>,
): ((index: number) => boolean) | null {
  const { model } = source
  const keepNode = options.nodes ?? null
  const shown = options.visible ? source.shown() : null
  if (!keepNode && !shown) return null
  return (index: number): boolean => {
    if (shown && !shown.node(index)) return false
    if (!keepNode) return true
    const record = model.nodeAt(index)
    return record !== undefined && keepNode(record.datum as NodeDatum<M>, record.key)
  }
}

function edgeFilterOf<M extends Mark>(
  adjacency: Adjacency,
  source: PathSource,
  options: WaysOptions<M>,
): ((id: number) => boolean) | null {
  const keepEdge = options.edges ?? null
  const shown = options.visible ? source.shown() : null
  if (!keepEdge && !shown) return null
  return (id: number): boolean => {
    const record = adjacency.edgeAt(id)
    if (!record) return false
    if (shown && !shown.edge(record.index)) return false
    if (!keepEdge) return true
    return keepEdge(record.datum as EdgeDatum<M>, record.key)
  }
}

function weightOf<M extends Mark>(
  adjacency: Adjacency,
  options: PairOptions<M>,
): ((id: number) => number) | null {
  if (options.weight === undefined) return null
  const read = toAccessor<unknown, unknown>(options.weight as PathWeight<unknown>)
  return (id: number): number => {
    const record = adjacency.edgeAt(id)
    if (!record) return Number.NaN
    const value = read(record.datum)
    if (typeof value !== 'number' || !Number.isFinite(value)) return Number.NaN
    if (value < 0) {
      throw new RangeError(`graph: edge "${String(record.key)}" has a negative weight`)
    }
    return value
  }
}

function exitsOf<M extends Mark>(
  adjacency: Adjacency,
  source: PathSource,
  method: string,
  options: WaysOptions<M>,
  groups: PathGroups | null,
  nodeOk: ((index: number) => boolean) | null,
): Uint8Array {
  const { model } = source
  const exit = new Uint8Array(adjacency.nodeEnd.length)
  const given = options.exits
  if (typeof given === 'function') {
    for (const record of model.nodes()) {
      const at = groups ? groups.representative(record.index) : record.index
      if (at < 0) continue
      if (nodeOk && !nodeOk(at)) continue
      if (given(record.datum as NodeDatum<M>, record.key)) exit[at] = 1
    }
  } else {
    check(given, method)
    if (given === null || given === undefined) return exit
    if (typeof (given as Iterable<Key>)[Symbol.iterator] !== 'function') return exit
    for (const key of given as Iterable<Key>) {
      if (!isKey(key)) continue
      const record = model.node(key)
      if (!record) continue
      const at = groups ? groups.representative(record.index) : record.index
      if (at < 0) continue
      if (nodeOk && !nodeOk(at)) continue
      exit[at] = 1
    }
  }
  return exit
}

function nodeKey(model: GraphModel, index: number): Key {
  const record = model.nodeAt(index)
  if (!record) throw new Error('graph: a path reached a missing node')
  return record.key
}

function edgeKeys(adjacency: Adjacency, ids: readonly number[]): Key[] {
  return ids.map((id) => {
    const record = adjacency.edgeAt(id)
    if (!record) throw new Error('graph: a path crossed a missing edge')
    return record.key
  })
}

function frozen<T>(value: T): T {
  Object.freeze(value)
  return value
}

/**
 * Ways out to the exits of a graph or a path finder: nodes with two ways out to two distinct
 * exits, nodes with a single way out and the node each passes through, nodes with none, the
 * chains between exits, and the weak points. The analysis ignores the direction of the edges.
 * The result is frozen, and the same object comes back while the data and the options do not
 * change. On a destroyed graph or finder, the empty frozen result.
 */
export function ways<S extends string, M extends Mark>(
  target: GraphCore<S, M> | PathFinder<M>,
  options: WaysOptions<M>,
): GraphWays {
  const source = pathSourceOf(target)
  if (source === undefined) {
    throw new TypeError('ways: needs a graph made by mountGraph or createGraph, or a path finder')
  }
  if (source.destroyed()) return noWays
  const failure = failureOf(options.failure)
  source.prepare()
  const stamp = source.stamp()
  if (!options.visible) {
    const cached = cache.get(target)
    if (cached !== undefined && cached.stamp === stamp && sameOptions(cached.options, options)) {
      return cached.result
    }
  }
  const { model } = source
  const adjacency = model.adjacency()
  const groups = options.visible ? source.groups() : null
  const nodeOk = nodeFilterOf(source, options)
  const edgeOk = edgeFilterOf(adjacency, source, options)
  const exit = exitsOf(adjacency, source, 'ways({ exits })', options, groups, nodeOk)
  const found = search.analyze(adjacency, { failure, exit, nodeOk, edgeOk, groups })
  const result: GraphWays = frozen({
    exits: frozen(found.exits.map((index) => nodeKey(model, index))),
    two: frozen(found.two.map((index) => nodeKey(model, index))),
    one: frozen(
      found.one.map(
        (index, at): OneWay =>
          frozen({
            key: nodeKey(model, index),
            through: nodeKey(model, found.oneThrough[at] ?? -1),
          }),
      ),
    ),
    none: frozen(found.none.map((index) => nodeKey(model, index))),
    chains: frozen(
      found.chains.map(
        (chain): GraphChain =>
          frozen({
            nodes: frozen(chain.nodes.map((index) => nodeKey(model, index))),
            edges: frozen(edgeKeys(adjacency, chain.edges)),
            ends: frozen([nodeKey(model, chain.ends[0]), nodeKey(model, chain.ends[1])] as [
              Key,
              Key,
            ]),
            covered: chain.covered,
          }),
      ),
    ),
    weak: frozen({
      nodes: frozen(found.weakNodes.map((index) => nodeKey(model, index))),
      edges: frozen(edgeKeys(adjacency, found.weakEdges)),
    }),
  })
  if (!options.visible) cache.set(target, { stamp, options, result })
  return result
}

/**
 * The two cheapest paths from a node to two distinct exits of a graph or a path finder, with no
 * other node in common (`failure: 'node'`) or no edge or exit in common (`failure: 'edge'`), or
 * `null` when there is no such pair, the key is unknown or the graph or finder is destroyed.
 */
export function pair<S extends string, M extends Mark>(
  target: GraphCore<S, M> | PathFinder<M>,
  from: Key,
  options: PairOptions<M>,
): readonly [GraphPath, GraphPath] | null {
  const source = pathSourceOf(target)
  if (source === undefined) {
    throw new TypeError('pair: needs a graph made by mountGraph or createGraph, or a path finder')
  }
  if (source.destroyed()) return null
  const failure = failureOf(options.failure)
  source.prepare()
  const { model } = source
  const start = isKey(from) ? (model.node(from)?.index ?? -1) : -1
  if (start < 0) return null
  const adjacency = model.adjacency()
  const groups = options.visible ? source.groups() : null
  const nodeOk = nodeFilterOf(source, options)
  const blocked = edgeFilterOf(adjacency, source, options)
  const weight = weightOf(adjacency, options)
  const at = groups ? groups.representative(start) : start
  if (at < 0 || (nodeOk && !nodeOk(at))) return null
  const exit = exitsOf(adjacency, source, 'pair({ exits })', options, groups, nodeOk)
  const cost =
    blocked || weight
      ? (id: number): number => {
          if (blocked && !blocked(id)) return Number.NaN
          if (!weight) return 1
          return weight(id)
        }
      : null
  const found = search.pair(adjacency, {
    failure,
    exit,
    nodeOk,
    groups,
    from: at,
    cost,
  })
  if (!found) return null
  const pathOf = (path: (typeof found)[number]): GraphPath => {
    const costs = path.costs.map((value) => value)
    return {
      nodes: path.nodes.map((index) => nodeKey(model, index)),
      edges: edgeKeys(adjacency, path.edges),
      costs,
      cost: costs[costs.length - 1] ?? 0,
    }
  }
  return [pathOf(found[0]), pathOf(found[1])]
}
