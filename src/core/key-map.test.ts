import { describe, expect, it } from 'vitest'
import type { Key } from '../types'
import { KeyMap } from './key-map'

const entries = <V>(map: KeyMap<V>): [Key, V][] => {
  const result: [Key, V][] = []
  map.forEach((value, key) => {
    result.push([key, value])
  })
  return result
}
const keys = <V>(map: KeyMap<V>): Key[] => entries(map).map(([key]) => key)

describe('KeyMap', () => {
  it('keeps the insertion order of a Map', () => {
    const map = new KeyMap<string>()
    expect(map.set('b', 'first')).toBe(true)
    expect(map.set(1, 'second')).toBe(true)
    expect(map.set('a', 'third')).toBe(true)
    expect(map.set('b', 'again')).toBe(false)
    expect(map.delete(1)).toBe(true)
    expect(map.delete(1)).toBe(false)
    map.set(1, 'back')
    expect(entries(map)).toEqual([
      ['b', 'again'],
      ['a', 'third'],
      [1, 'back'],
    ])
    expect(keys(map)).toEqual(['b', 'a', 1])
    expect(map.size).toBe(3)
    expect(map.has('a')).toBe(true)
    expect(map.get('z')).toBeUndefined()
  })

  it('stays dense until a deletion and compacts in order', () => {
    const map = new KeyMap<number>()
    for (let n = 0; n < 500; n++) map.set(`k${n}`, n)
    expect(map.dense).toBe(true)
    const positions: number[] = []
    map.forEach((_, __, position) => {
      positions.push(position)
    })
    expect(positions).toEqual(positions.map((_, at) => at))
    for (let n = 0; n < 500; n += 2) map.delete(`k${n}`)
    expect(map.size).toBe(250)
    expect(keys(map)).toEqual(Array.from({ length: 250 }, (_, at) => `k${at * 2 + 1}`))
    for (let n = 1; n < 500; n += 2) expect(map.get(`k${n}`)).toBe(n)
  })

  it('matches a Map through random operations', () => {
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
      if (next() < 0.45) expect(map.delete(key)).toBe(reference.delete(key))
      else {
        expect(map.set(key, step)).toBe(!reference.has(key))
        reference.set(key, step)
      }
    }
    expect(entries(map)).toEqual([...reference])
  })
})
