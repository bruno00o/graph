import type { GraphPath, GraphPaths, GraphReach, Key, PathDirection, PathOptions } from '../types'
import { toAccessor } from './accessor'
import type { Adjacency } from './graph-model'
import type { PathSource } from './path-registry'
import { type PathRules, PathSearch } from './paths'

export type { PathShown, PathSource } from './path-registry'

export const noReach: GraphReach = Object.freeze({
  nodes: Object.freeze([]),
  costs: Object.freeze([]),
  edges: Object.freeze([]),
})

function limitOf(maxCost: number | undefined): number {
  const limit = maxCost ?? Number.POSITIVE_INFINITY
  if (!(limit >= 0)) throw new RangeError('graph: maxCost must be a number, 0 or more')
  return limit
}

function directionOf(direction: PathDirection | undefined): PathRules['direction'] {
  if (direction === undefined || direction === 'both') return 0
  if (direction === 'forward') return 1
  if (direction === 'backward') return -1
  throw new TypeError("graph: direction must be 'both', 'forward' or 'backward'")
}

export function createPathQueries(source: PathSource): GraphPaths {
  const { model } = source
  const search = new PathSearch()

  function nodeFilterOf(options: PathOptions): ((index: number) => boolean) | null {
    const keepNode = options.nodes ?? null
    const shown = options.visible ? source.shown() : null
    if (!keepNode && !shown) return null
    return (index: number): boolean => {
      if (shown && !shown.node(index)) return false
      if (!keepNode) return true
      const record = model.nodeAt(index)
      return record !== undefined && keepNode(record.datum, record.key)
    }
  }

  function edgeFilterOf(
    adjacency: Adjacency,
    options: PathOptions,
  ): ((id: number) => boolean) | null {
    const keepEdge = options.edges ?? null
    const shown = options.visible ? source.shown() : null
    if (!keepEdge && !shown) return null
    return (id: number): boolean => {
      const record = adjacency.edgeAt(id)
      if (!record) return false
      if (shown && !shown.edge(record.index)) return false
      if (!keepEdge) return true
      return keepEdge(record.datum, record.key)
    }
  }

  function weightOf(adjacency: Adjacency, options: PathOptions): ((id: number) => number) | null {
    if (options.weight === undefined) return null
    const read = toAccessor<unknown, unknown>(options.weight)
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

  function rulesOf(adjacency: Adjacency, options: PathOptions): PathRules {
    const blocked = edgeFilterOf(adjacency, options)
    const weight = weightOf(adjacency, options)
    const cost =
      blocked || weight
        ? (id: number): number => {
            if (blocked && !blocked(id)) return Number.NaN
            if (!weight) return 1
            return weight(id)
          }
        : null
    const node = nodeFilterOf(options)
    return {
      direction: directionOf(options.direction),
      weighted: weight !== null,
      cost,
      node,
      groups: options.visible ? source.groups() : null,
    }
  }

  function nodeKey(index: number): Key {
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

  return {
    shortest(from, to, options = {}): GraphPath | null {
      source.prepare()
      const start = model.node(from)?.index ?? -1
      const goal = model.node(to)?.index ?? -1
      if (start < 0 || goal < 0) return null
      const adjacency = model.adjacency()
      const found = search.shortest(adjacency, rulesOf(adjacency, options), start, goal)
      if (!found) return null
      return {
        nodes: found.nodes.map(nodeKey),
        edges: edgeKeys(adjacency, found.edges),
        costs: found.costs,
        cost: found.costs[found.costs.length - 1] ?? 0,
      }
    },

    reach(from, options = {}): GraphReach {
      const limit = limitOf(options.maxCost)
      source.prepare()
      const start = model.node(from)?.index ?? -1
      if (start < 0) return noReach
      const adjacency = model.adjacency()
      const found = search.reach(adjacency, rulesOf(adjacency, options), start, limit)
      return {
        nodes: found.nodes.map(nodeKey),
        costs: found.costs,
        edges: edgeKeys(adjacency, found.edges),
      }
    },
  }
}
