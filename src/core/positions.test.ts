import { describe, expect, it } from 'vitest'
import { edges, nodes } from '../marks'
import { createGraphModel } from './graph-model'
import { Positions, placeNodes } from './positions'

type Item = { id: string; x?: number; y?: number }
type Link = { id: string; from: string; to: string }

function setup() {
  const model = createGraphModel()
  const positions = new Positions()
  const update = (items: Item[], links: Link[] = []) => {
    model.setMarks([
      nodes(items, { x: 'x', y: 'y' }),
      edges(links, { source: 'from', target: 'to' }),
    ])
    const changes = model.flush()
    placeNodes(model, positions, changes)
    return changes
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
})
