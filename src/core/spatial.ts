import type { Point } from '../types'
import type { NodeColumns } from './columns'
import type { Positions } from './positions'

const sideWeight = 2
const cone = 2

export function nearestNode(point: Point, nodes: NodeColumns, positions: Positions): number {
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < nodes.capacity; index++) {
    if (nodes.alive[index] !== 1) continue
    const distance = Math.hypot(positions.x(index) - point.x, positions.y(index) - point.y)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  }
  return best
}

export function nodeToward(
  from: number,
  direction: Point,
  nodes: NodeColumns,
  positions: Positions,
): number {
  const x = positions.x(from)
  const y = positions.y(from)
  const length = Math.hypot(direction.x, direction.y)
  if (length === 0) return -1
  const dx = direction.x / length
  const dy = direction.y / length
  let best = -1
  let bestScore = Number.POSITIVE_INFINITY
  for (let index = 0; index < nodes.capacity; index++) {
    if (index === from || nodes.alive[index] !== 1) continue
    const vx = positions.x(index) - x
    const vy = positions.y(index) - y
    const along = vx * dx + vy * dy
    if (along <= 0) continue
    const side = Math.abs(vx * dy - vy * dx)
    if (side > along * cone) continue
    const score = along + side * sideWeight
    if (score < bestScore) {
      best = index
      bestScore = score
    }
  }
  return best
}
