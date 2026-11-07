import { describe, expect, it } from 'vitest'
import { edges, nodes } from '../marks'
import { createGraphModel } from './graph-model'
import { Positions, placeNodes } from './positions'

type Item = { id: string; x?: number; y?: number; name?: string }
type Link = { id: string; from: string; to: string }

function setup() {
  const model = createGraphModel()
  const positions = new Positions()
  const update = (items: Item[], links: Link[] = []) => {
    model.setMarks([
      nodes(items, { x: 'x', y: 'y' }),
      edges(links, { source: 'from', target: 'to' }),
    ])
    return placeNodes(model, positions, model.flush())
  }
  const at = (key: string) => {
    const index = model.node(key)?.index ?? -1
    return { x: positions.x(index), y: positions.y(index) }
  }
  return { model, positions, update, at }
}

describe('placeNodes', () => {
  it('uses x and y channels when present', () => {
    const { update, at } = setup()
    update([{ id: 'a', x: 5, y: -3 }])
    expect(at('a')).toEqual({ x: 5, y: -3 })
  })

  it('spreads a new graph on a spiral without overlaps', () => {
    const { update, at } = setup()
    update(Array.from({ length: 50 }, (_, i) => ({ id: `n${i}` })))
    const points = Array.from({ length: 50 }, (_, i) => at(`n${i}`))
    let closest = Number.POSITIVE_INFINITY
    for (const [i, a] of points.entries()) {
      for (const b of points.slice(i + 1))
        closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y))
    }
    expect(closest).toBeGreaterThan(16)
  })

  it('places a node added later next to its placed neighbors', () => {
    const { update, at } = setup()
    const base = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}` }))
    update(base)
    const anchor = at('n19')
    update([...base, { id: 'new' }], [{ id: 'e', from: 'n19', to: 'new' }])
    const placed = at('new')
    expect(Math.hypot(placed.x - anchor.x, placed.y - anchor.y)).toBeLessThan(60)
  })

  it('keeps positions of updated nodes', () => {
    const { update, at, positions } = setup()
    update([{ id: 'a' }, { id: 'b' }])
    positions.set(0, 100, 200)
    update([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    expect(at('a')).toEqual({ x: 100, y: 200 })
  })

  it('reports moves when x and y change in the data, without applying them', () => {
    const { update, at, model } = setup()
    update([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0.1 }, { id: 'c' }])
    const moves = update([{ id: 'a', x: 50, y: 5 }, { id: 'b', x: 10, y: 0.1 }, { id: 'c' }])
    expect(moves).toEqual({ indices: [model.node('a')?.index], to: [50, 5], held: [] })
    expect(at('a')).toEqual({ x: 0, y: 0 })
  })

  it('ignores updates that keep x and y, even after a local move', () => {
    const { update, positions, model } = setup()
    update([{ id: 'a', x: 0, y: 0 }])
    positions.set(model.node('a')?.index ?? -1, 99, 99)
    expect(update([{ id: 'a', x: 0, y: 0, name: 'renamed' }]).indices).toEqual([])
    expect(update([{ id: 'a', x: 99, y: 99 }])).toEqual({
      indices: [],
      to: [],
      held: [model.node('a')?.index],
    })
    expect(update([{ id: 'a', x: 1, y: 99 }]).indices).toEqual([model.node('a')?.index])
  })

  it('stops following a node whose x and y become empty, and leaves it in place', () => {
    const { update, positions, model, at } = setup()
    update([{ id: 'a', x: 10, y: 10 }])
    const index = model.node('a')?.index ?? -1
    expect(positions.source[index * 2]).toBe(10)
    expect(update([{ id: 'a' }]).indices).toEqual([])
    expect(positions.source[index * 2]).toBeNaN()
    expect(positions.source[index * 2 + 1]).toBeNaN()
    expect(at('a')).toEqual({ x: 10, y: 10 })
    expect(update([{ id: 'a', x: 10, y: 10 }]).indices).toEqual([])
    expect(positions.source[index * 2]).toBe(10)
  })
})

describe('Positions.changedSince', () => {
  function ranges(positions: Positions, version: number): number[][] {
    const found: number[][] = []
    positions.changedSince(version, (first, last) => found.push([first, last]))
    return found
  }

  it('lists the blocks of 1,024 indices moved since a version, merged when they touch', () => {
    const positions = new Positions()
    positions.reserve(5000)
    expect(ranges(positions, 0)).toEqual([])
    positions.set(10, 1, 2)
    const seen = positions.version
    positions.set(1500, 1, 2)
    positions.set(2100, 1, 2)
    positions.set(4100, 1, 2)
    expect(ranges(positions, seen)).toEqual([
      [1024, 3071],
      [4096, positions.capacity - 1],
    ])
    expect(ranges(positions, 0)).toEqual([
      [0, 3071],
      [4096, positions.capacity - 1],
    ])
    expect(ranges(positions, positions.version)).toEqual([])
  })

  it('lists every index after a rebase and keeps the stamps when it grows', () => {
    const positions = new Positions()
    positions.set(3, 0, 0)
    const seen = positions.version
    positions.rebase(10, 10)
    expect(ranges(positions, seen)).toEqual([[0, positions.capacity - 1]])
    const before = positions.version
    positions.set(2, 4, 4)
    positions.reserve(3000)
    expect(ranges(positions, before)).toEqual([[0, 1023]])
  })
})
