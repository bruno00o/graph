import { describe, expect, it } from 'vitest'
import { NodeColumns } from './columns'
import { insidePolygon, nodesInside } from './lasso'
import { Positions } from './positions'

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
]
const notch = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 5, y: 2 },
  { x: 0, y: 10 },
]

describe('lasso', () => {
  it('tests points against a polygon by the even-odd rule', () => {
    expect(insidePolygon(5, 5, square)).toBe(true)
    expect(insidePolygon(15, 5, square)).toBe(false)
    expect(insidePolygon(5, 1, notch)).toBe(true)
    expect(insidePolygon(5, 8, notch)).toBe(false)
    expect(insidePolygon(9, 8, notch)).toBe(true)
  })

  it('returns the keys of the living nodes inside', () => {
    const nodes = new NodeColumns()
    const positions = new Positions()
    const points: Array<readonly [string, number, number, number]> = [
      ['in', 5, 1, 1],
      ['notched', 5, 8, 1],
      ['out', 20, 5, 1],
      ['dead', 9, 8, 0],
      ['corner', 9, 8, 1],
    ]
    points.forEach(([key, x, y, alive], index) => {
      nodes.reserve(index)
      nodes.keys[index] = key
      nodes.alive[index] = alive
      positions.set(index, x, y)
    })
    expect(nodesInside(notch, nodes, positions)).toEqual(['in', 'corner'])
    expect(nodesInside(notch.slice(0, 2), nodes, positions)).toEqual([])
  })
})
