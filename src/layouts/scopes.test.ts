import { describe, expect, it } from 'vitest'
import type { ScopeRequest } from '../core/layout-scopes'
import type { Layout, LayoutGraph, LayoutListener, LayoutRun } from '../types'
import { force } from './force/index'
import { grid, layers, radial, rings } from './index'
import { planScopes } from './scopes'

interface GroupSpec {
  readonly parent: number
  readonly layout: Layout | null
  readonly circle?: boolean
  readonly padding?: number
}

interface NodeSpec {
  readonly group: number
  readonly radius?: number
  readonly fixed?: boolean
}

interface Spec {
  readonly groups: readonly GroupSpec[]
  readonly nodes: readonly NodeSpec[]
  readonly edges?: readonly number[]
}

interface Built {
  readonly graph: LayoutGraph
  readonly layouts: Map<number, Layout>
  readonly count: number
}

function build(spec: Spec): Built {
  const count = spec.nodes.length
  const capacity = count + spec.groups.length
  const alive = new Uint8Array(capacity)
  const movable = new Uint8Array(capacity)
  const xy = new Float32Array(capacity * 2)
  const radius = new Float32Array(capacity)
  const parent = new Int32Array(capacity).fill(-1)
  const padding = new Float32Array(capacity)
  const circle = new Uint8Array(capacity)
  spec.nodes.forEach((node, index) => {
    alive[index] = 1
    movable[index] = node.fixed ? 0 : 1
    radius[index] = node.radius ?? 5
    const turn = index * 2.399963229728653
    const r = 12 * Math.sqrt(index + 1)
    xy[index * 2] = r * Math.cos(turn)
    xy[index * 2 + 1] = r * Math.sin(turn)
    parent[index] = node.group >= 0 ? count + node.group : -1
  })
  const layouts = new Map<number, Layout>()
  spec.groups.forEach((group, at) => {
    const index = count + at
    parent[index] = group.parent >= 0 ? count + group.parent : -1
    padding[index] = group.padding ?? 16
    circle[index] = group.circle ? 1 : 0
    if (group.layout) layouts.set(index, group.layout)
  })
  const order: number[] = []
  const queue = spec.groups.flatMap((group, at) => (group.parent < 0 ? [at] : []))
  while (queue.length > 0) {
    const at = queue.shift() ?? 0
    order.push(count + at)
    spec.groups.forEach((group, child) => {
      if (group.parent === at) queue.push(child)
    })
  }
  const keys = Array.from({ length: capacity }, (_, index) =>
    index < count ? `n${index}` : `g${index - count}`,
  )
  const data = keys.map((key) => ({ key }))
  const graph: LayoutGraph = {
    capacity,
    alive,
    movable,
    xy,
    radius,
    edges: Uint32Array.from(spec.edges ?? []),
    groups: { order: Uint32Array.from(order), parent, padding, circle },
    keys,
    datum: (index) => data[index],
  }
  return { graph, layouts, count }
}

function request(built: Built, top: Layout | null, extra: Partial<ScopeRequest> = {}) {
  return {
    graph: built.graph,
    keyed: null,
    top,
    layouts: built.layouts,
    replace: null,
    rerun: null,
    arrivals: false,
    fresh: true,
    ...extra,
  }
}

function run(built: Built, top: Layout | null, extra: Partial<ScopeRequest> = {}) {
  const plan = planScopes(request(built, top, extra))
  if (!plan) return Promise.resolve(null)
  return new Promise<{ xy: Float32Array; movable: Uint8Array; name: string }>((resolve) => {
    plan.start({
      progress: () => {},
      end: (xy) => resolve({ xy, movable: plan.movable, name: plan.name }),
    })
  })
}

interface Box {
  x: number
  y: number
  halfWidth: number
  halfHeight: number
  round: boolean
  fixed?: boolean
}

