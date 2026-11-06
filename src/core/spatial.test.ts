import { describe, expect, it } from 'vitest'
import { NodeColumns } from './columns'
import { Positions } from './positions'
import { nearestNode, nodeToward } from './spatial'

function grid(points: ReadonlyArray<readonly [number, number, number?]>) {
  const nodes = new NodeColumns()
  const positions = new Positions()
  points.forEach(([x, y, alive = 1], index) => {
    nodes.reserve(index)
    nodes.alive[index] = alive
    positions.set(index, x, y)
  })
  return { nodes, positions }
}

describe('spatial navigation', () => {
  const { nodes, positions } = grid([
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
    [50, -300],
    [30, 5, 0],
  ])

  it('moves to the closest node in a direction, favoring the axis', () => {
    expect(nodeToward(0, { x: 1, y: 0 }, nodes, positions)).toBe(1)
    expect(nodeToward(0, { x: 0, y: 1 }, nodes, positions)).toBe(3)
    expect(nodeToward(1, { x: 0, y: 1 }, nodes, positions)).toBe(2)
    expect(nodeToward(0, { x: 0, y: -1 }, nodes, positions)).toBe(4)
    expect(nodeToward(0, { x: -1, y: 0 }, nodes, positions)).toBe(-1)
  })

  it('finds the living node nearest to a point', () => {
    expect(nearestNode({ x: 30, y: 5 }, nodes, positions)).toBe(0)
    expect(nearestNode({ x: 90, y: 90 }, nodes, positions)).toBe(2)
  })
})
