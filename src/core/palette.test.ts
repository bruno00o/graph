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

  it('gives the id of a color no longer used to the next new color', () => {
    const palette = new Palette()
    const red = palette.use('red')
    expect(palette.use('red')).toBe(red)
    palette.drop(red)
    expect(palette.use('blue')).toBe(red + 1)
    palette.drop(red)
    expect(palette.use('green')).toBe(red)
    expect(palette.colors).toEqual(['green', 'blue'])
  })

  it('never gives away a pinned color', () => {
    const palette = new Palette()
    const pinned = palette.id('ink')
    palette.drop(palette.use('ink'))
    palette.drop(pinned)
    expect(palette.use('red')).not.toBe(pinned)
    expect(palette.colors[pinned]).toBe('ink')
  })

  it('swaps a color only when it changes', () => {
    const palette = new Palette()
    const fallback = palette.id('ink')
    const red = palette.swap(fallback, 'red', fallback)
    expect(palette.swap(red, 'red', fallback)).toBe(red)
    expect(palette.swap(red, null, fallback)).toBe(fallback)
    expect(palette.swap(fallback, 'blue', fallback)).toBe(red)
    expect(palette.colors[red]).toBe('blue')
  })

  it('lists the colors set since a version', () => {
    const palette = new Palette()
    palette.use('red')
    const version = palette.version
    palette.drop(palette.use('blue'))
    palette.use('green')
    const changed: [number, string][] = []
    palette.changed(version, (id, color) => changed.push([id, color]))
    expect(changed).toEqual([[1, 'green']])
  })
})
