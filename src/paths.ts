import { createGraphModel } from './core/graph-model'
import { createPathQueries, noReach } from './core/path-query'
import { type PathSource, registerPathSource } from './core/path-registry'
import type { GraphPaths, Mark, PathFinder } from './types'

/**
 * Path queries on the data of marks, without mounting a graph: on a server, in a worker or in
 * tests. It reads the arrays and subscribes to the live sources at once, then applies their
 * changes at the next query.
 */
export function createPathFinder<M extends Mark>(definition: {
  readonly marks: readonly M[]
}): PathFinder<M> {
  let stale = true
  let destroyed = false
  let version = 0
  const model = createGraphModel({
    schedule: () => {
      stale = true
    },
  })
  model.setMarks(definition.marks)
  const source: PathSource = {
    model,
    prepare: () => {
      if (!stale || destroyed) return
      stale = false
      model.flush()
      version++
    },
    groups: () => null,
    shown: () => null,
    stamp: () => version,
    destroyed: () => destroyed,
  }
  const queries = createPathQueries(source) as unknown as GraphPaths<M>
  const finder: PathFinder<M> = {
    shortest: (from, to, options) => (destroyed ? null : queries.shortest(from, to, options)),
    reach: (from, options) => (destroyed ? noReach : queries.reach(from, options)),
    destroy: () => {
      if (destroyed) return
      destroyed = true
      model.destroy()
    },
  }
  registerPathSource(finder, source)
  return finder
}
