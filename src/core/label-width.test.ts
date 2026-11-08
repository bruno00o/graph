import { describe, expect, it } from 'vitest'
import { estimateTextWidth, labelWidth, secondaryFactor, type TextWidth } from './label-width'

const calls: string[] = []
const measure: TextWidth = (text, weight) => {
  calls.push(text)
  let width = 0
  for (const char of text)
    width += char === '…' ? 1 : char === ' ' ? 0.25 : weight >= 500 ? 0.5 : 0.4
  return width
}

describe('labelWidth', () => {
  it('measures the widest line in pixels', () => {
    expect(labelWidth(measure, 'abcd', null, 500, null, 0, 12)).toBeCloseTo(24, 6)
    expect(labelWidth(measure, 'ab\nabcdef', null, 500, null, 0, 12)).toBeCloseTo(36, 6)
    expect(labelWidth(measure, 'abcd', null, 500, null, 0, 20)).toBeCloseTo(40, 6)
  })

  it('measures the secondary line smaller and in normal weight', () => {
    const width = labelWidth(measure, 'ab', 'abcdefghij', 500, null, 0, 12)
    expect(width).toBeCloseTo(10 * 0.4 * secondaryFactor * 12, 6)
  })

  it('cuts a line to the maximum width with an ellipsis, as the atlas does', () => {
    const width = labelWidth(measure, 'abcdefgh ijk', null, 500, null, 30, 12)
    expect(width).toBeLessThanOrEqual(30)
    expect(calls).toContain('abc…')
    const spaced = labelWidth(measure, 'ab cdefgh', null, 500, null, 27, 12)
    expect(spaced).toBeCloseTo(24, 6)
    expect(calls).toContain('ab…')
  })

  it('estimates a width without a measure', () => {
    expect(estimateTextWidth('abc', 500, null)).toBeCloseTo(1.8, 6)
    expect(labelWidth(estimateTextWidth, 'abcd', null, 500, null, 0, 10)).toBeCloseTo(24, 6)
  })
})
