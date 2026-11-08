import { describe, expect, it } from 'vitest'
import { sameOptions } from './same-options'

function plainNull(fields: Record<string, unknown>): object {
  return Object.assign(Object.create(null), fields)
}

describe('sameOptions edges', () => {
  it('stops at four levels, arrays included', () => {
    expect(sameOptions({ list: [[[1]]] }, { list: [[[1]]] })).toBe(true)
    expect(sameOptions({ list: [[[[1]]]] }, { list: [[[[1]]]] })).toBe(true)
    expect(sameOptions({ list: [[[[[1]]]]] }, { list: [[[[[1]]]]] })).toBe(false)
    expect(sameOptions({ list: [[[[1]]]] }, { list: [[[[2]]]] })).toBe(false)
    expect(sameOptions({ a: { b: { c: { d: 1 } } } }, { a: { b: { c: { d: 1 } } } })).toBe(true)
    expect(
      sameOptions({ a: { b: { c: { d: { e: 1 } } } } }, { a: { b: { c: { d: { e: 1 } } } } }),
    ).toBe(true)
    expect(
      sameOptions(
        { a: { b: { c: { d: { e: { f: 1 } } } } } },
        { a: { b: { c: { d: { e: { f: 1 } } } } } },
      ),
    ).toBe(false)
    expect(sameOptions({ a: { b: { c: { d: [1] } } } }, { a: { b: { c: { d: [1] } } } })).toBe(true)
    expect(
      sameOptions({ a: { b: { c: { d: [1, [2]] } } } }, { a: { b: { c: { d: [1, [2]] } } } }),
    ).toBe(false)
  })

  it('accepts objects without a prototype as plain', () => {
    expect(sameOptions(plainNull({ a: 1 }), plainNull({ a: 1 }))).toBe(true)
    expect(sameOptions(plainNull({ a: 1 }), { a: 1 })).toBe(true)
    expect(sameOptions({ nested: plainNull({ a: 1 }) }, { nested: { a: 1 } })).toBe(true)
    expect(sameOptions(plainNull({ a: 1 }), plainNull({ a: 2 }))).toBe(false)
  })

  it('leaves dates, boxed values and class instances to identity', () => {
    const date = new Date(0)
    const twin = new Date(0)
    expect(sameOptions({ when: date }, { when: date })).toBe(true)
    expect(sameOptions({ when: date }, { when: twin })).toBe(false)
    expect(sameOptions({ when: [date] }, { when: [date] })).toBe(true)
    expect(sameOptions({ when: [date] }, { when: [twin] })).toBe(false)
    class Box {
      readonly value = 1
    }
    class Crate extends Box {}
    const box = new Box()
    expect(sameOptions({ box }, { box })).toBe(true)
    expect(sameOptions({ box: new Box() }, { box: new Box() })).toBe(false)
    expect(sameOptions({ box: new Box() }, { box: new Crate() })).toBe(false)
    expect(sameOptions({ count: new Number(3) }, { count: 3 })).toBe(false)
    expect(sameOptions({ at: plainNull({ x: 1 }) }, { at: box })).toBe(false)
  })

  it('leaves functions to identity at every depth', () => {
    const read = () => 1
    expect(sameOptions({ size: read }, { size: read })).toBe(true)
    expect(
      sameOptions({ ends: { source: { color: read } } }, { ends: { source: { color: read } } }),
    ).toBe(true)
    expect(
      sameOptions({ ends: { source: { color: read } } }, { ends: { source: { color: () => 1 } } }),
    ).toBe(false)
  })

  it('counts undefined as absent at the top and inside', () => {
    expect(sameOptions({ a: undefined }, {})).toBe(true)
    expect(sameOptions({ a: { b: undefined } }, { a: {} })).toBe(true)
    expect(sameOptions({ a: [undefined] }, { a: [] })).toBe(false)
    expect(sameOptions({ a: [undefined] }, { a: [null] })).toBe(false)
    expect(sameOptions({ a: undefined, b: 1 }, { b: 1 })).toBe(true)
    expect(sameOptions({ a: null }, {})).toBe(false)
  })

  it('skips only the top-level keys set apart', () => {
    const ignored = new Set(['merge', 'aggregate', 'scales'])
    expect(
      sameOptions(
        { size: 1, merge: { min: 2 }, aggregate: { width: () => 1 }, scales: { size: {} } },
        { size: 1 },
        ignored,
      ),
    ).toBe(true)
    expect(
      sameOptions(
        { size: 1, merge: { min: 2 }, aggregate: { width: () => 1 }, scales: { size: {} } },
        { size: 2 },
        ignored,
      ),
    ).toBe(false)
    expect(
      sameOptions({ ends: { scales: { a: 1 } } }, { ends: { scales: { b: 2 } } }, ignored),
    ).toBe(false)
    expect(sameOptions({ merge: undefined }, {}, ignored)).toBe(true)
    expect(sameOptions({ aggregate: 1 }, {}, ignored)).toBe(true)
  })

  it('compares array numbers and values, holes included', () => {
    expect(sameOptions({ list: [1, 2, 3] }, { list: [1, 2, 3] })).toBe(true)
    expect(sameOptions({ list: [1, 2, 3] }, { list: [3, 2, 1] })).toBe(false)
    expect(sameOptions({ list: [0] }, { list: [-0] })).toBe(false)
    expect(sameOptions({ size: Number.NaN }, { size: Number.NaN })).toBe(true)
    const sparse = [1, 2]
    delete sparse[0]
    expect(sameOptions({ list: sparse }, { list: [undefined, 2] })).toBe(true)
    expect(sameOptions({ list: [] }, { list: {} })).toBe(false)
    expect(sameOptions({ list: [{ a: 1 }] }, { list: [{ a: 1 }] })).toBe(true)
  })
})
