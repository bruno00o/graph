import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraph } from '../headless'
import { edges, nodes } from '../marks'
import { pair, ways } from './index'

interface Item {
  readonly id: string
  readonly hub: boolean
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [
  { id: 'e1', hub: true },
  { id: 'e2', hub: true },
  { id: 'a', hub: false },
  { id: 'b', hub: false },
  { id: 'c', hub: false },
]

const links: Link[] = [
  { id: 'e1a', from: 'e1', to: 'a' },
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'be2', from: 'b', to: 'e2' },
  { id: 'bc', from: 'b', to: 'c' },
]

describe('ways on a graph without a page', () => {
  it('runs on a createGraph graph, and empties after destroy', () => {
    const graph = createGraph({
      definition: defineGraph({
        marks: [edges<Link>(links, { source: 'from', target: 'to' }), nodes<Item>(items)],
      }),
    })
    const options = { exits: (item: Item) => item.hub }
    const found = ways(graph, options)
    expect(found.exits).toEqual(['e1', 'e2'])
    expect(found.two).toEqual(['a', 'b'])
    expect(found.one).toEqual([{ key: 'c', through: 'b' }])
    expect(found.chains).toEqual([
      { nodes: ['a', 'b'], edges: ['e1a', 'ab', 'be2'], ends: ['e1', 'e2'], covered: true },
    ])
    expect(ways(graph, options)).toBe(found)
    const two = pair(graph, 'a', { exits: ['e1', 'e2'] })
    expect(two?.map((path) => [path.nodes, path.cost])).toEqual([
      [['a', 'e1'], 1],
      [['a', 'b', 'e2'], 2],
    ])
    graph.destroy()
    const dead = ways(graph, { exits: ['e1', 'e2'] })
    expect(dead).toEqual({
      exits: [],
      two: [],
      one: [],
      none: [],
      chains: [],
      weak: { nodes: [], edges: [] },
    })
    expect(Object.isFrozen(dead)).toBe(true)
    expect(pair(graph, 'a', { exits: ['e1', 'e2'] })).toBeNull()
  })
})
