import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { defineGraph } from './define-graph'
import { edges, nodes } from './marks'
import { createPathFinder } from './paths'
import type { EdgeMark, GraphPath, Key, NodeMark, PathDirection, PathOptions } from './types'

interface Item {
  readonly id: string
  readonly open?: boolean
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly length?: number | null
}

function finder(items: readonly Item[], links: readonly Link[]) {
  return createPathFinder(
    defineGraph({
      marks: [nodes<Item>(items), edges<Link>(links, { source: 'from', target: 'to' })],
    }),
  )
}

const ids = (...keys: string[]): Item[] => keys.map((id) => ({ id }))

function link(from: string, to: string, length: number | null = null): Link {
  return { id: `${from}${to}${length ?? ''}`, from, to, length }
}

const directions: readonly PathDirection[] = ['both', 'forward', 'backward']

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function reference(
  count: number,
  links: readonly Link[],
  from: number,
  direction: PathDirection,
  weighted: boolean,
): number[] {
  const dist = new Array<number>(count).fill(Number.POSITIVE_INFINITY)
  dist[from] = 0
  for (let round = 0; round < count; round++) {
    let changed = false
    for (const { from: a, to: b, length } of links) {
      const step = weighted ? (length ?? Number.NaN) : 1
      if (!(step >= 0)) continue
      const u = Number(a.slice(1))
      const v = Number(b.slice(1))
      if (direction !== 'backward' && (dist[u] ?? 0) + step < (dist[v] ?? 0)) {
        dist[v] = (dist[u] ?? 0) + step
        changed = true
      }
      if (direction !== 'forward' && (dist[v] ?? 0) + step < (dist[u] ?? 0)) {
        dist[u] = (dist[v] ?? 0) + step
        changed = true
      }
    }
    if (!changed) break
  }
  return dist
}

function checkPath(
  path: GraphPath,
  links: readonly Link[],
  direction: PathDirection,
  weighted: boolean,
): void {
  const byId = new Map(links.map((each) => [each.id, each]))
  expect(path.edges).toHaveLength(path.nodes.length - 1)
  expect(path.costs).toHaveLength(path.nodes.length)
  let total = 0
  path.edges.forEach((key, at) => {
    const edge = byId.get(String(key))
    if (!edge) throw new Error(`unknown edge ${key}`)
    const a = path.nodes[at]
    const b = path.nodes[at + 1]
    const forward = edge.from === a && edge.to === b
    const backward = edge.from === b && edge.to === a
    const allowed = { both: forward || backward, forward, backward }
    expect(allowed[direction]).toBe(true)
    total += weighted ? (edge.length ?? 0) : 1
    expect(path.costs[at + 1]).toBeCloseTo(total)
  })
  expect(path.cost).toBeCloseTo(total)
}

