import { describe, expect, it } from 'vitest'
import { lightTheme } from '../theme/tokens'
import { withFallbacks } from './theme'

describe('withFallbacks', () => {
  it('adds the light value as fallback to known tokens', () => {
    const { accent } = lightTheme
    expect(withFallbacks('var(--graph-accent)')).toBe(`var(--graph-accent, ${accent})`)
  })

  it('handles tokens nested in color functions', () => {
    expect(withFallbacks('color-mix(in oklab, var(--graph-cat-1) 40%, var(--graph-cat-5))')).toBe(
      `color-mix(in oklab, var(--graph-cat-1, ${lightTheme['cat-1']}) 40%, var(--graph-cat-5, ${lightTheme['cat-5']}))`,
    )
  })

  it('leaves unknown tokens and plain colors alone', () => {
    expect(withFallbacks('var(--graph-unknown)')).toBe('var(--graph-unknown)')
    expect(withFallbacks('#ff0000')).toBe('#ff0000')
  })
})
