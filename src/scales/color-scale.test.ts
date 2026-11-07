import { describe, expect, it } from 'vitest'
import { resolveColorScale } from './color-scale'

describe('resolveColorScale', () => {
  it('assigns theme categories in order of first appearance', () => {
    const scale = resolveColorScale(undefined)
    expect(scale.map('b', null)).toBe('var(--graph-cat-1)')
    expect(scale.map('a', null)).toBe('var(--graph-cat-2)')
    expect(scale.map('b', null)).toBe('var(--graph-cat-1)')
    expect(scale.map(null, null)).toBeNull()
  })

  it('follows an explicit domain and cycles through the range', () => {
    const scale = resolveColorScale({ domain: ['x', 'y'], range: ['red', 'blue'] })
    expect(scale.map('y', null)).toBe('blue')
    expect(scale.map('z', null)).toBe('red')
    expect(scale.kind).toBe('categorical')
    expect(scale.listed).toEqual(['x', 'y'])
    expect([...scale.categories()]).toEqual(['x', 'y', 'z'])
  })

  it('interpolates sequential values between stops', () => {
    const scale = resolveColorScale({ type: 'sequential', range: ['white', 'black'] })
    expect(scale.needsExtent).toBe(true)
    expect(scale.map(0, [0, 10])).toBe('white')
    expect(scale.map(10, [0, 10])).toBe('black')
    expect(scale.map(2.5, [0, 10])).toBe('color-mix(in oklab, white, black 25%)')
    expect(scale.map('a', [0, 10])).toBeNull()
  })

  it('splits several stops into segments', () => {
    const scale = resolveColorScale({
      type: 'sequential',
      domain: [0, 1],
      range: ['red', 'green', 'blue'],
    })
    expect(scale.needsExtent).toBe(false)
    expect(scale.kind).toBe('sequential')
    expect(scale.domain).toEqual([0, 1])
    expect(scale.map(0.5, null)).toBe('green')
    expect(scale.map(0.75, null)).toBe('color-mix(in oklab, green, blue 50%)')
  })

  it('accepts a function', () => {
    const scale = resolveColorScale((value) => (value === 'on' ? 'green' : 'gray'))
    expect(scale.map('on', null)).toBe('green')
    expect(scale.map(undefined, null)).toBeNull()
    expect(scale.kind).toBe('function')
    expect([...scale.categories()]).toEqual([])
  })

  it('ignores a function result that is not a color', () => {
    const scale = resolveColorScale((value) => value as string)
    expect(scale.map(3, null)).toBeNull()
    expect(scale.map('', null)).toBeNull()
    expect(scale.map('red', null)).toBe('red')
  })

  it('gives the place of a forgotten category to the next new one', () => {
    const scale = resolveColorScale({ domain: ['x'], range: ['red', 'green', 'blue'] })
    expect(scale.map('a', null)).toBe('green')
    expect(scale.map('b', null)).toBe('blue')
    scale.forget('a')
    scale.forget('x')
    expect(scale.size()).toBe(2)
    expect(scale.map('c', null)).toBe('green')
    expect(scale.map('x', null)).toBe('red')
    expect([...scale.categories()]).toEqual(['x', 'b', 'c'])
  })
})
