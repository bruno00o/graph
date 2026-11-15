import type { Key, Point } from '../types'
import type { EdgeColumns, NodeColumns } from './columns'
import type { Positions } from './positions'
import { edgeShown, nodeShown, type Sight } from './visibility'

export function insidePolygon(x: number, y: number, polygon: readonly Point[]): boolean {
  let inside = false
  let previous = polygon[polygon.length - 1]
  for (const point of polygon) {
    if (
      previous &&
      point.y > y !== previous.y > y &&
      x < ((previous.x - point.x) * (y - point.y)) / (previous.y - point.y) + point.x
    ) {
      inside = !inside
    }
    previous = point
  }
  return inside
}

export function forEachNodeInside(
  polygon: readonly Point[],
  nodes: NodeColumns,
  positions: Positions,
  sight: Sight | undefined,
  visit: (index: number) => void,
): void {
  if (polygon.length < 3) return
  let left = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  for (const point of polygon) {
    left = Math.min(left, point.x)
    right = Math.max(right, point.x)
    top = Math.min(top, point.y)
    bottom = Math.max(bottom, point.y)
  }
  for (let index = 0; index < nodes.capacity; index++) {
    if (nodes.alive[index] !== 1) continue
    if (sight !== undefined && !nodeShown(nodes, index, sight)) continue
    const x = positions.x(index)
    const y = positions.y(index)
    if (x < left || x > right || y < top || y > bottom) continue
    if (insidePolygon(x, y, polygon)) visit(index)
  }
}

export function nodesInside(
  polygon: readonly Point[],
  nodes: NodeColumns,
  positions: Positions,
  sight?: Sight,
): Key[] {
  const inside: Key[] = []
  forEachNodeInside(polygon, nodes, positions, sight, (index) => {
    const key = nodes.keys[index]
    if (key !== undefined) inside.push(key)
  })
  return inside
}

export function edgesBetween(
  inside: Uint8Array,
  nodes: NodeColumns,
  edges: EdgeColumns,
  sight: Sight,
  visit: (index: number) => void,
): void {
  for (let index = 0; index < edges.capacity; index++) {
    if (edges.alive[index] !== 1) continue
    if (inside[edges.source[index] ?? -1] !== 1 || inside[edges.target[index] ?? -1] !== 1) continue
    if (edgeShown(nodes, edges, index, sight)) visit(index)
  }
}
