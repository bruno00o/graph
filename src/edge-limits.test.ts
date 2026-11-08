import { describe, expect, it } from 'vitest'
import { densityBundling } from './bundling'
import { orthogonalRouting } from './routing'

const limit = 2 ** 31

describe.each([
  ['densityBundling', densityBundling, 200_000],
  ['orthogonalRouting', orthogonalRouting, 50_000],
] as const)('%s maxEdges', (_name, make, fallback) => {
  it('takes Infinity as no limit', () => {
    expect(make({ maxEdges: Number.POSITIVE_INFINITY }).maxEdges).toBe(limit)
  })

  it('falls back to the default for NaN and negative infinity, and clamps negative values', () => {
    expect(make({ maxEdges: Number.NaN }).maxEdges).toBe(fallback)
    expect(make({ maxEdges: Number.NEGATIVE_INFINITY }).maxEdges).toBe(fallback)
    expect(make({ maxEdges: -5 }).maxEdges).toBe(0)
  })

  it('rounds down and caps finite values', () => {
    expect(make({ maxEdges: 10.9 }).maxEdges).toBe(10)
    expect(make({ maxEdges: 1e12 }).maxEdges).toBe(limit)
    expect(make().maxEdges).toBe(fallback)
  })
})
