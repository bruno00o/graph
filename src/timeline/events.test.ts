import { describe, expect, it } from 'vitest'
import { toAccessor } from '../core/accessor'
import { EventCounts, type EventReaders } from './events'

interface Row {
  readonly at: number | Date | null
  readonly type?: string | number
}

const readers: EventReaders<Row> = {
  time: toAccessor<Row, unknown>('at'),
  kind: toAccessor<Row, unknown>('type'),
}

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function rows(count: number, next: () => number): Row[] {
  return Array.from({ length: count }, () => ({
    at: Math.floor(next() * 1000),
    type: ['a', 'b', 'c'][Math.floor(next() * 3)] ?? 'a',
  }))
}

function naive(data: readonly Row[], kind: string, from: number, to: number): number {
  return data.filter((row) => row.type === kind && Number(row.at) >= from && Number(row.at) < to)
    .length
}

describe('EventCounts', () => {
  it('counts events by kind in a bin, from start included to end left out', () => {
    const data = rows(500, random(7))
    const counts = new EventCounts<Row>()
    counts.set(data, readers, [])
    for (let from = -10; from < 1010; from += 37) {
      for (const width of [1, 20, 200]) {
        counts.kinds.forEach((kind, id) => {
          expect(counts.count(id, from, from + width)).toBe(naive(data, kind, from, from + width))
        })
      }
    }
  })

  it('reads only the items added when the new array starts with the previous one', () => {
    const next = random(11)
    const data = rows(300, next)
    const counts = new EventCounts<Row>()
    counts.set(data, readers, [])
    const longer = [...data, ...rows(40, next), { at: 5, type: 'd' }]
    expect(counts.set(longer, readers, [])).toBe(true)
    const fresh = new EventCounts<Row>()
    fresh.set(longer, readers, [])
    expect(counts.kinds).toEqual(fresh.kinds)
    expect(counts.times).toEqual(fresh.times)
    expect(counts.read(0, 1000)).toEqual(fresh.read(0, 1000))
    expect(counts.set(longer, readers, [])).toBe(false)
    const shorter = longer.slice(10)
    counts.set(shorter, readers, [])
    const again = new EventCounts<Row>()
    again.set(shorter, readers, [])
    expect(counts.times).toEqual(again.times)
  })

  it('orders kinds as listed, then as the events give them, and skips invalid times', () => {
    const counts = new EventCounts<Row>()
    counts.set(
      [
        { at: 3, type: 'b' },
        { at: null, type: 'x' },
        { at: new Date(4), type: 2 },
        { at: 1 },
        { at: Number.NaN, type: 'y' },
      ],
      readers,
      ['z', 'b'],
    )
    expect(counts.kinds).toEqual(['z', 'b', '2', ''])
    expect(counts.times.map((times) => [...times])).toEqual([[], [3], [4], [1]])
    expect(counts.first()).toBe(1)
    expect(counts.last()).toBe(5)
  })

  it('finds the next and previous moments of the kinds shown, and reads them in time order', () => {
    const data: Row[] = [
      { at: 10, type: 'a' },
      { at: 30, type: 'b' },
      { at: 20, type: 'b' },
      { at: 20, type: 'a' },
      { at: 40, type: 'a' },
    ]
    const counts = new EventCounts<Row>()
    counts.set(data, readers, [])
    expect(counts.after(10)).toBe(20)
    expect(counts.after(20)).toBe(30)
    expect(counts.before(30)).toBe(20)
    expect(counts.after(40)).toBe(Number.POSITIVE_INFINITY)
    expect(counts.read(20, 20)).toEqual([data[2], data[3]])
    expect(counts.read(10, 31)).toEqual([data[0], data[2], data[3], data[1]])
    counts.hide(new Set(['b']))
    expect(counts.after(20)).toBe(40)
    expect(counts.read(10, 31)).toEqual([data[0], data[3]])
  })
})
