import { describe, expect, it } from 'vitest'
import type { Key } from '../types'
import { KeyIndex } from './key-index'

describe('KeyIndex', () => {
  it('keeps keys of every shape apart', () => {
    const index = new KeyIndex()
    const keys: Key[] = [
      0,
      1,
      -1,
      '1',
      '',
      'a',
      'abcdefgh',
      'abcdefghi',
      'été',
      'nœud',
      '日本',
      2 ** 31,
      -(2 ** 31),
      2 ** 40,
      1.5,
      Number.MAX_VALUE,
      Number.MIN_VALUE,
      'a\u0000',
      '\u0000',
    ]
    keys.forEach((key, value) => {
      expect(index.add(key, value)).toBe(-1)
    })
    keys.forEach((key, value) => {
      expect(index.get(key)).toBe(value)
    })
    expect(index.size).toBe(keys.length)
    expect(index.get(-0)).toBe(0)
    expect(index.get('0')).toBe(-1)
    expect(index.get('a\u0000\u0000')).toBe(-1)
    expect(index.get(2.5)).toBe(-1)
  })

  it('returns the stored value instead of replacing it', () => {
    const index = new KeyIndex()
    expect(index.add('a', 3)).toBe(-1)
    expect(index.add('a', 4)).toBe(3)
    expect(index.add('a long key that is not packed', 5)).toBe(-1)
    expect(index.add('a long key that is not packed', 6)).toBe(5)
    expect(index.get('a')).toBe(3)
  })

  it('matches a Map through random additions and deletions', () => {
    let state = 11
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 4294967296
    }
    const shapes = [
      (n: number) => n,
      (n: number) => `n${n}`,
      (n: number) => `key-with-a-long-prefix-${n}`,
      (n: number) => n + 0.25,
      (n: number) => `é${n}`,
    ]
    const index = new KeyIndex()
    const reference = new Map<Key, number>()
    for (let step = 0; step < 20_000; step++) {
      const shape = shapes[Math.floor(next() * shapes.length)] ?? shapes[0]
      const key = shape?.(Math.floor(next() * 3_000)) ?? 0
      if (next() < 0.4) {
        expect(index.delete(key)).toBe(reference.get(key) ?? -1)
        reference.delete(key)
      } else {
        const value = Math.floor(next() * 1_000_000)
        expect(index.add(key, value)).toBe(reference.get(key) ?? -1)
        if (!reference.has(key)) reference.set(key, value)
      }
      if (step % 1_000 === 0) {
        expect(index.size).toBe(reference.size)
        for (const [known, value] of reference) expect(index.get(known)).toBe(value)
      }
    }
    expect(index.size).toBe(reference.size)
    for (const [known, value] of reference) expect(index.get(known)).toBe(value)
  })

  it('copies another index', () => {
    const source = new KeyIndex()
    source.add('a', 1)
    source.add('a long key that is not packed', 2)
    const copy = new KeyIndex()
    copy.add('b', 9)
    copy.copy(source)
    source.add('c', 3)
    expect(copy.get('a')).toBe(1)
    expect(copy.get('a long key that is not packed')).toBe(2)
    expect(copy.get('b')).toBe(-1)
    expect(copy.get('c')).toBe(-1)
    expect(copy.size).toBe(2)
  })

  it('reserves room before the first key', () => {
    const index = new KeyIndex()
    index.reserve(10_000)
    for (let n = 0; n < 10_000; n++) index.add(`k${n}`, n)
    for (let n = 0; n < 10_000; n++) expect(index.get(`k${n}`)).toBe(n)
    index.clear()
    expect(index.size).toBe(0)
    expect(index.get('k1')).toBe(-1)
  })
})
