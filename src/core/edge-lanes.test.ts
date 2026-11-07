import { describe, expect, it } from 'vitest'
import { EdgeColumns } from './columns'
import { laneBend } from './edge-curve'
import { createEdgeLanes } from './edge-lanes'
import { IndexSet } from './index-set'

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function expected(edges: EdgeColumns, order: number[]): Map<number, number> {
  const pairs = new Map<string, number[]>()
  for (const index of order) {
    const source = edges.source[index] ?? 0
    const target = edges.target[index] ?? 0
    const key = `${Math.min(source, target)}:${Math.max(source, target)}`
    pairs.set(key, [...(pairs.get(key) ?? []), index])
  }
  const bends = new Map<number, number>()
  for (const list of pairs.values()) {
    list.forEach((index, position) => {
      const source = edges.source[index] ?? 0
      const target = edges.target[index] ?? 0
      bends.set(
        index,
        source === target
          ? position
          : Math.fround(laneBend(position, list.length) * (source < target ? 1 : -1)) || 0,
      )
    })
  }
  return bends
}

describe('createEdgeLanes', () => {
  it('matches a naive grouping through links, unlinks, relinks and growth', () => {
    const next = random(11)
    const edges = new EdgeColumns()
    edges.reserve(4_000)
    const lanes = createEdgeLanes()
    const alive: number[] = []
    const free: number[] = Array.from({ length: 4_000 }, (_, index) => 3_999 - index)
    for (let round = 0; round < 40; round++) {
      const dirty = new IndexSet()
      for (let step = 0; step < 150; step++) {
        const roll = next()
        if (roll < 0.55 && free.length > 0) {
          const index = free.pop() ?? 0
          edges.source[index] = Math.floor(next() * 30)
          edges.target[index] = next() < 0.1 ? (edges.source[index] ?? 0) : Math.floor(next() * 30)
          lanes.link(index, edges.source[index] ?? 0, edges.target[index] ?? 0)
          alive.push(index)
        } else if (roll < 0.85 && alive.length > 0) {
          const at = Math.floor(next() * alive.length)
          const [index = 0] = alive.splice(at, 1)
          lanes.unlink(index)
          edges.bend[index] = 0
          free.push(index)
        } else if (alive.length > 0) {
          const at = Math.floor(next() * alive.length)
          const index = alive[at] ?? 0
          const source = edges.source[index] ?? 0
          const before = [source, edges.target[index] ?? 0].sort().join()
          edges.target[index] = Math.floor(next() * 30)
          lanes.link(index, source, edges.target[index] ?? 0)
          if ([source, edges.target[index] ?? 0].sort().join() !== before) {
            alive.splice(at, 1)
            alive.push(index)
          }
        }
      }
      lanes.write(edges, dirty)
      for (const [index, bend] of expected(edges, alive)) {
        expect(edges.bend[index], `edge ${index} in round ${round}`).toBe(bend)
      }
    }
  })

  it('groups the edges of a pair in one band per rank, in rank order, with a gap between bands', () => {
    const edges = new EdgeColumns()
    edges.reserve(8)
    const lanes = createEdgeLanes()
    const slots = [2, 0, 1, 0, 2]
    slots.forEach((slot, index) => {
      edges.slot[index] = slot
      edges.source[index] = 3
      edges.target[index] = 7
      lanes.link(index, 3, 7)
    })
    edges.slot[5] = 1
    edges.source[5] = 4
    edges.target[5] = 4
    lanes.link(5, 4, 4)
    edges.slot[6] = 2
    edges.source[6] = 4
    edges.target[6] = 4
    lanes.link(6, 4, 4)
    lanes.setRanks(Uint16Array.of(1, 0, 2))
    lanes.write(edges, new IndexSet())
    const total = 5 + 2
    const bend = (position: number) => Math.fround(laneBend(position, total))
    expect(edges.bend[2]).toBe(bend(0))
    expect(edges.bend[1]).toBe(bend(2))
    expect(edges.bend[3]).toBe(bend(3))
    expect(edges.bend[0]).toBe(bend(5))
    expect(edges.bend[4]).toBe(bend(6))
    expect([edges.bend[5], edges.bend[6]]).toEqual([0, 2])
    lanes.setRanks(null)
    lanes.write(edges, new IndexSet())
    expect([0, 1, 2, 3, 4].map((index) => edges.bend[index])).toEqual(
      [0, 1, 2, 3, 4].map((position) => Math.fround(laneBend(position, 5))),
    )
  })

  it('keeps a pair of one rank as it was', () => {
    const edges = new EdgeColumns()
    edges.reserve(4)
    const lanes = createEdgeLanes()
    lanes.setRanks(Uint16Array.of(0, 1))
    for (let index = 0; index < 3; index++) {
      edges.slot[index] = 1
      edges.source[index] = 0
      edges.target[index] = 1
      lanes.link(index, 0, 1)
    }
    lanes.write(edges, new IndexSet())
    expect([0, 1, 2].map((index) => edges.bend[index])).toEqual(
      [0, 1, 2].map((position) => Math.fround(laneBend(position, 3))),
    )
  })
})