function boxes(graph: LayoutGraph, xy: Float32Array): Map<number, Box> {
  const groups = graph.groups
  const found = new Map<number, Box>()
  if (!groups) return found
  const order = Array.from(groups.order).reverse()
  for (const container of order) {
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    const parts: { x: number; y: number; reach: number }[] = []
    let fixed = false
    for (let index = 0; index < graph.capacity; index++) {
      if (groups.parent[index] !== container) continue
      if (graph.alive[index] === 1) {
        const x = xy[index * 2] ?? 0
        const y = xy[index * 2 + 1] ?? 0
        const r = graph.radius[index] ?? 0
        minX = Math.min(minX, x - r)
        minY = Math.min(minY, y - r)
        maxX = Math.max(maxX, x + r)
        maxY = Math.max(maxY, y + r)
        parts.push({ x, y, reach: r })
        if (graph.movable[index] !== 1) fixed = true
        continue
      }
      const box = found.get(index)
      if (!box) continue
      if (box.fixed) fixed = true
      minX = Math.min(minX, box.x - box.halfWidth)
      minY = Math.min(minY, box.y - box.halfHeight)
      maxX = Math.max(maxX, box.x + box.halfWidth)
      maxY = Math.max(maxY, box.y + box.halfHeight)
      parts.push({
        x: box.x,
        y: box.y,
        reach: box.round ? box.halfWidth : Math.hypot(box.halfWidth, box.halfHeight),
      })
    }
    if (maxX < minX) continue
    const pad = groups.padding[container] ?? 0
    const x = (minX + maxX) / 2
    const y = (minY + maxY) / 2
    const round = groups.circle[container] === 1
    if (round) {
      let reach = 0
      for (const part of parts) {
        reach = Math.max(reach, Math.hypot(part.x - x, part.y - y) + part.reach)
      }
      found.set(container, {
        x,
        y,
        halfWidth: reach + pad,
        halfHeight: reach + pad,
        round,
        fixed,
      })
    } else {
      found.set(container, {
        x,
        y,
        halfWidth: (maxX - minX) / 2 + pad,
        halfHeight: (maxY - minY) / 2 + pad,
        round,
        fixed,
      })
    }
  }
  return found
}

function penetration(a: Box, b: Box): number {
  if (a.round && b.round) {
    return a.halfWidth + b.halfWidth - Math.hypot(a.x - b.x, a.y - b.y)
  }
  if (a.round || b.round) {
    const disc = a.round ? a : b
    const rect = a.round ? b : a
    const dx = Math.max(Math.abs(disc.x - rect.x) - rect.halfWidth, 0)
    const dy = Math.max(Math.abs(disc.y - rect.y) - rect.halfHeight, 0)
    return disc.halfWidth - Math.hypot(dx, dy)
  }
  const overlapX = a.halfWidth + b.halfWidth - Math.abs(a.x - b.x)
  const overlapY = a.halfHeight + b.halfHeight - Math.abs(a.y - b.y)
  return Math.min(overlapX, overlapY)
}

function overlaps(graph: LayoutGraph, xy: Float32Array): number {
  const groups = graph.groups
  const found = boxes(graph, xy)
  const siblings = new Map<number, Box[]>()
  for (let index = 0; index < graph.capacity; index++) {
    const holder = groups?.parent[index] ?? -1
    let box: Box | undefined
    if (graph.alive[index] === 1) {
      const r = graph.radius[index] ?? 0
      box = {
        x: xy[index * 2] ?? 0,
        y: xy[index * 2 + 1] ?? 0,
        halfWidth: r,
        halfHeight: r,
        round: true,
        fixed: graph.movable[index] !== 1,
      }
    } else {
      box = found.get(index)
    }
    if (!box) continue
    const list = siblings.get(holder) ?? []
    list.push(box)
    siblings.set(holder, list)
  }
  let count = 0
  for (const list of siblings.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const first = list[a] as Box
        const second = list[b] as Box
        if (first.fixed && second.fixed) continue
        if (penetration(first, second) > 0.05) count++
      }
    }
  }
  return count
}

function random(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
}

const choices: readonly (() => Layout | null)[] = [
  () => grid(),
  () => rings(),
  () => radial(),
  () => layers(),
  () => force({ steps: 60 }),
  () => null,
]

function randomSpec(seed: number): Spec {
  const next = random(seed)
  const groups: GroupSpec[] = []
  const groupCount = 2 + Math.floor(next() * 7)
  for (let at = 0; at < groupCount; at++) {
    const parent = at > 0 && next() < 0.5 ? Math.floor(next() * at) : -1
    groups.push({
      parent,
      layout: choices[Math.floor(next() * choices.length)]?.() ?? null,
      circle: next() < 0.2,
      padding: 4 + Math.floor(next() * 20),
    })
  }
  const nodes: NodeSpec[] = []
  const nodeCount = 10 + Math.floor(next() * 50)
  for (let index = 0; index < nodeCount; index++) {
    nodes.push({
      group: next() < 0.85 ? Math.floor(next() * groupCount) : -1,
      radius: 3 + Math.floor(next() * 10),
      fixed: next() < 0.05,
    })
  }
  const edges: number[] = []
  const edgeCount = Math.floor(nodeCount * (0.8 + next()))
  for (let at = 0; at < edgeCount; at++) {
    const a = Math.floor(next() * nodeCount)
    const b = Math.floor(next() * nodeCount)
    if (a !== b) edges.push(a, b)
  }
  return { groups, nodes, edges }
}

