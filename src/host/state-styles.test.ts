import { describe, expect, it } from 'vitest'
import { resolveStyle } from './state-styles'

const colors: string[] = []
const id = (color: string) => {
  const known = colors.indexOf(color)
  if (known >= 0) return known
  colors.push(color)
  return colors.length - 1
}

describe('resolveStyle', () => {
  it('keeps the shared halo for true and none for false', () => {
    expect(resolveStyle({ halo: true }, id)).toMatchObject({ halo: 6, haloColor: undefined })
    expect(resolveStyle({ halo: false }, id)).toMatchObject({ halo: 0, haloColor: undefined })
    expect(resolveStyle({}, id)).toMatchObject({ halo: undefined, haloColor: undefined })
  })

  it('reads the color and width of a halo, the width capped at 255 pixels', () => {
    const own = resolveStyle({ halo: { color: 'var(--graph-cat-2)', width: 12 } }, id)
    expect(own.halo).toBe(12)
    expect(colors[own.haloColor ?? -1]).toBe('var(--graph-cat-2)')
    expect(resolveStyle({ halo: { color: '#f00' } }, id).halo).toBe(6)
    expect(resolveStyle({ halo: { width: 900 } }, id)).toMatchObject({
      halo: 255,
      haloColor: undefined,
    })
    expect(resolveStyle({ halo: { width: 0 } }, id).halo).toBe(0)
  })
})
