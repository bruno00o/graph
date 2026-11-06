import { describe, expect, it } from 'vitest'
import { EdgeColumns } from './columns'
import { laneBend } from './edge-curve'
import { createEdgeLanes } from './edge-lanes'

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
      const dirty = new Set<number>()
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
})
