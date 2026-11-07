import { createGraphModel } from './core/graph-model'
import { SupportIndex } from './core/support'
import type { Mark, SupportFinder, SupportWalk } from './types'

const noWalk: SupportWalk = Object.freeze({ edges: [], depths: [], nodes: [] })

/**
 * Support queries on the data of marks, without mounting a graph: on a server, in a worker or in
 * tests. The marks are read at the first query, and live sources again after each change.
 */
export function createSupportFinder(definition: {
  readonly marks: readonly Mark[]
}): SupportFinder {
  let stale = true
  let destroyed = false
  const model = createGraphModel({
    schedule: () => {
      stale = true
    },
  })
  model.setMarks(definition.marks)
  const support = new SupportIndex(model)
  support.setMarks(definition.marks)
  const prepare = () => {
    if (!stale || destroyed) return
    stale = false
    support.apply(model.flush())
  }
  return {
    carriers: (key, options) => {
      if (destroyed) return noWalk
      prepare()
      return support.carriers(key, options)
    },
    carried: (key, options) => {
      if (destroyed) return noWalk
      prepare()
      return support.carried(key, options)
    },
    destroy: () => {
      if (destroyed) return
      destroyed = true
      support.clear()
      model.destroy()
    },
  }
}
