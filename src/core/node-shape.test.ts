import { describe, expect, it } from 'vitest'
import { boxShape, NodeColumns, shapeCodes } from './columns'
import {
  boundingRadius,
  boxDistance,
  boxReach,
  halfWidthOf,
  loopShift,
  nodeDistance,
  nodeTrim,
  textInside,
} from './node-shape'

function columns(): NodeColumns {
  const nodes = new NodeColumns()
  nodes.reserve(4)
  nodes.alive.fill(1)
  nodes.size.set([20, 20, 20, 20])
  nodes.shape.set([boxShape, shapeCodes.circle, boxShape, shapeCodes.square])
  nodes.width.set([100, 0, 10, 0])
  nodes.corner.set([5, 0, 50, 0])
  nodes.screenUnits.set([0, 0, 1, 0])
  return nodes
}

describe('box geometry', () => {
  it('measures the signed distance to a rounded rectangle', () => {
    expect(boxDistance(0, 0, 50, 10, 5)).toBe(-10)
    expect(boxDistance(60, 0, 50, 10, 5)).toBe(10)
    expect(boxDistance(0, 15, 50, 10, 5)).toBe(5)
    expect(boxDistance(50, 10, 50, 10, 5)).toBeCloseTo(5 * Math.SQRT2 - 5, 9)
    expect(boxDistance(50, 10, 50, 10, 0)).toBe(0)
  })

  it('finds where a ray from the center leaves the box, corners included', () => {
    const box = { halfWidth: 50, halfHeight: 10, corner: 5 }
    expect(boxReach(box, 1, 0)).toBeCloseTo(50, 9)
    expect(boxReach(box, 0, -1)).toBeCloseTo(10, 9)
    for (let step = 0; step < 64; step++) {
      const angle = (step / 64) * Math.PI * 2
      const ux = Math.cos(angle)
      const uy = Math.sin(angle)
      const t = boxReach(box, ux, uy)
      expect(Math.abs(boxDistance(ux * t, uy * t, 50, 10, 5))).toBeLessThan(1e-9)
    }
    const square = { halfWidth: 10, halfHeight: 10, corner: 10 }
    expect(boxReach(square, Math.SQRT1_2, Math.SQRT1_2)).toBeCloseTo(10, 9)
  })

  it('reads the columns of a box at a zoom, and the radius of other shapes', () => {
    const nodes = columns()
    expect(halfWidthOf(nodes, 0)).toBe(50)
    expect(halfWidthOf(nodes, 1)).toBe(10)
    expect(boundingRadius(nodes, 0)).toBeCloseTo(Math.hypot(50, 10), 9)
    expect(boundingRadius(nodes, 1)).toBe(10)
    expect(nodeTrim(nodes, 0, 2, 1, 0)).toBeCloseTo(100, 9)
    expect(nodeTrim(nodes, 0, 2, 0, 1)).toBeCloseTo(20, 9)
    expect(nodeTrim(nodes, 1, 2, 1, 0)).toBe(20)
    expect(nodeTrim(nodes, 2, 2, 0, 1)).toBe(10)
    expect(nodeDistance(nodes, 0, 90, 0, 2)).toBeCloseTo(-10, 9)
    expect(nodeDistance(nodes, 1, 90, 0, 2)).toBeCloseTo(70, 9)
    expect(loopShift(nodes, 0, 1)).toBe(40)
    expect(loopShift(nodes, 1, 1)).toBe(0)
    expect(loopShift(nodes, 2, 1)).toBe(0)
  })

  it('caps the corner at half the smaller side', () => {
    const nodes = columns()
    expect(nodeDistance(nodes, 2, 0, 10, 1)).toBeCloseTo(0, 9)
    expect(nodeDistance(nodes, 2, 5, 0, 1)).toBeCloseTo(0, 9)
  })

  it('keeps text inside a box, and inside other shapes only when it fits', () => {
    const nodes = columns()
    expect(textInside(nodes, 0, 1, 500, 40)).toBe(true)
    expect(textInside(nodes, 1, 1, 12, 12)).toBe(true)
    expect(textInside(nodes, 1, 1, 30, 12)).toBe(false)
    expect(textInside(nodes, 1, 4, 30, 12)).toBe(true)
    expect(textInside(nodes, 3, 1, 17, 17)).toBe(true)
  })
})
