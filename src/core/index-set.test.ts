import { describe, expect, it } from 'vitest'
import { IndexSet } from './index-set'

describe('IndexSet', () => {
  it('keeps each index once, in insertion order, and grows past its first capacity', () => {
    const set = new IndexSet()
    const added = [5, 3, 5, 100, 3, 0, 4000, 100]
    for (const index of added) set.add(index)
    expect(set.size).toBe(5)
    expect(Array.from(set.indices())).toEqual([5, 3, 100, 0, 4000])
    expect([...set]).toEqual([5, 3, 100, 0, 4000])
    expect(set.has(4000)).toBe(true)
    expect(set.has(4)).toBe(false)
    expect(set.has(1_000_000)).toBe(false)
    for (let index = 0; index < 300; index++) set.add(index * 2)
    expect(set.size).toBe(303)
  })

  it('forgets everything on clear and accepts the same indices again', () => {
    const set = new IndexSet()
    set.add(7)
    set.add(9)
    set.clear()
    expect(set.size).toBe(0)
    expect(set.has(7)).toBe(false)
    set.add(9)
    set.add(7)
    expect(Array.from(set.indices())).toEqual([9, 7])
  })
})
