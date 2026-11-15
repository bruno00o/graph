import { describe, expect, it } from 'vitest'
import { type WheelSample, wheelNotch } from './wheel-glide'

function sample(delta: number, ticks?: number, mode = 0, pinch = false): WheelSample {
  return { mode, delta, ticks, pinch }
}

describe('wheel notches', () => {
  it('takes lines, pages and steps of a whole tick for notches', () => {
    expect(wheelNotch(sample(3, undefined, 1))).toBe(true)
    expect(wheelNotch(sample(-1, undefined, 2))).toBe(true)
    expect(wheelNotch(sample(100, -120))).toBe(true)
    expect(wheelNotch(sample(57, -120))).toBe(true)
    expect(wheelNotch(sample(-53.33333206176758, 120))).toBe(true)
    expect(wheelNotch(sample(300, -360))).toBe(true)
    expect(wheelNotch(sample(100, -120, 0, true))).toBe(true)
  })

  it('takes the fixed-point line deltas of a mouse for notches', () => {
    expect(wheelNotch(sample(4.000244140625, -12))).toBe(true)
    expect(wheelNotch(sample(-4.000244140625))).toBe(true)
    expect(wheelNotch(sample(-12.4005126953125, 37))).toBe(true)
  })

  it('leaves trackpads, pinches and smooth wheels continuous', () => {
    expect(wheelNotch(sample(4))).toBe(false)
    expect(wheelNotch(sample(4, -12))).toBe(false)
    expect(wheelNotch(sample(40, -120))).toBe(false)
    expect(wheelNotch(sample(7.5, -22))).toBe(false)
    expect(wheelNotch(sample(1.25, -3.75))).toBe(false)
    expect(wheelNotch(sample(-2.3, 120, 0, true))).toBe(false)
    expect(wheelNotch(sample(0, 120))).toBe(false)
    expect(wheelNotch(sample(Number.NaN, 120))).toBe(false)
  })
})
