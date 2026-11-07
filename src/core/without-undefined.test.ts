import { describe, expect, it } from 'vitest'
import { withoutUndefined } from './without-undefined'

describe('withoutUndefined', () => {
  it('copies the own properties that are not undefined', () => {
    const source = { a: 1, b: undefined, c: null, d: false }
    const copy = withoutUndefined(source)
    expect(copy).toEqual({ a: 1, c: null, d: false })
    expect(Object.keys(copy)).toEqual(['a', 'c', 'd'])
    expect(copy).not.toBe(source)
    expect(source).toHaveProperty('b')
  })
})
