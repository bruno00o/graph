import { describe, expect, it } from 'vitest'
import type { Key } from '../types'
import { KeyMap, NativeKeyMap } from './key-map'

const entries = <V>(map: KeyMap<V> | NativeKeyMap<V>): [Key, V][] => {
  const result: [Key, V][] = []
  map.forEach((value, key) => {
    result.push([key, value])
  })
  return result
}

describe('KeyMap', () => {
  it('keeps the insertion order of a Map', () => {
    const map = new KeyMap<string>()
    expect(map.set('b', 'first')).toBe(true)
    expect(map.set(1, 'second')).toBe(true)
    expect(map.set('a', 'third')).toBe(true)
    expect(map.set('b', 'again')).toBe(false)
    expect(entries(map)).toEqual([
      ['b', 'again'],
      [1, 'second'],
      ['a', 'third'],
    ])
    expect(map.size).toBe(3)
    expect(map.has('a')).toBe(true)
    expect(map.get('z')).toBeUndefined()
  })

  it('visits each key at its insertion position', () => {
    const map = new KeyMap<number>()
    map.reserve(500)
    for (let n = 0; n < 500; n++) map.set(`k${n}`, n)
    const positions: number[] = []
    map.forEach((value, _, position) => {
      expect(position).toBe(value)
      positions.push(position)
    })
    expect(positions).toHaveLength(500)
  })

  it('matches a Map through random additions and clears', () => {
    let state = 3
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 4294967296
    }
    const map = new KeyMap<number>()
    const reference = new Map<Key, number>()
    for (let step = 0; step < 5_000; step++) {
      const n = Math.floor(next() * 400)
      const key = next() < 0.5 ? n : `key ${n}`
      expect(map.set(key, step)).toBe(!reference.has(key))
      reference.set(key, step)
      if (step === 2_500) {
        map.clear()
        reference.clear()
      }
    }
    expect(entries(map)).toEqual([...reference])
  })
})

describe('NativeKeyMap', () => {
  it('sets, deletes and visits in insertion order without positions', () => {
    const map = new NativeKeyMap<string>()
    map.set('a', 'first')
    map.set(2, 'second')
    map.set('a', 'again')
    expect(map.delete(2)).toBe(true)
    expect(map.delete(2)).toBe(false)
    const positions: number[] = []
    map.forEach((_, __, position) => {
      positions.push(position)
    })
    expect(entries(map)).toEqual([['a', 'again']])
    expect(positions).toEqual([-1])
  })
})
