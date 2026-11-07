import { createGraphModel } from './core/graph-model'
import { createPathQueries } from './core/path-query'
import type { GraphPaths, Mark, PathFinder } from './types'

/**
 * Path queries on the data of marks, without mounting a graph: on a server, in a worker or in
 * tests. The marks are read at the first query, and live sources again after each change.
 */
export function createPathFinder<M extends Mark>(definition: {
  readonly marks: readonly M[]
}): PathFinder<M> {
  let stale = true
  let destroyed = false
  const model = createGraphModel({
    schedule: () => {
      stale = true
    },
  })
  model.setMarks(definition.marks)
  const queries = createPathQueries({
    model,
    prepare: () => {
      if (!stale || destroyed) return
      stale = false
      model.flush()
    },
    groups: () => null,
    shown: () => null,
  }) as unknown as GraphPaths<M>
  return {
    shortest: (from, to, options) => (destroyed ? null : queries.shortest(from, to, options)),
    reach: (from, options) =>
      destroyed ? { nodes: [], costs: [], edges: [] } : queries.reach(from, options),
    destroy: () => {
      if (destroyed) return
      destroyed = true
      model.destroy()
    },
  }
}
