import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { createPathFinder } from '../paths'
import type { GraphPath, Key } from '../types'
import type { GraphWays } from './index'
import { pair as pairOf, ways as waysOf } from './index'

interface Item {
  readonly id: string
  readonly base?: boolean
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

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function num(key: Key): number {
  return Number(String(key).slice(1))
}

function selfChainOracle(
  count: number,
  links: readonly Link[],
  exits: ReadonlySet<number>,
): Set<string> {
  const found = new Set<string>()
  const adjacency = new Map<number, { to: number; id: string }[]>()
  const degree = new Map<number, number>()
  for (const link of links) {
    const a = num(link.from)
    const b = num(link.to)
    if (a === b) continue
    const listA = adjacency.get(a) ?? []
    listA.push({ to: b, id: link.id })
    adjacency.set(a, listA)
    const listB = adjacency.get(b) ?? []
    listB.push({ to: a, id: link.id })
    adjacency.set(b, listB)
    degree.set(a, (degree.get(a) ?? 0) + 1)
    degree.set(b, (degree.get(b) ?? 0) + 1)
  }
  for (const start of exits) {
    const pathNodes: number[] = [start]
    const pathEdges: string[] = []
    const used = new Set<string>()
    const visit = (at: number): void => {
      for (const { to, id } of adjacency.get(at) ?? []) {
        if (used.has(id)) continue
        if (to === start) {
          if (pathEdges.length >= 1 && pathNodes.every((n) => (degree.get(n) ?? 0) === 2)) {
            const nodes = [...pathNodes].filter((n) => n !== start).sort((a, b) => a - b)
            found.add(`${start}|${nodes.join(',')}|${[...pathEdges, id].sort().join(',')}`)
          }
          continue
        }
        if (pathNodes.includes(to) || exits.has(to)) continue
        pathNodes.push(to)
        pathEdges.push(id)
        used.add(id)
        visit(to)
        used.delete(id)
        pathEdges.pop()
        pathNodes.pop()
      }
    }
    visit(start)
  }
  return found
}

function usable(link: Link, weighted: boolean): boolean {
  return (
    !weighted ||
    (typeof link.length === 'number' && Number.isFinite(link.length) && link.length >= 0)
  )
}

function reaches(
  count: number,
  links: readonly Link[],
  from: number,
  exits: ReadonlySet<number>,
  removedNode: number,
  removedEdge: string | null,
  weighted: boolean,
): boolean {
  if (from === removedNode) return false
  const seen = new Array<boolean>(count).fill(false)
  seen[from] = true
  const queue = [from]
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head] as number
    if (u !== removedNode && exits.has(u)) return true
    for (const link of links) {
      if (link.id === removedEdge || !usable(link, weighted)) continue
      const a = num(link.from)
      const b = num(link.to)
      if (a === b) continue
      const v = a === u ? b : b === u ? a : -1
      if (v < 0 || v === removedNode || seen[v]) continue
      seen[v] = true
      queue.push(v)
    }
  }
  return false
}

function oracleTwo(
  count: number,
  links: readonly Link[],
  exits: ReadonlySet<number>,
  n: number,
  failure: 'node' | 'edge',
  weighted: boolean,
): boolean {
  if (exits.has(n)) return false
  if (!reaches(count, links, n, exits, -1, null, weighted)) return false
  if (failure === 'node') {
    for (let x = 0; x < count; x++) {
      if (x !== n && !reaches(count, links, n, exits, x, null, weighted)) return false
    }
  } else {
    for (const e of exits) {
      if (e !== n && !reaches(count, links, n, exits, e, null, weighted)) return false
    }
  }
  for (const link of links) {
    if (!reaches(count, links, n, exits, -1, link.id, weighted)) return false
  }
  return true
}

interface SimplePath {
  readonly nodes: number[]
  readonly edges: string[]
  readonly cost: number
}

function simplePaths(
  count: number,
  links: readonly Link[],
  from: number,
  to: number,
  weighted: boolean,
): SimplePath[] | null {
  const out: { v: number; id: string; w: number }[][] = Array.from({ length: count }, () => [])
  for (const link of links) {
    const a = num(link.from)
    const b = num(link.to)
    if (a === b) continue
    const w = weighted ? (link.length ?? Number.NaN) : 1
    if (!(w >= 0)) continue
    out[a]?.push({ v: b, id: link.id, w })
    out[b]?.push({ v: a, id: link.id, w })
  }
  const result: SimplePath[] = []
  const seen = new Array<boolean>(count).fill(false)
  const walk = (u: number, nodes: number[], edges: string[], cost: number): void => {
    if (result.length > 40000) return
    if (u === to) {
      result.push({ nodes: [...nodes], edges: [...edges], cost })
      return
    }
    for (const step of out[u] ?? []) {
      if (seen[step.v]) continue
      seen[step.v] = true
      nodes.push(step.v)
      edges.push(step.id)
      walk(step.v, nodes, edges, cost + step.w)
      nodes.pop()
      edges.pop()
      seen[step.v] = false
    }
  }
  seen[from] = true
  walk(from, [from], [], 0)
  return result.length > 40000 ? null : result
}

