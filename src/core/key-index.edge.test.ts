import { describe, expect, it } from 'vitest'
import type { Key } from '../types'
import { KeyIndex } from './key-index'
import { KeyMap } from './key-map'

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

const lone = String.fromCharCode(0xd83d)
const emoji = String.fromCodePoint(0x1f642)

function pool(next: () => number): Key[] {
  const keys: Key[] = [
    '',
    '1',
    1,
    1.5,
    -0,
    0,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    2 ** 31 - 1,
    2 ** 31,
    -(2 ** 31),
    -(2 ** 31) - 1,
    2 ** 53 + 1,
    5e-324,
    1e308,
    'a'.repeat(7),
    'a'.repeat(8),
    'a'.repeat(9),
    'ÿ',
    'ÿ'.repeat(8),
    'ÿ'.repeat(9),
    ' '.repeat(7),
    'Ā'.repeat(2),
    'Ā',
    `abÿĀef${emoji.slice(0, 1)}`,
    emoji,
    emoji.repeat(4),
    `${emoji}ab`,
    lone,
    lone.repeat(8),
    'a b',
    `aaaa${' '}aaaa`,
    `юю${lone}`,
    'ю'.repeat(1),
    '⌷'.repeat(8),
    '\u007f'.repeat(8),
    '\u007f'.repeat(9),
  ]
  const alphabet = ['\u0000', 'þ', 'ÿ', 'A', emoji]
  for (let step = 0; step < 260; step++) {
    const length = Math.floor(next() * 10)
    let text = ''
    for (let at = 0; at < length; at++) text += alphabet[Math.floor(next() * alphabet.length)] ?? ''
    keys.push(text)
    keys.push(Math.floor(next() * 2 ** 32) - 2 ** 31)
    keys.push(next() * 1e6 - 5e5)
    keys.push(Math.round(next() * 2 ** 27))
  }
  return keys
}

describe('KeyIndex edges', () => {
  it('matches a Map over packed, long and mixed keys', () => {
    const next = random(7)
    const keys = pool(next)
    const index = new KeyIndex()
    const reference = new Map<Key, number>()
    for (let step = 0; step < 12_000; step++) {
      const key = keys[Math.floor(next() * keys.length)] ?? 0
      const value = Math.floor(next() * 2 ** 27)
      if (next() < 0.35) {
        expect(index.delete(key)).toBe(reference.get(key) ?? -1)
        reference.delete(key)
      } else if (next() < 0.1) {
        index.reserve(reference.size + Math.floor(next() * 200))
      } else {
        expect(index.add(key, value)).toBe(reference.get(key) ?? -1)
        if (!reference.has(key)) reference.set(key, value)
      }
      if (step % 300 === 0) {
        expect(index.size).toBe(reference.size)
        for (const [known, stored] of reference) expect(index.get(known)).toBe(stored)
      }
    }
    expect(index.size).toBe(reference.size)
    for (const [known, stored] of reference) expect(index.get(known)).toBe(stored)
  })

  it('grows from empty through reserves and deletions', () => {
    const next = random(23)
    const index = new KeyIndex()
    const reference = new Map<Key, number>()
    index.reserve(1)
    for (let step = 0; step < 3_000; step++) {
      const key = `k${Math.floor(next() * 900)}`
      if (next() < 0.3) {
        expect(index.delete(key)).toBe(reference.get(key) ?? -1)
        reference.delete(key)
      } else {
        const value = step
        expect(index.add(key, value)).toBe(reference.get(key) ?? -1)
        if (!reference.has(key)) reference.set(key, value)
      }
      if (step === 1_000) index.reserve(50_000)
      if (step === 2_000) index.reserve(10)
    }
    expect(index.size).toBe(reference.size)
    for (const [known, stored] of reference) expect(index.get(known)).toBe(stored)
  })

  it('stays a Map through shared, opposite and boundary keys', () => {
    const index = new KeyIndex()
    expect(index.add(-0, 1)).toBe(-1)
    expect(index.add(0, 2)).toBe(1)
    expect(index.get(0)).toBe(1)
    expect(index.get(-0)).toBe(1)
    expect(index.delete(-0)).toBe(1)
    expect(index.get(0)).toBe(-1)
    expect(index.add('1', 3)).toBe(-1)
    expect(index.get('1')).toBe(3)
    expect(index.get(1)).toBe(-1)
    expect(index.add('', 4)).toBe(-1)
    expect(index.get('')).toBe(4)
    expect(index.add('ÿ'.repeat(8), 5)).toBe(-1)
    expect(index.add('Ā', 6)).toBe(-1)
    expect(index.add(2 ** 31, 7)).toBe(-1)
    expect(index.add(-(2 ** 31), 8)).toBe(-1)
    expect(index.get('ÿ'.repeat(8))).toBe(5)
    expect(index.get('Ā')).toBe(6)
    expect(index.size).toBe(6)
    expect(index.delete('ÿ'.repeat(9))).toBe(-1)
    expect(index.size).toBe(6)
    expect(index.delete('')).toBe(4)
    expect(index.add('\u007f'.repeat(8), 9)).toBe(-1)
    expect(index.get('\u007f'.repeat(8))).toBe(9)
    expect(index.delete('\u007f'.repeat(8))).toBe(9)
    expect(index.size).toBe(5)
    expect(index.add('top', 2 ** 27 - 1)).toBe(-1)
    expect(index.get('top')).toBe(2 ** 27 - 1)
    expect(() => index.add('over', 2 ** 27)).toThrow(RangeError)
  })
})

describe('KeyMap edges', () => {
  it('matches a Map through sets, overwrites and reads', () => {
    const next = random(31)
    const keys = pool(next)
    const map = new KeyMap<string>()
    const reference = new Map<Key, string>()
    for (let step = 0; step < 6_000; step++) {
      const key = keys[Math.floor(next() * keys.length)] ?? 0
      const value = `v${Math.floor(next() * 1000)}`
      const added = map.set(key, value)
      expect(added).toBe(!reference.has(key))
      reference.set(key, value)
      expect(map.size).toBe(reference.size)
      if (step % 400 === 0) {
        for (const [known, stored] of reference) {
          expect(map.has(known)).toBe(true)
          expect(map.get(known)).toBe(stored)
        }
      }
    }
    for (const [known, stored] of reference) expect(map.get(known)).toBe(stored)
  })

  it('visits its keys in arrival order, rewrites values in place', () => {
    const map = new KeyMap<number>()
    map.set('a', 1)
    map.set('Ā', 2)
    map.set('ÿ'.repeat(8), 3)
    map.set('a', 4)
    map.set('ÿ'.repeat(8), 5)
    const seen: Array<[Key, number, number]> = []
    map.forEach((value, key, position) => {
      seen.push([key, value, position])
    })
    expect(seen).toEqual([
      ['a', 4, 0],
      ['Ā', 2, 1],
      ['ÿ'.repeat(8), 5, 2],
    ])
    map.clear()
    expect(map.size).toBe(0)
    expect(map.get('a')).toBeUndefined()
  })
})
