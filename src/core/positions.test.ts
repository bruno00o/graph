import { describe, expect, it } from 'vitest'
import { edges, nodes } from '../marks'
import { createGraphModel } from './graph-model'
import { type PlacementUnit, Positions, placeNodes, RestoredPositions } from './positions'

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
    expect(moves).toEqual({
      indices: [model.node('a')?.index],
      to: [50, 5],
      held: [],
      restored: [],
    })
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
      restored: [],
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

describe('placing nodes without a position among nodes placed by the data', () => {
  function mixed(unit?: PlacementUnit) {
    const model = createGraphModel()
    const positions = new Positions()
    const update = (items: Item[], links: Link[] = []) => {
      model.setMarks([
        nodes(items, { x: 'x', y: 'y' }),
        edges(links, { source: 'from', target: 'to' }),
      ])
      return placeNodes(model, positions, model.flush(), null, unit)
    }
    const at = (key: string) => {
      const index = model.node(key)?.index ?? -1
      return { x: positions.x(index), y: positions.y(index) }
    }
    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y)
    return { model, positions, update, at, distance }
  }

  it('places a node of the first data near its neighbors placed by the data', () => {
    const { update, at, distance } = mixed()
    update(
      [{ id: 'a', x: 5000, y: 5000 }, { id: 'b', x: 5100, y: 5000 }, { id: 'c' }],
      [
        { id: 'ac', from: 'a', to: 'c' },
        { id: 'cb', from: 'c', to: 'b' },
      ],
    )
    expect(distance(at('c'), { x: 5050, y: 5000 })).toBeLessThan(40)
  })

  it('places a chain of nodes without a position one after the other from the placed node', () => {
    const { update, at, distance } = mixed()
    update(
      [{ id: 'd' }, { id: 'c' }, { id: 'a', x: 5000, y: -3000 }, { id: 'b' }],
      [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'bc', from: 'b', to: 'c' },
        { id: 'cd', from: 'c', to: 'd' },
      ],
    )
    expect(distance(at('b'), at('a'))).toBeLessThan(40)
    expect(distance(at('c'), at('b'))).toBeLessThan(40)
    expect(distance(at('d'), at('c'))).toBeLessThan(40)
  })

  it('places a node without placed neighbors next to the placed node nearest their middle', () => {
    const { update, at, distance } = mixed()
    update([
      { id: 'a', x: 1000, y: 1000 },
      { id: 'b', x: 1100, y: 1000 },
      { id: 'c', x: 1210, y: 1000 },
      { id: 'lone' },
    ])
    expect(distance(at('lone'), at('b'))).toBeLessThan(40)
  })

  it('keeps a group of linked nodes without a position together near the placed nodes', () => {
    const { update, at, distance } = mixed()
    update(
      [{ id: 'a', x: 2000, y: 2000 }, { id: 'p' }, { id: 'q' }, { id: 'r' }],
      [
        { id: 'pq', from: 'p', to: 'q' },
        { id: 'qr', from: 'q', to: 'r' },
      ],
    )
    expect(distance(at('p'), at('a'))).toBeLessThan(40)
    expect(distance(at('q'), at('p'))).toBeLessThan(40)
    expect(distance(at('r'), at('q'))).toBeLessThan(40)
  })

  it('places later arrivals near their neighbors, placed in the same batch or before', () => {
    const { update, at, distance } = mixed()
    const base = [{ id: 'a', x: -800, y: 300 }, { id: 'b' }]
    const links = [{ id: 'ab', from: 'a', to: 'b' }]
    update(base, links)
    update(
      [...base, { id: 'c', x: 900, y: 900 }, { id: 'd' }, { id: 'e' }],
      [...links, { id: 'cd', from: 'c', to: 'd' }, { id: 'be', from: 'b', to: 'e' }],
    )
    expect(distance(at('d'), at('c'))).toBeLessThan(40)
    expect(distance(at('e'), at('b'))).toBeLessThan(40)
  })

  it('sizes the rings with the unit of the node, such as pixels at the zoom of the view', () => {
    const unit: PlacementUnit = (index) => (index === 2 ? 0.001 : 1)
    const { update, at, distance } = mixed(unit)
    update(
      [{ id: 'a', x: 10, y: 10 }, { id: 'w' }, { id: 's' }],
      [
        { id: 'aw', from: 'a', to: 'w' },
        { id: 'as', from: 'a', to: 's' },
      ],
    )
    expect(distance(at('w'), at('a'))).toBeGreaterThan(30)
    expect(distance(at('s'), at('a'))).toBeLessThan(0.1)
    expect(distance(at('s'), at('a'))).toBeGreaterThan(0.01)
  })

  it('counts the nodes placed by the data', () => {
    const { update, positions } = mixed()
    update([{ id: 'a', x: 1, y: 1 }, { id: 'b' }])
    expect(positions.followed).toBe(1)
    update([{ id: 'a' }, { id: 'b', x: 2, y: 2 }, { id: 'c', x: 3, y: 3 }])
    expect(positions.followed).toBe(2)
    update([{ id: 'c', x: 3, y: 3 }])
    expect(positions.followed).toBe(1)
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

describe('restored positions', () => {
  function restoring(entries: Iterable<readonly [string | number, { x: number; y: number }]>) {
    const model = createGraphModel()
    const positions = new Positions()
    const restore = new RestoredPositions(entries)
    const update = (items: Item[], links: Link[] = []) => {
      model.setMarks([
        nodes(items, { x: 'x', y: 'y' }),
        edges(links, { source: 'from', target: 'to' }),
      ])
      return placeNodes(model, positions, model.flush(), restore)
    }
    const at = (key: string) => {
      const index = model.node(key)?.index ?? -1
      return { x: positions.x(index), y: positions.y(index) }
    }
    return { model, positions, restore, update, at }
  }

  it('places arriving nodes where the entries say, flagged as restored', () => {
    const { model, positions, update, at } = restoring([
      ['a', { x: 10, y: 20 }],
      ['b', { x: -4, y: 6 }],
    ])
    const moves = update([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    expect(at('a')).toEqual({ x: 10, y: 20 })
    expect(at('b')).toEqual({ x: -4, y: 6 })
    expect(moves.restored).toEqual([model.node('a')?.index, model.node('b')?.index])
    expect(positions.restored[model.node('a')?.index ?? -1]).toBe(1)
    expect(positions.restored[model.node('c')?.index ?? -1]).toBe(0)
    expect(positions.source[(model.node('a')?.index ?? 0) * 2]).toBeNaN()
  })

  it('lets the positions of the data win', () => {
    const { update, at, restore } = restoring([['a', { x: 10, y: 20 }]])
    const moves = update([{ id: 'a', x: 1, y: 2 }])
    expect(at('a')).toEqual({ x: 1, y: 2 })
    expect(moves.restored).toEqual([])
    expect(restore.size).toBe(0)
  })

  it('places a node with no entry next to its restored neighbors in the same batch', () => {
    const { update, at } = restoring([['a', { x: 1000, y: 1000 }]])
    update([{ id: 'a' }, { id: 'b' }], [{ id: 'ab', from: 'a', to: 'b' }])
    const b = at('b')
    expect(Math.hypot(b.x - 1000, b.y - 1000)).toBeLessThan(100)
  })

  it('uses the spiral when no neighbor is placed', () => {
    const { update, at } = restoring([['a', { x: 1000, y: 1000 }]])
    update([{ id: 'a' }, { id: 'b' }])
    expect(at('b')).toEqual({ x: 0, y: 0 })
  })

  it('uses an entry once, and not for keys that are not strings or numbers or points', () => {
    const entries = [
      ['a', { x: 1, y: 2 }],
      ['b', { x: Number.NaN, y: 2 }],
      [{}, { x: 1, y: 1 }],
      ['c', null],
    ] as unknown as Iterable<readonly [string, { x: number; y: number }]>
    const { update, restore, at } = restoring(entries)
    expect(restore.size).toBe(1)
    expect(restore.skipped).toBe(3)
    update([{ id: 'a' }, { id: 'b' }])
    expect(at('a')).toEqual({ x: 1, y: 2 })
    expect(restore.size).toBe(0)
    update([{ id: 'a' }])
    expect(at('a')).toEqual({ x: 1, y: 2 })
  })

  it('forgets the flag when a node leaves', () => {
    const { model, positions, update } = restoring([['a', { x: 1, y: 2 }]])
    update([{ id: 'a' }])
    const index = model.node('a')?.index ?? -1
    update([])
    expect(positions.restored[index]).toBe(0)
  })
})
