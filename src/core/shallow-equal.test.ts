import { describe, expect, it } from 'vitest'
import { shallowEqual } from './shallow-equal'

describe('shallowEqual', () => {
  it('compares own values by identity', () => {
    const accessor = () => 1
    expect(shallowEqual({ a: 1, b: accessor }, { b: accessor, a: 1 })).toBe(true)
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(shallowEqual({ a: {} }, { a: {} })).toBe(false)
    expect(shallowEqual({ a: Number.NaN }, { a: Number.NaN })).toBe(true)
  })

  it('counts a property set to undefined as absent', () => {
    expect(shallowEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(shallowEqual({ a: 1 }, { a: 1, b: undefined })).toBe(true)
    expect(shallowEqual({ a: undefined }, { b: undefined })).toBe(true)
    expect(shallowEqual({ a: undefined }, { a: null })).toBe(false)
    expect(shallowEqual({ a: 1, b: undefined }, { a: 1, c: 2 })).toBe(false)
  })

  it('skips the ignored keys', () => {
    const ignored = new Set(['merge'])
    expect(shallowEqual({ a: 1, merge: true }, { a: 1 }, ignored)).toBe(true)
    expect(shallowEqual({ a: 1, merge: true }, { a: 2, merge: true }, ignored)).toBe(false)
  })
})
