import { describe, expect, it, vi } from 'vitest'
import type { Simplified } from './simplify'

const crafted: { levels: Simplified[] } = { levels: [] }

vi.mock('./simplify', () => ({
  detailedFrom: 256,
  simplifiedLevels: () => crafted.levels,
}))

const { fillShape } = await import('./fill')

const square = {
  points: Float64Array.from([0, 0, 10, 0, 10, 10, 0, 10]),
  rings: Uint32Array.from([4]),
  polygons: Uint32Array.from([0]),
  polygon: true,
  closed: true,
}

function level(points: readonly number[]): Simplified {
  return {
    area: 1,
    error: 1,
    points: Float64Array.from(points),
    rings: Uint32Array.from([points.length / 2]),
    kept: Uint32Array.from([0, 1, 2, 3]),
  }
}

describe('fillShape levels', () => {
  it('fills a level that covers its rings with its own triangles', () => {
    crafted.levels = [level([0, 0, 10, 0, 10, 10, 0, 10])]
    const filled = fillShape(square)
    expect(filled.levels[0]?.triangles).not.toBe(filled.triangles)
    expect(filled.levels[0]?.triangles.length).toBe(6)
  })

  it('reuses the finer fill when a level crosses itself', () => {
    crafted.levels = [level([0, 0, 10, 0, 10, 10, 0, 10]), level([0, 0, 10, 10, 10, 0, 0, 10])]
    const filled = fillShape(square)
    const [first, crossed] = filled.levels
    expect(crossed?.triangles).toBe(first?.triangles)
    expect(filled.bad).toBe(false)
  })
})
