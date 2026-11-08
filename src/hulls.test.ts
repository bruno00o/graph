import { describe, expect, it } from 'vitest'
import { defineGraph } from './define-graph'
import { hull } from './hulls'
import { nodes } from './marks'

const invalid = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, -0.5]

describe('hull', () => {
  it.each(['padding', 'strokeWidth'] as const)('rejects an invalid %s', (name) => {
    for (const value of invalid) {
      expect(() => hull({ nodes: ['a'], [name]: value })).toThrow(
        new RangeError(`hull: ${name} must be a finite number, 0 or more`),
      )
      expect(() => hull({ state: 'selected', [name]: value })).toThrow(RangeError)
      const mark = nodes([{ id: 'a', group: 'x' }], {})
      expect(() => hull({ nodes: mark, [name]: value })).toThrow(RangeError)
      expect(() => hull({ nodes: mark, by: 'group', [name]: value })).toThrow(RangeError)
    }
  })

  it.each(['padding', 'strokeWidth'] as const)(
    'accepts 0, positive numbers and undefined for %s',
    (name) => {
      expect(hull({ nodes: ['a'], [name]: 0 }).options).toMatchObject({ [name]: 0 })
      expect(hull({ nodes: ['a'], [name]: 12.5 }).options).toMatchObject({ [name]: 12.5 })
      expect(() => hull({ nodes: ['a'], [name]: undefined })).not.toThrow()
      expect(() => hull({ nodes: ['a'] })).not.toThrow()
    },
  )

  it('throws before defineGraph sees the hull', () => {
    expect(() =>
      defineGraph({ marks: [], hulls: [hull({ nodes: ['a'], padding: Number.NaN })] }),
    ).toThrow(RangeError)
  })
})
