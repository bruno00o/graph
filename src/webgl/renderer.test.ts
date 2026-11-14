import { describe, expect, it } from 'vitest'
import type { RenderInput } from '../host/renderer'
import { shapeUnitCount, timesShown } from './renderer'
import {
  shapePlaceUnit,
  shapePointsUnit,
  shapeStateUnit,
  shapeStyleUnit,
  shapeTimeUnit,
  shapeZoomUnit,
} from './shape-shaders'

function scene(nodes: number, edges: number, shapes: number): RenderInput['scene'] {
  const timed = (count: number) => ({ time: { count } })
  return {
    nodes: timed(nodes),
    edges: timed(edges),
    shapes: timed(shapes),
  } as unknown as RenderInput['scene']
}

describe('renderer', () => {
  it('applies the time window to shapes, even when no node or edge has a time', () => {
    expect(timesShown(scene(0, 0, 0), false)).toBe(false)
    expect(timesShown(scene(0, 0, 3), false)).toBe(true)
    expect(timesShown(scene(2, 0, 0), true)).toBe(true)
    expect(timesShown(scene(2, 0, 0), false)).toBe(false)
  })

  it('guards on a map every texture unit the shapes bind', () => {
    const bound = [
      shapeStyleUnit,
      shapeStateUnit,
      shapeZoomUnit,
      shapeTimeUnit,
      shapePlaceUnit,
      shapePointsUnit,
    ]
    for (const unit of bound) {
      expect(unit).toBeLessThan(shapeUnitCount)
    }
  })
})
