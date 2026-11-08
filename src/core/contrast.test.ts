import { describe, expect, it } from 'vitest'
import { contrastRatio, luminance, paperOnFill } from './contrast'

const ink = [25, 29, 34, 255] as const
const paper = [247, 247, 244, 255] as const

describe('contrast', () => {
  it('follows the relative luminance and contrast ratio of WCAG 2', () => {
    expect(luminance(255, 255, 255)).toBeCloseTo(1, 6)
    expect(luminance(0, 0, 0)).toBe(0)
    expect(luminance(255, 0, 0)).toBeCloseTo(0.2126, 4)
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 6)
    expect(contrastRatio(0, 1)).toBeCloseTo(21, 6)
    expect(luminance(119, 119, 119)).toBeCloseTo(0.1845, 3)
  })

  it('takes paper on a dark fill and ink on a light one', () => {
    expect(paperOnFill([38, 105, 183, 255], ink, paper)).toBe(true)
    expect(paperOnFill([20, 20, 20, 255], ink, paper)).toBe(true)
    expect(paperOnFill([240, 220, 120, 255], ink, paper)).toBe(false)
    expect(paperOnFill([255, 255, 255, 255], ink, paper)).toBe(false)
  })

  it('reads a translucent fill over the paper', () => {
    expect(paperOnFill([0, 0, 0, 0], ink, paper)).toBe(false)
    expect(paperOnFill([0, 0, 0, 40], ink, paper)).toBe(false)
    expect(paperOnFill([0, 0, 0, 255], ink, paper)).toBe(true)
  })

  it('swaps with a dark theme, where the paper is dark and the ink light', () => {
    const lightInk = [236, 237, 238, 255] as const
    const darkPaper = [15, 17, 19, 255] as const
    expect(paperOnFill([240, 220, 120, 255], lightInk, darkPaper)).toBe(true)
    expect(paperOnFill([38, 105, 183, 255], lightInk, darkPaper)).toBe(false)
  })
})
