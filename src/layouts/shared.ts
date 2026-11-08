import { withoutUndefined } from '../core/without-undefined'
import type { Key, Layout, LayoutGraph, LayoutListener, LayoutRun } from '../types'
import { inBlocks } from './blocks'

/**
 * Order of the nodes: `'degree'` puts the nodes with the most edges first, a function compares the
 * items of two nodes, as given to `nodes()`. Ties keep the internal order.
 */
export type NodeOrder<T> = 'degree' | ((a: T, b: T) => number)

export function movers(graph: LayoutGraph): number[] {
  const indices: number[] = []
  for (let index = 0; index < graph.capacity; index++) {
    if (graph.alive[index] === 1 && graph.movable[index] === 1) indices.push(index)
  }
  return indices
}

export function degrees(graph: LayoutGraph): Uint32Array {
  const degree = new Uint32Array(graph.capacity)
  for (let at = 0; at < graph.edges.length; at++) {
    const index = graph.edges[at] ?? 0
    degree[index] = (degree[index] ?? 0) + 1
  }
  return degree
}

export function stepsOf(
  graph: LayoutGraph,
  indices: readonly number[],
  spacing?: number,
): readonly [number, number] {
  const extents = graph.extents
  if (!extents) {
    const step = spacingOf(graph, indices, spacing)
    return [step, step]
  }
  let wide = 0
  let tall = 0
  let largest = 0
  for (const index of indices) {
    const width = (extents[index * 2] ?? 0) * 2
    const height = (extents[index * 2 + 1] ?? 0) * 2
    wide = Math.max(wide, width)
    tall = Math.max(tall, height)
    largest = Math.max(largest, Math.min(width, height))
  }
  const gap = spacing !== undefined && Number.isFinite(spacing) && spacing >= 0 ? spacing : null
  const room = gap ?? Math.max(largest, 24)
  return [wide + room, tall + room]
}

export function spacingOf(
  graph: LayoutGraph,
  indices: readonly number[],
  spacing?: number,
): number {
  let largest = 0
  for (const index of indices) largest = Math.max(largest, (graph.radius[index] ?? 0) * 2)
  const gap = spacing !== undefined && Number.isFinite(spacing) && spacing >= 0 ? spacing : null
  return largest + (gap ?? Math.max(largest, 24))
}

export function centroid(
  graph: LayoutGraph,
  indices: readonly number[],
): readonly [number, number] {
  if (indices.length === 0) return [0, 0]
  let x = 0
  let y = 0
  for (const index of indices) {
    x += graph.xy[index * 2] ?? 0
    y += graph.xy[index * 2 + 1] ?? 0
  }
  return [x / indices.length, y / indices.length]
}

export function ordered<T>(
  graph: LayoutGraph,
  indices: readonly number[],
  order: NodeOrder<T> | undefined,
): number[] {
  const sorted = [...indices]
  if (order === 'degree') {
    const degree = degrees(graph)
    sorted.sort((a, b) => (degree[b] ?? 0) - (degree[a] ?? 0) || a - b)
  } else if (order) {
    sorted.sort((a, b) => order(graph.datum(a) as T, graph.datum(b) as T) || a - b)
  }
  return sorted
}

export function indexOfKey(graph: LayoutGraph, key: Key): number {
  for (let index = 0; index < graph.capacity; index++) {
    if (graph.alive[index] === 1 && graph.keys[index] === key) return index
  }
  return -1
}

export function instant(
  name: string,
  options: object,
  compute: (graph: LayoutGraph) => Float32Array,
  blocks = true,
): Layout {
  return Object.freeze({
    name,
    options: Object.freeze(withoutUndefined(options)),
    incremental: false,
    start(graph: LayoutGraph, listener: LayoutListener): LayoutRun {
      let stopped = false
      queueMicrotask(() => {
        if (!stopped) listener.end(blocks ? inBlocks(graph, compute) : compute(graph))
      })
      return {
        pin() {},
        stop() {
          stopped = true
        },
      }
    },
  })
}
