import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { createPathFinder } from '../paths'
import type { PathDirection } from '../types'

interface Item {
  readonly id: string
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly length?: number | null
}

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function finder(items: readonly Item[], links: readonly Link[]) {
  return createPathFinder(
    defineGraph({
      marks: [nodes<Item>(items), edges<Link>(links, { source: 'from', target: 'to' })],
    }),
  )
}

function weightedLength(link: Link): number {
  const length = link.length ?? null
  return typeof length === 'number' && Number.isFinite(length) && length >= 0 ? length : Number.NaN
}

function spread(count: number, links: readonly Link[], direction: PathDirection) {
  const out: Array<[number, number, number]> = []
  links.forEach((link, id) => {
    const from = Number(link.from.slice(1))
    const to = Number(link.to.slice(1))
    if (Number.isNaN(from) || Number.isNaN(to)) return
    if (from >= count || to >= count) return
    if (direction !== 'backward') out.push([from, to, id])
    if (direction !== 'forward') out.push([to, from, id])
  })
  return out
}

function bfs(
  count: number,
  links: readonly Link[],
  from: number,
  direction: PathDirection,
): number[] {
  const dist = new Array<number>(count).fill(Number.POSITIVE_INFINITY)
  dist[from] = 0
  const queue = [from]
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head] ?? 0
    for (const [a, b] of spread(count, links, direction)) {
      if (a !== node) continue
      if (dist[b] === Number.POSITIVE_INFINITY) {
        dist[b] = (dist[a] ?? 0) + 1
        queue.push(b)
      }
    }
  }
  return dist
}

function dijkstra(
  count: number,
  links: readonly Link[],
  from: number,
  direction: PathDirection,
): number[] {
  const dist = new Array<number>(count).fill(Number.POSITIVE_INFINITY)
  dist[from] = 0
  const done = new Array<boolean>(count).fill(false)
  for (;;) {
    let best = -1
    for (let node = 0; node < count; node++) {
      const limit = best < 0 ? Number.POSITIVE_INFINITY : (dist[best] ?? Number.POSITIVE_INFINITY)
      if (!done[node] && (dist[node] ?? Number.POSITIVE_INFINITY) < limit) best = node
    }
    if (best < 0 || dist[best] === Number.POSITIVE_INFINITY) break
    done[best] = true
    for (const [a, b, id] of spread(count, links, direction)) {
      if (a !== best) continue
      const step = weightedLength(links[id] as Link)
      if (Number.isNaN(step)) continue
      const base = dist[best] ?? Number.POSITIVE_INFINITY
      if (base + step < (dist[b] ?? Number.POSITIVE_INFINITY)) dist[b] = base + step
    }
  }
  return dist
}