describe('createPathFinder', () => {
  const items = ids('a', 'b', 'c', 'd', 'e', 'f')
  const links = [
    link('a', 'b', 1),
    link('b', 'c', 1),
    link('c', 'd', 1),
    link('a', 'e', 10),
    link('e', 'd', 1),
  ]

  it('finds the path with the fewest edges, its edges and its costs', () => {
    const paths = finder(items, links)
    expect(paths.shortest('a', 'd')).toEqual({
      nodes: ['a', 'e', 'd'],
      edges: ['ae10', 'ed1'],
      costs: [0, 1, 2],
      cost: 2,
    })
  })

  it('weighs edges by a field or a function', () => {
    const paths = finder(items, links)
    const byField = paths.shortest('a', 'd', { weight: 'length' })
    expect(byField?.nodes).toEqual(['a', 'b', 'c', 'd'])
    expect(byField?.cost).toBe(3)
    expect(byField?.costs).toEqual([0, 1, 2, 3])
    const byFunction = paths.shortest('a', 'd', { weight: (edge) => (edge.length ?? 0) * 2 })
    expect(byFunction?.cost).toBe(6)
  })

  it('follows the direction of the edges only when asked', () => {
    const paths = finder(items, links)
    expect(paths.shortest('d', 'a')?.nodes).toEqual(['d', 'e', 'a'])
    expect(paths.shortest('d', 'a', { direction: 'both' })?.nodes).toEqual(['d', 'e', 'a'])
    expect(paths.shortest('d', 'a', { direction: 'forward' })).toBeNull()
    expect(paths.shortest('a', 'd', { direction: 'forward' })?.nodes).toEqual(['a', 'e', 'd'])
  })

  it('walks the edges backward, from target to source', () => {
    const paths = finder(items, links)
    expect(paths.shortest('a', 'd', { direction: 'backward' })).toBeNull()
    expect(paths.shortest('d', 'a', { direction: 'backward' })).toEqual({
      nodes: ['d', 'e', 'a'],
      edges: ['ed1', 'ae10'],
      costs: [0, 1, 2],
      cost: 2,
    })
    const up = paths.reach('d', { direction: 'backward' })
    expect(new Set(up.nodes)).toEqual(new Set(['d', 'c', 'e', 'b', 'a']))
    expect(new Set(up.edges)).toEqual(new Set(['ab1', 'bc1', 'cd1', 'ae10', 'ed1']))
    expect(paths.reach('a', { direction: 'backward' }).nodes).toEqual(['a'])
    expect(paths.reach('c', { direction: 'backward', maxCost: 1 })).toEqual({
      nodes: ['c', 'b'],
      costs: [0, 1],
      edges: ['bc1'],
    })
  })

  it('refuses an unknown direction', () => {
    const paths = finder(items, links)
    const direction = 'up' as PathDirection
    expect(() => paths.shortest('a', 'd', { direction })).toThrow(TypeError)
  })

  it('returns a single node from a node to itself, and null for unknown or cut-off nodes', () => {
    const paths = finder(items, links)
    expect(paths.shortest('a', 'a')).toEqual({ nodes: ['a'], edges: [], costs: [0], cost: 0 })
    expect(paths.shortest('a', 'zz')).toBeNull()
    expect(paths.shortest('a', 'f')).toBeNull()
  })

  it('skips edges without a finite weight and throws on a negative one', () => {
    const paths = finder(items, [...links.slice(0, 4), link('e', 'd', null)])
    expect(paths.shortest('a', 'd', { weight: 'length' })?.nodes).toEqual(['a', 'b', 'c', 'd'])
    expect(paths.shortest('e', 'd', { weight: 'length' })?.nodes).toEqual(['e', 'a', 'b', 'c', 'd'])
    const negative = finder(items, [link('a', 'b', -1)])
    expect(() => negative.shortest('a', 'b', { weight: 'length' })).toThrow(RangeError)
  })

  it('takes the lightest of parallel edges', () => {
    const paths = finder(ids('a', 'b'), [link('a', 'b', 5), link('b', 'a', 2), link('a', 'b', 3)])
    expect(paths.shortest('a', 'b', { weight: 'length' })?.edges).toEqual(['ba2'])
    expect(paths.shortest('a', 'b', { weight: 'length', direction: 'forward' })?.edges).toEqual([
      'ab3',
    ])
    expect(paths.shortest('a', 'b', { weight: 'length', direction: 'backward' })?.edges).toEqual([
      'ba2',
    ])
  })

  it('keeps to the nodes and edges the predicates allow, ends included', () => {
    const paths = finder(
      items.map((item) => ({ ...item, open: item.id !== 'e' })),
      links,
    )
    const open = (item: Item) => item.open !== false
    expect(paths.shortest('a', 'd', { nodes: open })?.nodes).toEqual(['a', 'b', 'c', 'd'])
    expect(paths.shortest('a', 'e', { nodes: open })).toBeNull()
    expect(paths.shortest('a', 'd', { edges: (_, key) => key !== 'ed1' })?.nodes).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })

  it('ignores edges that wait for an end', () => {
    const paths = finder(ids('a', 'b'), [link('a', 'x'), link('x', 'b')])
    expect(paths.shortest('a', 'b')).toBeNull()
  })

  it('reaches nodes by increasing cost, with the edges between them', () => {
    const paths = finder(items, links)
    expect(paths.reach('a', { maxCost: 1 })).toEqual({
      nodes: ['a', 'b', 'e'],
      costs: [0, 1, 1],
      edges: ['ab1', 'ae10'],
    })
    const two = paths.reach('a', { maxCost: 2 })
    expect(new Set(two.nodes)).toEqual(new Set(['a', 'b', 'e', 'c', 'd']))
    expect(new Set(two.edges)).toEqual(new Set(['ab1', 'ae10', 'bc1', 'cd1', 'ed1']))
    expect(paths.reach('a', { weight: 'length', maxCost: 2 }).nodes).toEqual(['a', 'b', 'c'])
    expect(paths.reach('d', { direction: 'forward' }).nodes).toEqual(['d'])
    expect(paths.reach('f').nodes).toEqual(['f'])
    expect(paths.reach('zz')).toEqual({ nodes: [], costs: [], edges: [] })
    expect(paths.reach('a').nodes).toHaveLength(5)
  })

  it('reads live sources again after they change', () => {
    const collection = createCollection(
      localOnlyCollectionOptions<Link>({
        getKey: (each) => each.id,
        initialData: [link('a', 'b'), link('b', 'c')],
      }),
    )
    const paths = createPathFinder({
      marks: [nodes<Item>(ids('a', 'b', 'c')), edges(collection, { source: 'from', target: 'to' })],
    })
    expect(paths.shortest('a', 'c')?.cost).toBe(2)
    collection.insert(link('a', 'c'))
    expect(paths.shortest('a', 'c')?.cost).toBe(1)
    paths.destroy()
    expect(paths.shortest('a', 'c')).toBeNull()
  })

  it('matches a reference on random graphs', () => {
    const next = random(3)
    for (let round = 0; round < 40; round++) {
      const count = 3 + Math.floor(next() * 30)
      const linkCount = Math.floor(next() * count * 2)
      const graphItems = Array.from({ length: count }, (_, index) => ({ id: `n${index}` }))
      const graphLinks: Link[] = Array.from({ length: linkCount }, (_, index) => ({
        id: `e${index}`,
        from: `n${Math.floor(next() * count)}`,
        to: `n${Math.floor(next() * count)}`,
        length: next() < 0.1 ? null : Math.round(next() * 9),
      }))
      const paths = finder(graphItems, graphLinks)
      for (const direction of directions) {
        for (const weighted of [false, true]) {
          const from = Math.floor(next() * count)
          const expected = reference(count, graphLinks, from, direction, weighted)
          const options: PathOptions<NodeMark<Item> | EdgeMark<Link>> = weighted
            ? { direction, weight: 'length' }
            : { direction }
          const reached = paths.reach(`n${from}`, options)
          const costs = new Map<Key, number>(
            reached.nodes.map((key, at) => [key, reached.costs[at] ?? 0]),
          )
          for (let to = 0; to < count; to++) {
            const path = paths.shortest(`n${from}`, `n${to}`, options)
            const cost = expected[to] ?? Number.POSITIVE_INFINITY
            if (cost === Number.POSITIVE_INFINITY) {
              expect(path).toBeNull()
              expect(costs.has(`n${to}`)).toBe(false)
              continue
            }
            expect(path?.cost).toBeCloseTo(cost)
            expect(costs.get(`n${to}`)).toBeCloseTo(cost)
            if (path) checkPath(path, graphLinks, direction, weighted)
          }
        }
      }
    }
  })

  it('collects the edges between reached nodes, few or many', () => {
    const next = random(11)
    const count = 200
    const graphItems = Array.from({ length: count }, (_, index) => ({ id: `n${index}` }))
    const graphLinks: Link[] = Array.from({ length: 400 }, (_, index) => ({
      id: `e${index}`,
      from: `n${index < count ? index : Math.floor(next() * count)}`,
      to: `n${index < count ? (index + 1) % count : Math.floor(next() * count)}`,
      length: Math.round(next() * 4),
    }))
    const paths = finder(graphItems, graphLinks)
    for (const maxCost of [1, 2, 3, 6, 40]) {
      for (const direction of directions) {
        const reached = paths.reach('n0', { maxCost, direction, weight: 'length' })
        const inside = new Set(reached.nodes)
        const expected = graphLinks
          .filter((each) => inside.has(each.from) && inside.has(each.to))
          .map((each) => each.id)
        expect([...reached.edges].sort()).toEqual(expected.sort())
      }
    }
  })

  it('types the items the options read', () => {
    const paths = finder(items, links)
    paths.shortest('a', 'b', { weight: 'length', nodes: (item) => item.id !== 'x' })
    // @ts-expect-error
    paths.shortest('a', 'b', { weight: 'from' })
    // @ts-expect-error
    paths.shortest('a', 'b', { edges: (edge) => edge.missing })
    expectTypeOf(paths.shortest('a', 'b')).toEqualTypeOf<GraphPath | null>()
  })
})
