import { containerShape, type EdgeColumns, type NodeColumns } from '../core/columns'
import type { GraphModel } from '../core/graph-model'
import type { Hierarchy } from '../core/hierarchy'
import { halfWidthOf } from '../core/node-shape'
import type { PositionReader, Positions } from '../core/positions'
import type { Projection } from '../core/projection'
import type { Bounds } from '../core/view'
import type { ContainerBoxes } from './containers'
import type { FitKeys } from './view-control'

export function nodeBounds(
  nodes: NodeColumns,
  containers: ContainerBoxes,
  positions: Positions,
  indices: Iterable<number> | null,
  reader: PositionReader,
): Bounds | null {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  const include = (index: number) => {
    if (nodes.alive[index] !== 1) return
    if (nodes.shape[index] === containerShape) {
      const box = containers.bounds(index, positions)
      minX = Math.min(minX, box.minX)
      minY = Math.min(minY, box.minY)
      maxX = Math.max(maxX, box.maxX)
      maxY = Math.max(maxY, box.maxY)
      return
    }
    const radius = nodes.screenUnits[index] === 1 ? 0 : (nodes.size[index] ?? 0) / 2
    const wide = nodes.screenUnits[index] === 1 ? 0 : halfWidthOf(nodes, index)
    const x = reader.x(index)
    const y = reader.y(index)
    minX = Math.min(minX, x - wide)
    minY = Math.min(minY, y - radius)
    maxX = Math.max(maxX, x + wide)
    maxY = Math.max(maxY, y + radius)
  }
  if (indices) {
    for (const index of indices) include(index)
  } else {
    for (let index = 0; index < nodes.capacity; index++) include(index)
  }
  return maxX < minX ? null : { minX, minY, maxX, maxY }
}

export function fitIndices(
  keys: FitKeys | null,
  model: GraphModel,
  projection: Projection,
  edges: EdgeColumns,
): number[] | null {
  if (!keys) return null
  const hierarchy = projection.hierarchy
  const indices: number[] = []
  const add = (index: number) => {
    if (index >= 0) indices.push(projection.active ? hierarchy.representative(index) : index)
  }
  for (const key of keys.nodes) add(model.node(key)?.index ?? -1)
  for (const key of keys.edges) {
    const index = projection.edgeIndexOf(key)
    if (index >= 0 && edges.alive[index] === 1) {
      add(edges.source[index] ?? -1)
      add(edges.target[index] ?? -1)
      continue
    }
    const ends = model.endpoints(key)
    if (!ends) continue
    add(model.node(ends.source)?.index ?? -1)
    add(model.node(ends.target)?.index ?? -1)
  }
  return indices
}

export function boundsAfter(
  nodes: NodeColumns,
  hierarchy: Hierarchy,
  reader: () => PositionReader,
  indices: readonly number[],
  to: readonly number[],
  framed: readonly number[] | null,
): Bounds | null {
  const moving = new Uint8Array(nodes.capacity)
  for (const index of indices) moving[index] = 1
  let chosen: Uint8Array | null = null
  if (framed) {
    const marked = new Uint8Array(nodes.capacity)
    const mark = (index: number) => {
      marked[index] = 1
    }
    for (const index of framed) {
      mark(index)
      if (nodes.shape[index] === containerShape) hierarchy.forEachDescendant(index, mark)
    }
    chosen = marked
  }
  const settled = reader()
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  const include = (index: number, x: number, y: number) => {
    if (nodes.shape[index] === containerShape || (chosen && chosen[index] !== 1)) return
    let radius = nodes.screenUnits[index] === 1 ? 0 : (nodes.size[index] ?? 0) / 2
    let wide = nodes.screenUnits[index] === 1 ? 0 : halfWidthOf(nodes, index)
    for (let at = hierarchy.parent[index] ?? -1; at >= 0; at = hierarchy.parent[at] ?? -1) {
      if (nodes.shape[at] !== containerShape) continue
      radius += nodes.padding[at] ?? 0
      wide += nodes.padding[at] ?? 0
    }
    minX = Math.min(minX, x - wide)
    minY = Math.min(minY, y - radius)
    maxX = Math.max(maxX, x + wide)
    maxY = Math.max(maxY, y + radius)
  }
  for (let index = 0; index < nodes.capacity; index++) {
    if (nodes.alive[index] === 1 && moving[index] !== 1)
      include(index, settled.x(index), settled.y(index))
  }
  indices.forEach((index, i) => {
    include(index, to[i * 2] ?? 0, to[i * 2 + 1] ?? 0)
  })
  return maxX < minX ? null : { minX, minY, maxX, maxY }
}