describe('scopes', () => {
  it('lays out each scoped group with its own layout, then the top', async () => {
    const built = build({
      groups: [
        { parent: -1, layout: grid() },
        { parent: -1, layout: rings() },
      ],
      nodes: [
        ...Array.from({ length: 9 }, () => ({ group: 0 })),
        ...Array.from({ length: 6 }, () => ({ group: 1 })),
        { group: -1 },
      ],
      edges: [0, 9, 3, 15, 10, 15],
    })
    const result = await run(built, force({ steps: 80 }))
    if (!result) throw new Error('no plan')
    expect(result.name).toBe('force')
    expect(Array.from(result.movable.subarray(0, 16))).toEqual(new Array(16).fill(1))
    const xs = new Set<number>()
    const ys = new Set<number>()
    for (let index = 0; index < 9; index++) {
      xs.add(Math.round((result.xy[index * 2] ?? 0) * 1000))
      ys.add(Math.round((result.xy[index * 2 + 1] ?? 0) * 1000))
    }
    expect([xs.size, ys.size]).toEqual([3, 3])
    expect(overlaps(built.graph, result.xy)).toBe(0)
  })

  it('separates the containers when the definition has no layout', async () => {
    const built = build({
      groups: [
        { parent: -1, layout: grid() },
        { parent: -1, layout: grid() },
        { parent: -1, layout: rings() },
      ],
      nodes: Array.from({ length: 30 }, (_, index) => ({ group: index % 3 })),
    })
    const result = await run(built, null)
    if (!result) throw new Error('no plan')
    expect(result.name).toBe('grid')
    expect(overlaps(built.graph, result.xy)).toBe(0)
  })

  it('keeps fixed nodes and the blocks that hold them in place', async () => {
    const built = build({
      groups: [
        { parent: -1, layout: grid() },
        { parent: -1, layout: grid() },
      ],
      nodes: [{ group: 0, fixed: true }, { group: 0 }, { group: 0 }, { group: 1 }, { group: 1 }],
    })
    const before = Float32Array.from(built.graph.xy)
    const result = await run(built, force({ steps: 40 }))
    if (!result) throw new Error('no plan')
    expect(result.movable[0]).toBe(0)
    expect(result.xy[0]).toBe(before[0])
    expect(result.xy[1]).toBe(before[1])
  })

  it('arranges only the scope of the keyed members, and leaves the block in place', async () => {
    const built = build({
      groups: [
        { parent: -1, layout: grid() },
        { parent: -1, layout: grid() },
      ],
      nodes: [{ group: 0 }, { group: 0 }, { group: 0 }, { group: 1 }, { group: 1 }],
    })
    const keyed = new Uint8Array(built.graph.capacity)
    keyed[0] = 1
    keyed[1] = 1
    keyed[2] = 1
    const result = await run(built, force(), { keyed, fresh: false })
    if (!result) throw new Error('no plan')
    expect(result.name).toBe('grid')
    expect(Array.from(result.movable.subarray(0, 5))).toEqual([1, 1, 1, 0, 0])
    const center = (xy: Float32Array) => [
      ((xy[0] ?? 0) + (xy[2] ?? 0) + (xy[4] ?? 0)) / 3,
      ((xy[1] ?? 0) + (xy[3] ?? 0) + (xy[5] ?? 0)) / 3,
    ]
    const box = (xy: Float32Array) => {
      const xs = [xy[0] ?? 0, xy[2] ?? 0, xy[4] ?? 0]
      const ys = [xy[1] ?? 0, xy[3] ?? 0, xy[5] ?? 0]
      return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
    }
    expect(box(result.xy)[0]).toBeCloseTo(box(built.graph.xy)[0] ?? 0, 3)
    expect(box(result.xy)[1]).toBeCloseTo(box(built.graph.xy)[1] ?? 0, 3)
    expect(center(result.xy)).not.toEqual(center(built.graph.xy))
  })

  it('moves a container in its parent only when its own key is keyed', async () => {
    const built = build({
      groups: [
        { parent: -1, layout: grid() },
        { parent: -1, layout: grid() },
      ],
      nodes: [{ group: 0 }, { group: 0 }, { group: 1 }, { group: 1 }],
    })
    const keyed = new Uint8Array(built.graph.capacity)
    keyed[built.count] = 1
    const result = await run(built, grid(), { keyed, fresh: false })
    if (!result) throw new Error('no plan')
    expect(result.name).toBe('grid')
    expect(Array.from(result.movable.subarray(0, 4))).toEqual([1, 1, 0, 0])
    const dx = (result.xy[0] ?? 0) - (built.graph.xy[0] ?? 0)
    const dy = (result.xy[1] ?? 0) - (built.graph.xy[1] ?? 0)
    expect((result.xy[2] ?? 0) - (built.graph.xy[2] ?? 0)).toBeCloseTo(dx, 3)
    expect((result.xy[3] ?? 0) - (built.graph.xy[3] ?? 0)).toBeCloseTo(dy, 3)
  })

  it('replaces the outermost running scopes with the given layout', async () => {
    const built = build({
      groups: [{ parent: -1, layout: rings() }],
      nodes: Array.from({ length: 6 }, () => ({ group: 0 })),
    })
    const keyed = new Uint8Array(built.graph.capacity).fill(1, 0, 6)
    const result = await run(built, force(), { keyed, replace: grid(), fresh: false })
    expect(result?.name).toBe('grid')
  })

  it('runs a whole scope again when it is asked to, or when nodes arrive in a grid', async () => {
    const built = build({
      groups: [{ parent: -1, layout: grid() }],
      nodes: Array.from({ length: 6 }, () => ({ group: 0 })),
    })
    const none = new Uint8Array(built.graph.capacity)
    const rerun = await run(built, null, { keyed: none, rerun: new Set([6]), fresh: false })
    expect(Array.from(rerun?.movable.subarray(0, 6) ?? [])).toEqual([1, 1, 1, 1, 1, 1])
    const arrival = new Uint8Array(built.graph.capacity)
    arrival[5] = 1
    const grown = await run(built, null, { keyed: arrival, arrivals: true, fresh: false })
    expect(Array.from(grown?.movable.subarray(0, 6) ?? [])).toEqual([1, 1, 1, 1, 1, 1])
    const explicit = await run(built, null, { keyed: arrival, fresh: false })
    expect(Array.from(explicit?.movable.subarray(0, 6) ?? [])).toEqual([0, 0, 0, 0, 0, 1])
  })

  it('passes blocks, the container and its members to the layouts', async () => {
    const seen: LayoutGraph[] = []
    const spy = (name: string): Layout => {
      const inner = grid()
      return {
        name,
        options: {},
        start(graph: LayoutGraph, listener: LayoutListener): LayoutRun {
          seen.push(graph)
          return inner.start(graph, listener)
        },
      }
    }
    const built = build({
      groups: [
        { parent: -1, layout: spy('outer') },
        { parent: 0, layout: spy('inner') },
      ],
      nodes: [{ group: 0 }, { group: 1 }, { group: 1 }, { group: -1 }],
      edges: [0, 1, 1, 2, 2, 3],
    })
    await run(built, spy('top'))
    expect(seen.map((graph) => graph.container?.key ?? 'top')).toEqual(['g1', 'g0', 'top'])
    const outer = seen[1]
    expect(outer?.blocks?.size[1]).toBe(2)
    expect(outer?.blocks?.keys(1)).toEqual(['n1', 'n2'])
    expect(Array.from(outer?.edges ?? [])).toEqual([0, 1])
    const top = seen[2]
    expect(top?.blocks?.size[1]).toBe(3)
    expect(Array.from(top?.edges ?? [])).toEqual([1, 0])
  })

  it('leaves no overlap on random trees with mixed layouts and fixed nodes', async () => {
    for (let seed = 1; seed <= 200; seed++) {
      const built = build(randomSpec(seed))
      const top = choices[seed % choices.length]?.() ?? null
      const result = await run(built, top)
      if (!result) continue
      const fixed = built.graph.movable
      for (let index = 0; index < built.count; index++) {
        if (fixed[index] === 1) continue
        expect(result.xy[index * 2]).toBe(built.graph.xy[index * 2])
      }
      expect({ seed, overlaps: overlaps(built.graph, result.xy) }).toEqual({ seed, overlaps: 0 })
    }
  }, 30_000)

  it('stops every run in flight', async () => {
    const stopped: string[] = []
    const never = (name: string): Layout => ({
      name,
      options: {},
      start: () => ({ pin() {}, stop: () => stopped.push(name) }),
    })
    const built = build({
      groups: [
        { parent: -1, layout: never('a') },
        { parent: -1, layout: never('b') },
      ],
      nodes: [{ group: 0 }, { group: 0 }, { group: 1 }, { group: 1 }],
    })
    const plan = planScopes(request(built, grid()))
    let ended = false
    const handle = plan?.start({
      progress: () => {},
      end: () => {
        ended = true
      },
    })
    handle?.stop()
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(stopped.sort()).toEqual(['a', 'b'])
    expect(ended).toBe(false)
  })

  it('keeps, on a run of its own, the last arrangement of a scope that did not change', async () => {
    const starts: string[] = []
    const counted = (inner: Layout, name = 'counted'): Layout => ({
      name,
      options: {},
      start(graph: LayoutGraph, listener: LayoutListener): LayoutRun {
        starts.push(String(graph.container?.key))
        return inner.start(graph, listener)
      },
    })
    const inside = counted(rings())
    const built = build({
      groups: [
        { parent: -1, layout: inside },
        { parent: -1, layout: inside },
      ],
      nodes: [0, 0, 0, 0, 1, 1, 1].map((group) => ({ group })),
      edges: [0, 1, 1, 2, 4, 5],
    })
    const memory = {}
    const first = await run(built, force(), { memory, arrivals: true })
    expect(starts.sort()).toEqual(['g0', 'g1'])
    starts.length = 0
    const second = await run(built, force(), { memory, arrivals: true, fresh: false })
    expect(starts).toEqual([])
    const offset = (xy: Float32Array | undefined, a: number, b: number) => [
      (xy?.[a * 2] ?? 0) - (xy?.[b * 2] ?? 0),
      (xy?.[a * 2 + 1] ?? 0) - (xy?.[b * 2 + 1] ?? 0),
    ]
    for (const [a, b] of [
      [0, 2],
      [4, 6],
    ] as const) {
      const before = offset(first?.xy, a, b)
      const after = offset(second?.xy, a, b)
      expect(Math.hypot(before[0] ?? 0, before[1] ?? 0)).toBeCloseTo(
        Math.hypot(after[0] ?? 0, after[1] ?? 0),
        2,
      )
    }
    built.graph.radius[5] = 9
    await run(built, force(), { memory, arrivals: true, fresh: false })
    expect(starts).toEqual(['g1'])
    starts.length = 0
    await run(built, null, { memory, arrivals: true, fresh: false, replace: counted(grid(), 'other') })
    expect(starts.sort()).toEqual(['g0', 'g1'])
    starts.length = 0
    await run(built, force(), { arrivals: true, fresh: false })
    expect(starts.sort()).toEqual(['g0', 'g1'])
    starts.length = 0
    await run(built, force(), { memory, fresh: false })
    expect(starts.sort()).toEqual(['g0', 'g1'])
  })

  it('runs a scope again when one of its members is pinned or kept in place', async () => {
    const starts: string[] = []
    const inside: Layout = {
      name: 'counted',
      options: {},
      start(graph: LayoutGraph, listener: LayoutListener): LayoutRun {
        starts.push(String(graph.container?.key))
        return grid().start(graph, listener)
      },
    }
    const built = build({
      groups: [{ parent: -1, layout: inside }],
      nodes: [0, 0, 0].map((group) => ({ group })),
    })
    const memory = {}
    await run(built, null, { memory, arrivals: true })
    const keyed = new Uint8Array(built.graph.capacity).fill(1)
    keyed[1] = 0
    await run(built, null, { memory, keyed, fresh: false })
    expect(starts).toEqual(['g0', 'g0'])
  })

  it('stops the force and grid scopes waiting in the pool and in slices', async () => {
    const groups = Array.from({ length: 40 }, (_, at) => ({
      parent: -1,
      layout: at % 2 === 0 ? force() : grid(),
    }))
    const built = build({
      groups,
      nodes: Array.from({ length: 6000 }, (_, index) => ({ group: index % 40 })),
    })
    const plan = planScopes(request(built, force()))
    let ended = false
    const handle = plan?.start({
      progress: () => {},
      end: () => {
        ended = true
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    handle?.stop()
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(ended).toBe(false)
    const again = await run(built, force())
    expect(again?.xy.length).toBe(built.graph.capacity * 2)
  })
})