function minPairCost(
  count: number,
  links: readonly Link[],
  from: number,
  exits: readonly number[],
  weighted: boolean,
  failure: 'node' | 'edge',
): number | null {
  const perExit = new Map<number, SimplePath[] | null>()
  for (const e of exits) perExit.set(e, simplePaths(count, links, from, e, weighted))
  let best = Number.POSITIVE_INFINITY
  for (const e1 of exits) {
    const p1 = perExit.get(e1)
    if (!p1) return null
    for (const e2 of exits) {
      if (e2 === e1) continue
      const p2 = perExit.get(e2)
      if (!p2) return null
      for (const a of p1) {
        for (const b of p2) {
          if (failure === 'node') {
            if (a.nodes.some((x) => x !== from && b.nodes.includes(x))) continue
          } else {
            if (a.edges.some((id) => b.edges.includes(id))) continue
            if (a.nodes.some((x) => exits.includes(x) && b.nodes.includes(x))) continue
          }
          best = Math.min(best, a.cost + b.cost)
        }
      }
    }
  }
  return best
}

function checkPair(
  pair: readonly [GraphPath, GraphPath],
  links: readonly Link[],
  exits: ReadonlySet<number>,
  from: string,
  failure: 'node' | 'edge',
  weighted: boolean,
): number {
  const byId = new Map(links.map((link) => [link.id, link]))
  const [p1, p2] = pair
  expect(p1.nodes[0]).toBe(from)
  expect(p2.nodes[0]).toBe(from)
  for (const p of [p1, p2]) {
    expect(p.edges).toHaveLength(p.nodes.length - 1)
    expect(new Set(p.nodes).size).toBe(p.nodes.length)
    expect(exits.has(num(p.nodes[p.nodes.length - 1] as Key))).toBe(true)
    let total = 0
    p.edges.forEach((key, at) => {
      const link = byId.get(String(key))
      if (!link) throw new Error(`unknown edge ${String(key)}`)
      const a = p.nodes[at]
      const b = p.nodes[at + 1]
      expect((link.from === a && link.to === b) || (link.from === b && link.to === a)).toBe(true)
      total += weighted ? (link.length ?? 0) : 1
      expect(p.costs[at + 1]).toBeCloseTo(total)
    })
    expect(p.cost).toBeCloseTo(total)
  }
  expect(p1.nodes[p1.nodes.length - 1]).not.toBe(p2.nodes[p2.nodes.length - 1])
  if (failure === 'node') {
    expect(p1.nodes.filter((x) => p2.nodes.includes(x))).toEqual([from])
  } else {
    expect(p1.edges.filter((x) => p2.edges.includes(x))).toEqual([])
    const exits1 = p1.nodes.filter((x) => exits.has(num(x)))
    const exits2 = p2.nodes.filter((x) => exits.has(num(x)))
    expect(exits1.filter((x) => exits2.includes(x))).toEqual([])
  }
  return p1.cost + p2.cost
}

function components(
  count: number,
  extra: readonly [number, number][],
  without: number,
  withoutEdge: string | null,
  links: readonly Link[],
): number {
  const parent = Array.from({ length: count }, (_, i) => i)
  const find = (x: number): number => {
    if (parent[x] === x) return x
    const root = find(parent[x] as number)
    parent[x] = root
    return root
  }
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  for (const link of links) {
    if (link.id === withoutEdge) continue
    const a = num(link.from)
    const b = num(link.to)
    if (a === b || a === without || b === without) continue
    union(a, b)
  }
  for (const [a, b] of extra) {
    if (a === without || b === without) continue
    union(a, b)
  }
  const roots = new Set<number>()
  for (let i = 0; i < count; i++) if (i !== without) roots.add(find(i))
  return roots.size
}