describe('createPathFinder edges', () => {
  it('matches a breadth-first walk on random graphs', () => {
    const next = random(41)
    for (let round = 0; round < 24; round++) {
      const count = 2 + Math.floor(next() * 26)
      const items = Array.from({ length: count }, (_, index) => ({ id: `n${index}` }))
      const linkCount = Math.floor(next() * count * 2)
      const links: Link[] = Array.from({ length: linkCount }, (_, index) => {
        const missing = next() < 0.06
        const from = `n${Math.floor(next() * count)}`
        const to = missing ? 'zz' : `n${Math.floor(next() * count)}`
        return { id: `e${index}`, from, to, length: null }
      })
      const paths = finder(items, links)
      for (const direction of ['both', 'forward', 'backward'] as const) {
        const from = Math.floor(next() * count)
        const expected = bfs(count, links, from, direction)
        const reach = paths.reach(`n${from}`, { direction })
        const costs = new Map(reach.nodes.map((key, at) => [key, reach.costs[at] ?? 0]))
        for (let to = 0; to < count; to++) {
          const path = paths.shortest(`n${from}`, `n${to}`, { direction })
          if (expected[to] === Number.POSITIVE_INFINITY) {
            expect(path).toBeNull()
            expect(costs.has(`n${to}`)).toBe(false)
          } else {
            expect(path?.cost).toBe(expected[to])
            expect(costs.get(`n${to}`)).toBe(expected[to])
          }
        }
      }
    }
  })

  it('matches a naive Dijkstra with null, zero, infinite and NaN weights', () => {
    const next = random(57)
    for (let round = 0; round < 24; round++) {
      const count = 2 + Math.floor(next() * 22)
      const items = Array.from({ length: count }, (_, index) => ({ id: `n${index}` }))
      const linkCount = Math.floor(next() * count * 2)
      const links: Link[] = Array.from({ length: linkCount }, (_, index) => {
        const pick = next()
        const from = `n${Math.floor(next() * count)}`
        const to = next() < 0.06 ? 'zz' : `n${Math.floor(next() * count)}`
        if (pick < 0.35) return { id: `e${index}`, from, to, length: 0 }
        if (pick < 0.55) return { id: `e${index}`, from, to, length: null }
        if (pick < 0.65) return { id: `e${index}`, from, to, length: Number.POSITIVE_INFINITY }
        if (pick < 0.75) return { id: `e${index}`, from, to, length: Number.NaN }
        return {
          id: `e${index}`,
          from,
          to,
          length: Math.round(next() * 40) / 4,
        }
      })
      const paths = finder(items, links)
      for (const direction of ['both', 'forward', 'backward'] as const) {
        const from = Math.floor(next() * count)
        const expected = dijkstra(count, links, from, direction)
        const reach = paths.reach(`n${from}`, { direction, weight: 'length' })
        const costs = new Map(reach.nodes.map((key, at) => [key, reach.costs[at] ?? 0]))
        for (let to = 0; to < count; to++) {
          const path = paths.shortest(`n${from}`, `n${to}`, { direction, weight: 'length' })
          if (expected[to] === Number.POSITIVE_INFINITY) {
            expect(path).toBeNull()
            expect(costs.has(`n${to}`)).toBe(false)
          } else {
            const want = expected[to] ?? Number.NaN
            expect(path?.cost).toBeCloseTo(want)
            expect(costs.get(`n${to}`)).toBeCloseTo(want)
          }
        }
      }
    }
  })

  it('honors maxCost and the edges it lists between reached nodes', () => {
    const next = random(73)
    for (let round = 0; round < 16; round++) {
      const count = 2 + Math.floor(next() * 16)
      const items = Array.from({ length: count }, (_, index) => ({ id: `n${index}` }))
      const links: Link[] = Array.from({ length: Math.floor(next() * count * 2) }, (_, index) => ({
        id: `e${index}`,
        from: `n${Math.floor(next() * count)}`,
        to: `n${Math.floor(next() * count)}`,
        length: Math.floor(next() * 4),
      }))
      const paths = finder(items, links)
      for (const weighted of [false, true]) {
        const from = Math.floor(next() * count)
        const maxCost = Math.floor(next() * 5)
        const direction =
          (['both', 'forward', 'backward'] as const)[Math.floor(next() * 3)] ?? 'both'
        const expected = weighted
          ? dijkstra(count, links, from, direction)
          : bfs(count, links, from, direction)
        const options = weighted
          ? { direction, maxCost, weight: 'length' as const }
          : { direction, maxCost }
        const reach = paths.reach(`n${from}`, options)
        const inside = new Set(
          Array.from({ length: count }, (_, index) => index).filter(
            (index) => (expected[index] ?? Number.POSITIVE_INFINITY) <= maxCost,
          ),
        )
        expect([...reach.nodes].sort()).toEqual(
          Array.from(inside)
            .map((index) => `n${index}`)
            .sort(),
        )
        const listed = new Set(reach.edges)
        const wanted = new Set(
          links
            .filter(
              (link) =>
                inside.has(Number(link.from.slice(1))) && inside.has(Number(link.to.slice(1))),
            )
            .filter((link) => !weighted || !Number.isNaN(weightedLength(link)))
            .map((link) => link.id),
        )
        expect(listed).toEqual(wanted)
      }
    }
  })

  it('walks zero-weight chains and refuses what only a broken weight reaches', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const links = [
      { id: 'ab', from: 'a', to: 'b', length: 0 },
      { id: 'bc', from: 'b', to: 'c', length: 0 },
      { id: 'ac', from: 'a', to: 'c', length: 1 },
      { id: 'bd', from: 'b', to: 'd', length: Number.POSITIVE_INFINITY },
      { id: 'cd', from: 'c', to: 'd', length: Number.NaN },
    ]
    const paths = finder(items, links)
    const path = paths.shortest('a', 'c', { weight: 'length' })
    expect(path?.cost).toBe(0)
    expect(path?.costs).toEqual([0, 0, 0])
    expect([...paths.reach('a', { weight: 'length', maxCost: 0 }).nodes].sort()).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(paths.shortest('a', 'd', { weight: 'length' })).toBeNull()
    expect([...paths.reach('a', { weight: 'length' }).nodes].sort()).toEqual(['a', 'b', 'c'])
    const walk = paths.reach('a', { weight: 'length' })
    expect([...walk.edges].sort()).toEqual(['ab', 'ac', 'bc'])
    expect(paths.shortest('a', 'd')?.cost).toBe(2)
    expect(paths.shortest('d', 'd')).toEqual({ nodes: ['d'], edges: [], costs: [0], cost: 0 })
  })
})
