import { describe, expect, it } from 'vitest'
import { resolveNumberScale } from './number-scale'

const fallback = { type: 'linear', range: [0, 100] } as const

describe('resolveNumberScale', () => {
  it('maps the data extent onto the range', () => {
    const scale = resolveNumberScale(undefined, fallback)
    expect(scale.needsExtent).toBe(true)
    expect(scale.map(5, [0, 10])).toBe(50)
    expect(scale.map(10, [0, 10])).toBe(100)
  })

  it('clamps values outside the domain', () => {
    const scale = resolveNumberScale({ domain: [0, 10] }, fallback)
    expect(scale.needsExtent).toBe(false)
    expect(scale.domain).toEqual([0, 10])
    expect(scale.map(-5, null)).toBe(0)
    expect(scale.map(50, null)).toBe(100)
  })

  it('uses the middle of the range for a single value', () => {
    expect(resolveNumberScale(undefined, fallback).map(3, [3, 3])).toBe(50)
  })

  it('maps square roots so that areas follow values', () => {
    const scale = resolveNumberScale({ type: 'sqrt', range: [0, 10] }, fallback)
    expect(scale.map(25, [0, 100])).toBe(5)
  })

  it('accepts a function', () => {
    const scale = resolveNumberScale((value) => value * 2, fallback)
    expect(scale.needsExtent).toBe(false)
    expect(scale.map(4, null)).toBe(8)
  })
})
