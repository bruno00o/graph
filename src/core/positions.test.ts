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
    expect(moves).toEqual({ indices: [model.node('a')?.index], to: [50, 5] })
    expect(at('a')).toEqual({ x: 0, y: 0 })
  })

  it('ignores updates that keep x and y, even after a local move', () => {
    const { update, positions, model } = setup()
    update([{ id: 'a', x: 0, y: 0 }])
    positions.set(model.node('a')?.index ?? -1, 99, 99)
    expect(update([{ id: 'a', x: 0, y: 0, name: 'renamed' }]).indices).toEqual([])
    expect(update([{ id: 'a', x: 99, y: 99 }]).indices).toEqual([])
    expect(update([{ id: 'a', x: 1, y: 99 }]).indices).toEqual([model.node('a')?.index])
  })
})
