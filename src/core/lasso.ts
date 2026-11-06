import type { Key, Point } from '../types'
import type { NodeColumns } from './columns'
import type { Positions } from './positions'

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

export function nodesInside(
  polygon: readonly Point[],
  nodes: NodeColumns,
  positions: Positions,
): Key[] {
  if (polygon.length < 3) return []
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
  const inside: Key[] = []
  for (let index = 0; index < nodes.capacity; index++) {
    if (nodes.alive[index] !== 1) continue
    const x = positions.x(index)
    const y = positions.y(index)
    if (x < left || x > right || y < top || y > bottom) continue
    const key = nodes.keys[index]
    if (key !== undefined && insidePolygon(x, y, polygon)) inside.push(key)
  }
  return inside
}
