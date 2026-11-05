import { describe, expect, it } from 'vitest'
import { Palette } from './palette'

describe('Palette', () => {
  it('interns colors and changes version only for new ones', () => {
    const palette = new Palette()
    expect(palette.id('red')).toBe(0)
    expect(palette.id('blue')).toBe(1)
    expect(palette.id('red')).toBe(0)
    expect(palette.version).toBe(2)
    expect(palette.colors).toEqual(['red', 'blue'])
  })
})
