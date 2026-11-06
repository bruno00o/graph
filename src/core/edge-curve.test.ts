import { describe, expect, it } from 'vitest'
import {
  distanceToCubic,
  laneBend,
  loopCurve,
  loopReach,
  parallelCurve,
  pointOnCubic,
} from './edge-curve'

describe('edge curves', () => {
  it('spreads lanes symmetrically and bounds the outermost bend', () => {
    expect(laneBend(0, 1)).toBe(0)
    expect([0, 1].map((at) => laneBend(at, 2))).toEqual([-0.06, 0.06])
    expect([0, 1, 2].map((at) => laneBend(at, 3))).toEqual([-0.12, 0, 0.12])
    for (const count of [5, 9, 40]) {
      expect(Math.abs(laneBend(0, count))).toBeCloseTo(0.2)
      expect(laneBend(count - 1, count)).toBeCloseTo(-laneBend(0, count))
    }
  })

  it('places a parallel curve apex at bend times the length', () => {
    const curve = parallelCurve(0, 0, 100, 0, 0.15)
    const apex = pointOnCubic(curve, 0.5)
    expect(apex.x).toBeCloseTo(50)
    expect(apex.y).toBeCloseTo(15)
    expect(distanceToCubic(curve, 50, 15, 16)).toBeLessThan(0.1)
    expect(distanceToCubic(curve, 50, 0, 16)).toBeGreaterThan(14)
  })

  it('grows loops by ordinal and leaves and returns to the node', () => {
    expect(loopReach(10, 0, 12)).toBe(25)
    expect(loopReach(4, 0, 12)).toBe(16)
    expect(loopReach(10, 2, 12)).toBe(40)
    const curve = loopCurve(0, 0, 30)
    expect(pointOnCubic(curve, 0)).toEqual({ x: 0, y: 0 })
    expect(pointOnCubic(curve, 1)).toEqual({ x: 0, y: 0 })
    const apex = pointOnCubic(curve, 0.5)
    expect(Math.hypot(apex.x, apex.y)).toBeCloseTo(30)
    expect(apex.x).toBeGreaterThan(0)
    expect(apex.y).toBeLessThan(0)
  })
})
