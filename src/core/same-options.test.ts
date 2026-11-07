import { describe, expect, it } from 'vitest'
import { sameOptions } from './same-options'

describe('sameOptions', () => {
  it('compares plain objects and arrays by content', () => {
    expect(
      sameOptions({ label: { color: 'red', size: 12 } }, { label: { size: 12, color: 'red' } }),
    ).toBe(true)
    expect(sameOptions({ label: { color: 'red' } }, { label: { color: 'blue' } })).toBe(false)
    expect(sameOptions({ image: { src: 'a.svg' } }, { image: { src: 'a.svg', scale: 1 } })).toBe(
      false,
    )
    expect(sameOptions({ list: [1, 2] }, { list: [1, 2] })).toBe(true)
    expect(sameOptions({ list: [1, 2] }, { list: [1, 2, 3] })).toBe(false)
    expect(sameOptions({ list: [1] }, { list: { 0: 1 } })).toBe(false)
    expect(sameOptions({ value: Number.NaN }, { value: Number.NaN })).toBe(true)
  })

  it('reaches the nested ends of an edge', () => {
    const ends = () => ({ split: 0.4, source: { color: 'kind', label: { text: 'from' } } })
    expect(sameOptions({ ends: ends() }, { ends: ends() })).toBe(true)
    expect(
      sameOptions(
        { ends: ends() },
        { ends: { split: 0.4, source: { color: 'kind', label: { text: 'to' } } } },
      ),
    ).toBe(false)
  })

  it('compares functions and other objects by identity', () => {
    const read = () => 1
    expect(sameOptions({ size: read }, { size: read })).toBe(true)
    expect(sameOptions({ size: () => 1 }, { size: () => 1 })).toBe(false)
    expect(sameOptions({ label: { color: () => 'red' } }, { label: { color: () => 'red' } })).toBe(
      false,
    )
    expect(sameOptions({ at: new Date(0) }, { at: new Date(0) })).toBe(false)
    class Box {
      readonly value = 1
    }
    expect(sameOptions({ box: new Box() }, { box: new Box() })).toBe(false)
  })

  it('compares by identity past four nested levels', () => {
    const deep = () => ({ a: { b: { c: { d: { e: { f: 1 } } } } } })
    const shallower = () => ({ a: { b: { c: { d: { e: 1 } } } } })
    expect(sameOptions(deep(), deep())).toBe(false)
    expect(sameOptions(shallower(), shallower())).toBe(true)
  })

  it('counts a property set to undefined as absent at every level', () => {
    expect(
      sameOptions({ label: { color: 'red', size: undefined } }, { label: { color: 'red' } }),
    ).toBe(true)
    expect(sameOptions({ a: 1, b: undefined }, { a: 1, c: 2 })).toBe(false)
    expect(sameOptions({ label: { color: undefined } }, { label: { color: null } })).toBe(false)
  })

  it('skips the ignored keys of the options only', () => {
    const ignored = new Set(['merge'])
    expect(sameOptions({ a: 1, merge: { min: 2 } }, { a: 1 }, ignored)).toBe(true)
    expect(sameOptions({ a: { merge: 1 } }, { a: { merge: 2 } }, ignored)).toBe(false)
  })
})
