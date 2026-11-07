import type { GraphPath, GraphPaths, GraphReach, Key, PathDirection, PathOptions } from '../types'
import { toAccessor } from './accessor'
import type { Adjacency, GraphModel } from './graph-model'
import { type PathGroups, type PathRules, PathSearch } from './paths'

export interface PathShown {
  node(index: number): boolean
  edge(index: number): boolean
}

export interface PathSource {
  readonly model: GraphModel
  prepare(): void
  groups(): PathGroups | null
  shown(): PathShown | null
}

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

  function rulesOf(adjacency: Adjacency, options: PathOptions): PathRules {
    const read = options.weight === undefined ? null : toAccessor<unknown, unknown>(options.weight)
    const keepEdge = options.edges ?? null
    const keepNode = options.nodes ?? null
    const shown = options.visible ? source.shown() : null
    const cost =
      read || keepEdge || shown
        ? (id: number): number => {
            const record = adjacency.edgeAt(id)
            if (!record || (shown && !shown.edge(record.index))) return Number.NaN
            if (keepEdge && !keepEdge(record.datum, record.key)) return Number.NaN
            if (!read) return 1
            const value = read(record.datum)
            if (typeof value !== 'number' || !Number.isFinite(value)) return Number.NaN
            if (value < 0) {
              throw new RangeError(`graph: edge "${String(record.key)}" has a negative weight`)
            }
            return value
          }
        : null
    const node =
      keepNode || shown
        ? (index: number): boolean => {
            if (shown && !shown.node(index)) return false
            if (!keepNode) return true
            const record = model.nodeAt(index)
            return record !== undefined && keepNode(record.datum, record.key)
          }
        : null
    return {
      direction: directionOf(options.direction),
      weighted: read !== null,
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