describe('ways and pair', () => {
  it('matches a brute-force oracle on random graphs', () => {
    const next = random(20261123)
    let mismatches = 0
    const details: string[] = []
    const fail = (message: string): void => {
      mismatches++
      if (details.length < 20) details.push(message)
    }
    for (let round = 0; round < 60; round++) {
      const count = 6 + Math.floor(next() * 9)
      const items = Array.from({ length: count }, (_, i) => ({
        id: `n${i}`,
        base: next() < 0.25,
      }))
      const linkCount = count + Math.floor(next() * (count / 2))
      const links: Link[] = Array.from({ length: linkCount }, (_, i) => ({
        id: `e${i}`,
        from: `n${Math.floor(next() * count)}`,
        to: `n${Math.floor(next() * count)}`,
        length: next() < 0.15 ? null : Math.round(next() * 9),
      }))
      const exits = new Set(items.filter((item) => item.base).map((item) => num(item.id)))
      const exitKeys = [...exits].map((i) => `n${i}`)
      const weighted = round % 2 === 0
      const paths = finder(items, links)
      const linkOf = new Map(links.map((link) => [link.id, link]))
      const snapshots: Record<string, string> = {}
      let nodeModeWays: GraphWays | null = null
      for (const failure of ['node', 'edge'] as const) {
        const ways = waysOf(paths, { exits: exitKeys, failure })
        const two = new Set<number>()
        const one = new Set<number>()
        const twoWeighted = new Set<number>()
        for (let n = 0; n < count; n++) {
          if (exits.has(n)) continue
          if (oracleTwo(count, links, exits, n, failure, false)) two.add(n)
          else if (reaches(count, links, n, exits, -1, null, false)) one.add(n)
          if (oracleTwo(count, links, exits, n, failure, weighted)) twoWeighted.add(n)
        }
        const tag = `round ${round} ${failure}`
        if (
          new Set(ways.exits).size !== exits.size ||
          ![...ways.exits].every((k) => exits.has(num(k)))
        ) {
          fail(`${tag}: exits ${ways.exits}`)
        }
        const twoKeys = new Set(ways.two.map(num))
        if (twoKeys.size !== two.size || ![...twoKeys].every((n) => two.has(n))) {
          fail(`${tag}: two got ${[...twoKeys]} want ${[...two]}`)
        }
        const oneKeys = new Set(ways.one.map((each) => num(each.key)))
        if (oneKeys.size !== one.size || ![...oneKeys].every((n) => one.has(n))) {
          fail(`${tag}: one got ${[...oneKeys]} want ${[...one]}`)
        }
        const noneKeys = new Set(ways.none.map(num))
        const none = new Set<number>()
        for (let n = 0; n < count; n++) {
          if (!exits.has(n) && !two.has(n) && !one.has(n)) none.add(n)
        }
        if (noneKeys.size !== none.size || ![...noneKeys].every((n) => none.has(n))) {
          fail(`${tag}: none got ${[...noneKeys]} want ${[...none]}`)
        }
        for (const entry of ways.one) {
          const n = num(entry.key)
          const t = num(entry.through)
          if (!(exits.has(t) || two.has(t)))
            fail(`${tag}: through ${entry.through} of ${entry.key} not exit/two`)
          if (reaches(count, links, n, exits, t, null, false))
            fail(`${tag}: through ${entry.through} does not cut ${entry.key}`)
        }
        const virtual = count
        const virtualEdges: [number, number][] = [...exits].map((e) => [virtual, e])
        const ap = new Set<number>()
        const base = components(count + 1, virtualEdges, -1, null, links)
        for (let x = 0; x < count; x++) {
          if (components(count + 1, virtualEdges, x, null, links) > base) ap.add(x)
        }
        const weakNodes = new Set(ways.weak.nodes.map(num))
        if (weakNodes.size !== ap.size || ![...weakNodes].every((n) => ap.has(n))) {
          fail(`${tag}: weak nodes got ${[...weakNodes]} want ${[...ap]}`)
        }
        const bridges = new Set<string>()
        for (const link of links) {
          if (num(link.from) === num(link.to)) continue
          if (components(count + 1, virtualEdges, -1, link.id, links) > base) bridges.add(link.id)
        }
        const weakEdges = new Set(ways.weak.edges.map(String))
        if (weakEdges.size !== bridges.size || ![...weakEdges].every((id) => bridges.has(id))) {
          fail(`${tag}: weak edges got ${[...weakEdges]} want ${[...bridges]}`)
        }
        for (const chain of ways.chains) {
          const ends = chain.ends.map(num)
          const nodes = chain.nodes.map(num)
          if (!exits.has(ends[0] ?? -1) || !exits.has(ends[1] ?? -1)) {
            fail(`${tag}: chain ends not exits ${chain.ends}`)
          }
          if (chain.edges.length !== chain.nodes.length + 1) {
            fail(`${tag}: chain has ${chain.edges.length} edges for ${chain.nodes.length} nodes`)
          } else {
            const path = [ends[0] ?? -1, ...nodes, ends[1] ?? -1]
            const interior = path.slice(1, -1)
            if (new Set(interior).size !== interior.length) {
              fail(`${tag}: chain nodes repeat in ${chain.nodes}`)
            }
            if (interior.some((n) => exits.has(n))) {
              fail(`${tag}: chain node is an exit in ${chain.nodes}`)
            }
            if (new Set(chain.edges).size !== chain.edges.length) {
              fail(`${tag}: chain edges repeat in ${chain.edges}`)
            }
            for (let i = 0; i < chain.edges.length; i++) {
              const link = linkOf.get(String(chain.edges[i]))
              if (!link) {
                fail(`${tag}: chain edge ${String(chain.edges[i])} unknown`)
                continue
              }
              const a = num(link.from)
              const b = num(link.to)
              const left = path[i] ?? -1
              const right = path[i + 1] ?? -1
              if (!((a === left && b === right) || (a === right && b === left))) {
                fail(
                  `${tag}: chain edge ${link.id} not between ${String(path[i])} and ${String(path[i + 1])}`,
                )
              }
            }
          }
          if (chain.covered) {
            if (ends[0] === ends[1]) fail(`${tag}: covered chain with same ends ${chain.ends}`)
            if (failure === 'node' && !nodes.every((n) => two.has(n))) {
              fail(`${tag}: covered chain node not in two ${chain.nodes}`)
            }
          } else if (ends[0] !== ends[1]) {
            fail(`${tag}: uncovered chain with distinct ends ${chain.ends}`)
          }
        }
        for (let n = 0; n < count; n++) {
          if (exits.has(n)) continue
          const key = `n${n}`
          const pair = pairOf(paths, key, {
            exits: exitKeys,
            failure,
            weight: weighted ? 'length' : undefined,
          })
          if (twoWeighted.has(n)) {
            if (!pair) {
              fail(`${tag}: pair(${key}) null but node is in two`)
              continue
            }
            const total = checkPair(pair, links, exits, key, failure, weighted)
            const best = minPairCost(count, links, n, [...exits], weighted, failure)
            if (best !== null && !(Math.abs(total - best) < 1e-9)) {
              fail(`${tag}: pair(${key}) cost ${total} want ${best}`)
            }
          } else if (pair) {
            fail(`${tag}: pair(${key}) not null but node is not in two`)
          }
        }
        const pairs: [string, unknown][] = []
        for (let n = 0; n < count; n++) {
          if (exits.has(n)) continue
          pairs.push([
            `n${n}`,
            pairOf(paths, `n${n}`, {
              exits: exitKeys,
              failure,
              weight: weighted ? 'length' : undefined,
            }),
          ])
        }
        snapshots[failure] = JSON.stringify({ ways, pairs })
        if (failure === 'node') nodeModeWays = ways
      }
      const noiseCount = count * 2 + 4
      const noiseItems = Array.from({ length: noiseCount }, (_, i) => ({ id: `n${i}` }))
      const noiseLinks: Link[] = Array.from({ length: noiseCount * 2 }, (_, i) => ({
        id: `e${i}`,
        from: `n${Math.floor(next() * noiseCount)}`,
        to: `n${Math.floor(next() * noiseCount)}`,
      }))
      const noiseExits = [0, Math.floor(noiseCount / 2), noiseCount - 1].map((i) => `n${i}`)
      const noise = finder(noiseItems, noiseLinks)
      waysOf(noise, { exits: noiseExits })
      pairOf(noise, 'n1', { exits: noiseExits })
      const again = finder(items, links)
      for (const failure of ['node', 'edge'] as const) {
        const fresh = waysOf(again, { exits: exitKeys, failure })
        const freshPairs: [string, unknown][] = []
        for (let n = 0; n < count; n++) {
          if (exits.has(n)) continue
          freshPairs.push([
            `n${n}`,
            pairOf(again, `n${n}`, {
              exits: exitKeys,
              failure,
              weight: weighted ? 'length' : undefined,
            }),
          ])
        }
        const snapshot = snapshots[failure]
        if (snapshot === undefined) continue
        const expected = JSON.parse(snapshot) as { ways: unknown; pairs: [string, unknown][] }
        if (JSON.stringify(fresh) !== JSON.stringify(expected.ways)) {
          fail(`round ${round}: ways(${failure}) differs after another graph`)
        }
        for (const [key, pair] of freshPairs) {
          const before = expected.pairs.find(([k]) => k === key)?.[1]
          if (JSON.stringify(pair) !== JSON.stringify(before)) {
            fail(`round ${round}: pair(${key}, ${failure}) differs after another graph`)
          }
        }
      }
      if (nodeModeWays !== null && new Set(nodeModeWays.two).size === 0) {
        const expected = selfChainOracle(count, links, exits)
        const actual = new Set<string>()
        for (const chain of nodeModeWays.chains) {
          if (chain.covered) continue
          const ends = chain.ends.map(num)
          if (ends[0] !== ends[1]) continue
          const nodes = chain.nodes.map(num).sort((a, b) => a - b)
          actual.add(`${ends[0]}|${nodes.join(',')}|${chain.edges.map(String).sort().join(',')}`)
        }
        for (const each of expected) {
          if (!actual.has(each)) fail(`round ${round}: missing self chain ${each}`)
        }
      }
    }
    expect(details.join('\n')).toBe('')
    expect(mismatches).toBe(0)
  })

  it('finds nothing without exits, and null pairs', () => {
    const paths = finder(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [{ id: 'ab', from: 'a', to: 'b' }],
    )
    const ways = waysOf(paths, { exits: [] })
    expect(ways).toEqual({
      exits: [],
      two: [],
      one: [],
      none: ['a', 'b', 'c'],
      chains: [],
      weak: { nodes: [], edges: ['ab'] },
    })
    expect(pairOf(paths, 'a', { exits: [] })).toBeNull()
    expect(waysOf(paths, { exits: ['zz'] }).exits).toEqual([])
  })

  it('keeps an isolated exit out of the node lists', () => {
    const paths = finder(
      [{ id: 'e' }, { id: 'a' }, { id: 'b' }],
      [{ id: 'ab', from: 'a', to: 'b' }],
    )
    const ways = waysOf(paths, { exits: ['e'] })
    expect(ways.exits).toEqual(['e'])
    expect(ways.two).toEqual([])
    expect(ways.one).toEqual([])
    expect(ways.none).toEqual(['a', 'b'])
    expect(pairOf(paths, 'a', { exits: ['e'] })).toBeNull()
  })

  it('never covers a chain that returns to its own exit, in both modes', () => {
    const items = [{ id: 'e' }, { id: 'a' }, { id: 'b' }]
    const links = [
      { id: 'ea', from: 'e', to: 'a' },
      { id: 'ab', from: 'a', to: 'b' },
      { id: 'be', from: 'b', to: 'e' },
    ]
    for (const failure of ['node', 'edge'] as const) {
      const paths = finder(items, links)
      const ways = waysOf(paths, { exits: ['e'], failure })
      expect(ways.two).toEqual([])
      expect(ways.one).toEqual([
        { key: 'a', through: 'e' },
        { key: 'b', through: 'e' },
      ])
      expect(ways.chains).toEqual([
        { nodes: ['a', 'b'], edges: ['ea', 'ab', 'be'], ends: ['e', 'e'], covered: false },
      ])
      expect(pairOf(paths, 'a', { exits: ['e'], failure })).toBeNull()
    }
  })

  it('finds a chain between two exits, covered, and a cut branch', () => {
    const items = [{ id: 'e1' }, { id: 'e2' }, { id: 'a' }, { id: 'b' }, { id: 'c' }]
    const links = [
      { id: 'e1a', from: 'e1', to: 'a' },
      { id: 'ab', from: 'a', to: 'b' },
      { id: 'be2', from: 'b', to: 'e2' },
      { id: 'bc', from: 'b', to: 'c' },
    ]
    const paths = finder(items, links)
    const ways = waysOf(paths, { exits: (item) => item.id.startsWith('e') })
    expect(ways.exits).toEqual(['e1', 'e2'])
    expect(ways.two).toEqual(['a', 'b'])
    expect(ways.one).toEqual([{ key: 'c', through: 'b' }])
    expect(ways.none).toEqual([])
    expect(ways.chains).toEqual([
      { nodes: ['a', 'b'], edges: ['e1a', 'ab', 'be2'], ends: ['e1', 'e2'], covered: true },
    ])
    expect(ways.weak.nodes).toEqual(['b'])
    expect(ways.weak.edges).toEqual(['bc'])
    const pair = pairOf(paths, 'a', { exits: ['e1', 'e2'] })
    expect(pair?.map((p) => [p.nodes, p.cost])).toEqual([
      [['a', 'e1'], 1],
      [['a', 'b', 'e2'], 2],
    ])
  })

  it('covers two rings that touch at a node only in edge mode', () => {
    const items = [
      { id: 'e1' },
      { id: 'e2' },
      { id: 'a' },
      { id: 'x' },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' },
    ]
    const links = [
      { id: 'e1a', from: 'e1', to: 'a' },
      { id: 'ax', from: 'a', to: 'x' },
      { id: 'xb', from: 'x', to: 'b' },
      { id: 'be2', from: 'b', to: 'e2' },
      { id: 'xc', from: 'x', to: 'c' },
      { id: 'cd', from: 'c', to: 'd' },
      { id: 'dx', from: 'd', to: 'x' },
    ]
    const exits = ['e1', 'e2']
    const nodeMode = waysOf(finder(items, links), { exits, failure: 'node' })
    expect(nodeMode.two).toEqual(['a', 'x', 'b'])
    expect(nodeMode.one.map((each) => each.key).sort()).toEqual(['c', 'd'])
    const edgeMode = waysOf(finder(items, links), { exits, failure: 'edge' })
    expect(edgeMode.two).toEqual(['a', 'x', 'b', 'c', 'd'])
    expect(edgeMode.one).toEqual([])
    expect(pairOf(finder(items, links), 'c', { exits, failure: 'edge' })).not.toBeNull()
    expect(pairOf(finder(items, links), 'c', { exits, failure: 'node' })).toBeNull()
  })

  it('handles exits linked to each other, as a one-node chain', () => {
    const items = [{ id: 'e1' }, { id: 'e2' }, { id: 'a' }]
    const links = [
      { id: 'e1e2', from: 'e1', to: 'e2' },
      { id: 'e1a', from: 'e1', to: 'a' },
      { id: 'ae2', from: 'a', to: 'e2' },
    ]
    const paths = finder(items, links)
    const ways = waysOf(paths, { exits: ['e1', 'e2'] })
    expect(ways.two).toEqual(['a'])
    expect(ways.chains).toEqual([
      { nodes: ['a'], edges: ['e1a', 'ae2'], ends: ['e1', 'e2'], covered: true },
    ])
  })

  it('finds a chain whose branch contains a cycle', () => {
    const items = [
      { id: 'n0' },
      { id: 'n1' },
      { id: 'n2' },
      { id: 'n3' },
      { id: 'n4' },
      { id: 'n5' },
      { id: 'n6' },
      { id: 'n7' },
      { id: 'n8' },
      { id: 'n10' },
      { id: 'n11' },
      { id: 'n13' },
      { id: 'n14' },
    ]
    const links = [
      { id: 'l0', from: 'n10', to: 'n7' },
      { id: 'l1', from: 'n7', to: 'n5' },
      { id: 'l2', from: 'n10', to: 'n11' },
      { id: 'l3', from: 'n3', to: 'n11' },
      { id: 'l4', from: 'n11', to: 'n14' },
      { id: 'l5', from: 'n14', to: 'n2' },
      { id: 'l6', from: 'n2', to: 'n8' },
      { id: 'l7', from: 'n4', to: 'n2' },
      { id: 'l8', from: 'n14', to: 'n4' },
      { id: 'l9', from: 'n10', to: 'n13' },
      { id: 'l10', from: 'n5', to: 'n13' },
      { id: 'l11', from: 'n10', to: 'n1' },
      { id: 'l12', from: 'n6', to: 'n0' },
      { id: 'l13', from: 'n6', to: 'n0' },
    ]
    const paths = finder(items, links)
    const ways = waysOf(paths, { exits: ['n3', 'n5', 'n10'] })
    expect(ways.chains).toContainEqual({
      nodes: ['n11'],
      edges: ['l2', 'l3'],
      ends: ['n10', 'n3'],
      covered: true,
    })
  })

  it('finds a chain with a node hanging by two parallel edges', () => {
    const items = [
      { id: 'n0' },
      { id: 'n1' },
      { id: 'n2' },
      { id: 'n3' },
      { id: 'n4' },
      { id: 'n5' },
      { id: 'n6' },
    ]
    const links = [
      { id: 'l0', from: 'n3', to: 'n0' },
      { id: 'l1', from: 'n4', to: 'n0' },
      { id: 'l2', from: 'n5', to: 'n0' },
      { id: 'l3', from: 'n0', to: 'n5' },
      { id: 'l4', from: 'n3', to: 'n1' },
      { id: 'l5', from: 'n1', to: 'n2' },
      { id: 'l6', from: 'n6', to: 'n4' },
    ]
    const paths = finder(items, links)
    const ways = waysOf(paths, { exits: ['n1', 'n3', 'n4'] })
    expect(ways.chains).toContainEqual({
      nodes: ['n0'],
      edges: ['l0', 'l1'],
      ends: ['n3', 'n4'],
      covered: true,
    })
  })

  it('finds a chain on a longer graph with parallel and dead-end branches', () => {
    const ids = [
      'n0',
      'n1',
      'n2',
      'n3',
      'n4',
      'n5',
      'n6',
      'n7',
      'n8',
      'n9',
      'n10',
      'n11',
      'n12',
      'n13',
      'n14',
      'n15',
      'n16',
      'n18',
      'n19',
      'n21',
      'n22',
    ]
    const items = ids.map((id) => ({ id }))
    const links = [
      { id: 'l0', from: 'n19', to: 'n2' },
      { id: 'l1', from: 'n5', to: 'n2' },
      { id: 'l2', from: 'n3', to: 'n2' },
      { id: 'l3', from: 'n2', to: 'n3' },
      { id: 'l4', from: 'n2', to: 'n22' },
      { id: 'l5', from: 'n18', to: 'n13' },
      { id: 'l6', from: 'n11', to: 'n12' },
      { id: 'l7', from: 'n7', to: 'n8' },
      { id: 'l8', from: 'n11', to: 'n19' },
      { id: 'l9', from: 'n12', to: 'n15' },
      { id: 'l10', from: 'n6', to: 'n11' },
      { id: 'l11', from: 'n18', to: 'n10' },
      { id: 'l12', from: 'n13', to: 'n21' },
      { id: 'l13', from: 'n1', to: 'n19' },
      { id: 'l14', from: 'n4', to: 'n8' },
      { id: 'l15', from: 'n14', to: 'n1' },
      { id: 'l16', from: 'n1', to: 'n0' },
      { id: 'l17', from: 'n16', to: 'n9' },
    ]
    const paths = finder(items, links)
    const ways = waysOf(paths, {
      exits: ['n1', 'n5', 'n6', 'n7', 'n12', 'n13', 'n18', 'n19', 'n21'],
    })
    expect(ways.chains).toContainEqual({
      nodes: ['n2'],
      edges: ['l0', 'l1'],
      ends: ['n19', 'n5'],
      covered: true,
    })
  })

  it('finds a chain returning to its own exit despite a cyclic branch', () => {
    const items = [{ id: 'e' }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const links = [
      { id: 'ea', from: 'e', to: 'a' },
      { id: 'ab', from: 'a', to: 'b' },
      { id: 'be', from: 'b', to: 'e' },
      { id: 'ac', from: 'a', to: 'c' },
      { id: 'cd', from: 'c', to: 'd' },
      { id: 'da', from: 'd', to: 'a' },
    ]
    const paths = finder(items, links)
    const ways = waysOf(paths, { exits: ['e'] })
    expect(ways.chains).toEqual([
      { nodes: ['a', 'b'], edges: ['ea', 'ab', 'be'], ends: ['e', 'e'], covered: false },
    ])
  })

  it('counts two parallel edges to an exit as a chain returning to it', () => {
    const items = [{ id: 'e' }, { id: 'x' }]
    const links = [
      { id: 'l0', from: 'e', to: 'x' },
      { id: 'l1', from: 'e', to: 'x' },
    ]
    const paths = finder(items, links)
    const ways = waysOf(paths, { exits: ['e'] })
    expect(ways.chains).toEqual([
      { nodes: ['x'], edges: ['l0', 'l1'], ends: ['e', 'e'], covered: false },
    ])
  })

  it('finds no chain in two nodes linked by parallel edges without an exit', () => {
    const items = [{ id: 'e' }, { id: 'x' }, { id: 'y' }]
    const links = [
      { id: 'l0', from: 'x', to: 'y' },
      { id: 'l1', from: 'x', to: 'y' },
    ]
    const paths = finder(items, links)
    const ways = waysOf(paths, { exits: ['e'] })
    expect(ways.chains).toEqual([])
  })

  it('weighs the pair by a field, and refuses a negative weight', () => {
    const items = [{ id: 'e1' }, { id: 'e2' }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const links: Link[] = [
      { id: 'e1a', from: 'e1', to: 'a', length: 1 },
      { id: 'ab', from: 'a', to: 'b', length: 1 },
      { id: 'be2', from: 'b', to: 'e2', length: 1 },
      { id: 'e1c', from: 'e1', to: 'c', length: 5 },
      { id: 'cd', from: 'c', to: 'd', length: 5 },
      { id: 'de2', from: 'd', to: 'e2', length: 5 },
    ]
    const paths = finder(items, links)
    const pair = pairOf(paths, 'a', { exits: ['e1', 'e2'], weight: 'length' })
    expect(pair?.map((p) => [p.nodes, p.cost])).toEqual([
      [['a', 'e1'], 1],
      [['a', 'b', 'e2'], 2],
    ])
    const negative = finder(
      items,
      links.map((l) => (l.id === 'ab' ? { ...l, length: -1 } : l)),
    )
    expect(() => pairOf(negative, 'a', { exits: ['e1', 'e2'], weight: 'length' })).toThrow(
      RangeError,
    )
  })

  it('keeps to the nodes and edges the predicates allow', () => {
    const items = [{ id: 'e1' }, { id: 'e2' }, { id: 'a' }, { id: 'b' }]
    const links = [
      { id: 'e1a', from: 'e1', to: 'a' },
      { id: 'ab', from: 'a', to: 'b' },
      { id: 'be2', from: 'b', to: 'e2' },
    ]
    const paths = finder(items, links)
    const ways = waysOf(paths, {
      exits: ['e1', 'e2'],
      nodes: (item) => item.id !== 'b',
    })
    expect(ways.two).toEqual([])
    expect(ways.one).toEqual([{ key: 'a', through: 'e1' }])
    expect(ways.none).toEqual([])
    expect(
      pairOf(paths, 'a', { exits: ['e1', 'e2'], edges: (_l, key) => key !== 'be2' }),
    ).toBeNull()
  })

  it('returns the same frozen object while nothing changes, and a new one after an update', () => {
    const collection = createCollection(
      localOnlyCollectionOptions<Link>({
        getKey: (each) => each.id,
        initialData: [
          { id: 'ea', from: 'e', to: 'a' },
          { id: 'ab', from: 'a', to: 'b' },
          { id: 'be', from: 'b', to: 'e' },
        ],
      }),
    )
    const paths = createPathFinder({
      marks: [
        nodes<Item>([{ id: 'e' }, { id: 'e2' }, { id: 'a' }, { id: 'b' }]),
        edges(collection, { source: 'from', target: 'to' }),
      ],
    })
    const first = waysOf(paths, { exits: ['e', 'e2'] })
    expect(first.two).toEqual([])
    expect(waysOf(paths, { exits: ['e', 'e2'] })).toBe(first)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.two)).toBe(true)
    expect(Object.isFrozen(first.one[0])).toBe(true)
    expect(Object.isFrozen(first.weak)).toBe(true)
    collection.insert({ id: 'be2', from: 'b', to: 'e2' })
    const second = waysOf(paths, { exits: ['e', 'e2'] })
    expect(second).not.toBe(first)
    expect(second.two).toEqual(['a', 'b'])
    paths.destroy()
    const dead = waysOf(paths, { exits: ['e'] })
    expect(dead).toEqual({
      exits: [],
      two: [],
      one: [],
      none: [],
      chains: [],
      weak: { nodes: [], edges: [] },
    })
    expect(Object.isFrozen(dead)).toBe(true)
    expect(pairOf(paths, 'a', { exits: ['e'] })).toBeNull()
  })

  it('returns null for an unknown or non-key from, and refuses a bad failure', () => {
    const paths = finder([{ id: 'e' }, { id: 'a' }], [{ id: 'ea', from: 'e', to: 'a' }])
    expect(pairOf(paths, 'zz', { exits: ['e'] })).toBeNull()
    expect(pairOf(paths, undefined as unknown as Key, { exits: ['e'] })).toBeNull()
    const failure = 'both' as 'node'
    expect(() => waysOf(paths, { exits: ['e'], failure })).toThrow(TypeError)
    expect(() => pairOf(paths, 'a', { exits: ['e'], failure })).toThrow(TypeError)
  })

  it('refuses a missing exits option or a string as the key list, and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const paths = finder([{ id: 'e' }, { id: 'a' }], [{ id: 'ea', from: 'e', to: 'a' }])
    // @ts-expect-error
    waysOf(paths, {})
    // @ts-expect-error
    waysOf(paths, { exits: 'ea' })
    // @ts-expect-error
    pairOf(paths, 'a', { exits: 'ea' })
    expect(waysOf(paths, { exits: 'ea' as unknown as string[] }).exits).toEqual(['e', 'a'])
    expect(warn.mock.calls).toEqual([
      ['graph: ways({ exits }) takes a list of keys, not a string'],
      ['graph: pair({ exits }) takes a list of keys, not a string'],
    ])
    warn.mockRestore()
  })

  const staleGraphs: { exits: string[]; items: Item[]; links: Link[] }[] = [
    {
      exits: ['n10', 'n12', 'n13', 'n23'],
      items: [
        { id: 'n0' },
        { id: 'n1' },
        { id: 'n2' },
        { id: 'n3' },
        { id: 'n4' },
        { id: 'n5' },
        { id: 'n6' },
        { id: 'n7' },
        { id: 'n8' },
        { id: 'n9' },
        { id: 'n10' },
        { id: 'n11' },
        { id: 'n12' },
        { id: 'n13' },
        { id: 'n14' },
        { id: 'n15' },
        { id: 'n16' },
        { id: 'n17' },
        { id: 'n18' },
        { id: 'n19' },
        { id: 'n20' },
        { id: 'n21' },
        { id: 'n22' },
        { id: 'n23' },
      ],
      links: [
        { id: 'l0', from: 'n2', to: 'n9' },
        { id: 'l1', from: 'n15', to: 'n7' },
        { id: 'l2', from: 'n10', to: 'n0' },
        { id: 'l3', from: 'n3', to: 'n7' },
        { id: 'l4', from: 'n1', to: 'n4' },
        { id: 'l5', from: 'n20', to: 'n10' },
        { id: 'l6', from: 'n21', to: 'n16' },
        { id: 'l7', from: 'n13', to: 'n8' },
        { id: 'l8', from: 'n9', to: 'n10' },
        { id: 'l9', from: 'n17', to: 'n22' },
        { id: 'l10', from: 'n21', to: 'n17' },
        { id: 'l12', from: 'n0', to: 'n3' },
        { id: 'l14', from: 'n16', to: 'n10' },
        { id: 'l15', from: 'n22', to: 'n23' },
        { id: 'l16', from: 'n11', to: 'n13' },
        { id: 'l17', from: 'n22', to: 'n3' },
        { id: 'l18', from: 'n5', to: 'n9' },
        { id: 'l19', from: 'n16', to: 'n23' },
        { id: 'l20', from: 'n20', to: 'n2' },
        { id: 'l21', from: 'n8', to: 'n15' },
        { id: 'l22', from: 'n21', to: 'n2' },
        { id: 'l23', from: 'n10', to: 'n19' },
        { id: 'l24', from: 'n8', to: 'n0' },
        { id: 'l25', from: 'n16', to: 'n3' },
        { id: 'l26', from: 'n21', to: 'n6' },
        { id: 'l27', from: 'n1', to: 'n17' },
        { id: 'l28', from: 'n8', to: 'n21' },
        { id: 'l29', from: 'n23', to: 'n11' },
        { id: 'l30', from: 'n23', to: 'n0' },
        { id: 'l31', from: 'n3', to: 'n21' },
        { id: 'l32', from: 'n1', to: 'n21' },
        { id: 'l33', from: 'n13', to: 'n9' },
      ],
    },
    {
      exits: ['n2'],
      items: [
        { id: 'n0' },
        { id: 'n1' },
        { id: 'n2' },
        { id: 'n3' },
        { id: 'n4' },
        { id: 'n5' },
        { id: 'n6' },
      ],
      links: [
        { id: 'l0', from: 'n5', to: 'n1' },
        { id: 'l1', from: 'n4', to: 'n0' },
        { id: 'l2', from: 'n4', to: 'n6' },
        { id: 'l3', from: 'n5', to: 'n6' },
        { id: 'l4', from: 'n5', to: 'n2' },
        { id: 'l5', from: 'n6', to: 'n5' },
      ],
    },
    {
      exits: ['n0'],
      items: [
        { id: 'n0' },
        { id: 'n1' },
        { id: 'n2' },
        { id: 'n3' },
        { id: 'n4' },
        { id: 'n5' },
        { id: 'n6' },
        { id: 'n7' },
      ],
      links: [
        { id: 'l0', from: 'n2', to: 'n5' },
        { id: 'l1', from: 'n3', to: 'n2' },
        { id: 'l2', from: 'n4', to: 'n0' },
        { id: 'l3', from: 'n5', to: 'n6' },
        { id: 'l4', from: 'n4', to: 'n0' },
        { id: 'l5', from: 'n6', to: 'n7' },
        { id: 'l6', from: 'n0', to: 'n3' },
        { id: 'l7', from: 'n0', to: 'n7' },
      ],
    },
  ]

  it('gives the same result whatever the previous call was', () => {
    const finders = staleGraphs.map((each) => finder(each.items, each.links))
    const inOrder = finders.map((each, at) => waysOf(each, { exits: staleGraphs[at]?.exits ?? [] }))
    const alone = staleGraphs.map((each) =>
      waysOf(finder(each.items, each.links), { exits: each.exits }),
    )
    expect(inOrder.map((each) => JSON.stringify(each))).toEqual(
      alone.map((each) => JSON.stringify(each)),
    )
    const third = inOrder[2]
    expect(third?.chains).toEqual([
      { nodes: ['n4'], edges: ['l2', 'l4'], ends: ['n0', 'n0'], covered: false },
      {
        nodes: ['n3', 'n2', 'n5', 'n6', 'n7'],
        edges: ['l6', 'l1', 'l0', 'l3', 'l5', 'l7'],
        ends: ['n0', 'n0'],
        covered: false,
      },
    ])
  })

  it('throws a TypeError on an object that is neither a graph nor a path finder', () => {
    const stranger = { paths: {} }
    expect(() => waysOf(stranger as never, { exits: ['e'] })).toThrow(TypeError)
    expect(() => waysOf(stranger as never, { exits: ['e'] })).toThrow(
      'ways: needs a graph made by mountGraph or createGraph, or a path finder',
    )
    expect(() => pairOf(stranger as never, 'a', { exits: ['e'] })).toThrow(TypeError)
    expect(() => pairOf(stranger as never, 'a', { exits: ['e'] })).toThrow(
      'pair: needs a graph made by mountGraph or createGraph, or a path finder',
    )
    expect(() => waysOf(null as unknown as never, { exits: ['e'] })).toThrow(TypeError)
  })

  it('keeps the caches of two targets apart', () => {
    const one = finder(
      [{ id: 'e1' }, { id: 'e2' }, { id: 'a' }],
      [
        { id: 'e1a', from: 'e1', to: 'a' },
        { id: 'ae2', from: 'a', to: 'e2' },
      ],
    )
    const two = finder([{ id: 'e' }, { id: 'x' }], [{ id: 'ex', from: 'e', to: 'x' }])
    const first = waysOf(one, { exits: ['e1', 'e2'] })
    const other = waysOf(two, { exits: ['e'] })
    expect(first.two).toEqual(['a'])
    expect(other.two).toEqual([])
    expect(other.one).toEqual([{ key: 'x', through: 'e' }])
    expect(other.none).toEqual([])
    expect(waysOf(one, { exits: ['e1', 'e2'] })).toBe(first)
    expect(waysOf(two, { exits: ['e'] })).toBe(other)
    expect(pairOf(one, 'a', { exits: ['e1', 'e2'] })).not.toBeNull()
    expect(pairOf(two, 'x', { exits: ['e'] })).toBeNull()
    one.destroy()
    two.destroy()
  })

  it('types the items the options read', () => {
    const paths = finder([{ id: 'e' }, { id: 'a' }], [{ id: 'ea', from: 'e', to: 'a' }])
    waysOf(paths, { exits: (item) => item.base === true, nodes: (item) => item.id !== 'x' })
    pairOf(paths, 'a', { exits: ['e'], weight: 'length', edges: (link) => link.from !== 'zz' })
    // @ts-expect-error
    waysOf(paths, { exits: (item) => item.missing })
    // @ts-expect-error
    pairOf(paths, 'a', { exits: ['e'], weight: 'from' })
    // @ts-expect-error
    waysOf(paths, { exits: ['e'], edges: (link) => link.missing })
  })
})
