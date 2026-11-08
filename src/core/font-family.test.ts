import { describe, expect, it } from 'vitest'
import { familyName, usesFamily } from './font-family'

describe('font families', () => {
  it('compares names without quotes, spaces or case', () => {
    expect(familyName(' "Late Sans" ')).toBe('late sans')
    expect(familyName("'Mono'")).toBe('mono')
  })

  it('finds a loaded family in a family list', () => {
    const loaded = new Set(['late sans'])
    expect(usesFamily('Late Sans, system-ui, sans-serif', loaded)).toBe(true)
    expect(usesFamily('"Late Sans"', loaded)).toBe(true)
    expect(usesFamily('system-ui, sans-serif', loaded)).toBe(false)
    expect(usesFamily('anything', null)).toBe(true)
  })
})
