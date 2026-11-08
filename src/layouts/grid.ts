import type { Layout } from '../types'
import { centroid, instant, movers, type NodeOrder, ordered, stepsOf } from './shared'

/** Options of `grid`. */
export interface GridOptions<T = unknown> {
  /**
   * Nodes per row, rounded down and at least 1. Defaults to the square root of the count, rounded
   * up.
   */
  readonly columns?: number | undefined
  /**
   * Gap between rows and between columns, from the borders of the largest nodes, in world units.
   * Defaults to the largest diameter, and at least 24. Columns of boxes are as wide as the widest
   * box, rows as tall as the tallest.
   */
  readonly spacing?: number | undefined
  /** Order of the nodes, row by row from the top left. Defaults to the internal order. */
  readonly order?: NodeOrder<T> | undefined
}

/**
 * A layout that lines the free nodes up in rows, centered on where they are. It ends at once, and
 * nodes glide to their place.
 */
export function grid<T = unknown>(options: GridOptions<T> = {}): Layout<T> {
  return instant('grid', options, (graph) => {
    const xy = Float32Array.from(graph.xy)
    const indices = movers(graph)
    if (indices.length === 0) return xy
    const sorted = ordered(graph, indices, options.order)
    const columns = Math.max(1, Math.floor(options.columns ?? Math.ceil(Math.sqrt(sorted.length))))
    const rows = Math.ceil(sorted.length / columns)
    const [across, down] = stepsOf(graph, indices, options.spacing)
    const [x, y] = centroid(graph, indices)
    const left = x - ((Math.min(columns, sorted.length) - 1) * across) / 2
    const top = y - ((rows - 1) * down) / 2
    sorted.forEach((index, at) => {
      xy[index * 2] = left + (at % columns) * across
      xy[index * 2 + 1] = top + Math.floor(at / columns) * down
    })
    return xy
  })
}
