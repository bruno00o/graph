import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { BridgeOptions, BundleListener, BundlePaths, EdgeRouting, RouteGraph } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'
import type { RenderInput } from './renderer'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

interface FakeRun {
  readonly graph: RouteGraph
  readonly listener: BundleListener
  stopped: boolean
}

function fakeRouting(radius = 0, maxEdges = 1000) {
  const runs: FakeRun[] = []
  const routing: EdgeRouting = {
    name: 'fake',
    options: {},
    radius,
    maxEdges,
    start(graph, listener) {
      const run: FakeRun = { graph, listener, stopped: false }
      runs.push(run)
      return {
        stop: () => {
          run.stopped = true
        },
      }
    },
  }
  return { routing, runs }
}

function elbows(graph: RouteGraph): BundlePaths {
  const offsets = new Uint32Array(graph.edges.length + 1)
  const points: number[] = []
  graph.edges.forEach((_, at) => {
    const source = graph.ends[at * 2] ?? 0
    const target = graph.ends[at * 2 + 1] ?? 0
    const ax = graph.xy[source * 2] ?? 0
    const ay = graph.xy[source * 2 + 1] ?? 0
    const bx = graph.xy[target * 2] ?? 0
    const by = graph.xy[target * 2 + 1] ?? 0
    points.push(ax, ay, ax, by, bx, by)
    offsets[at + 1] = (offsets[at] ?? 0) + 3
  })
  return { offsets, points: new Float32Array(points) }
}

const items: Item[] = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 400, y: 300 },
  { id: 'c', x: -200, y: 150 },
  { id: 'd', x: 300, y: 150 },
]

const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'aa', from: 'a', to: 'a' },
]

const twins: Link[] = [...links, { id: 'ab2', from: 'a', to: 'b' }]

const others: Link[] = [{ id: 'cd', from: 'c', to: 'd' }]

interface Options {
  readonly routing?: EdgeRouting | null
  readonly bridges?: BridgeOptions | boolean | null
  readonly skip?: string
  readonly layered?: boolean
  readonly merged?: boolean
  readonly far?: boolean
}

function definition(options: Options) {
  return defineGraph({
    marks: [
      edges(options.merged ? twins : links, {
        source: 'from',
        target: 'to',
        route: (link) => link.id !== options.skip,
        merge: options.merged ?? false,
        ...(options.layered ? { layer: 'main' as const } : {}),
      }),
      edges(others, {
        source: 'from',
        target: 'to',
        route: (link) => link.id !== options.skip,
        ...(options.far ? { minZoom: () => 2 } : {}),
        ...(options.layered ? { layer: 'other' as const } : {}),
      }),
      nodes<Item>(items, { x: 'x', y: 'y', size: () => 20 }),
    ],
    states: { off: { hide: true } },
    routing: options.routing ?? null,
    bridges: options.bridges ?? null,
  })
}

let dom: FakeDom
let input: RenderInput | null = null

function mount(options: Options): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: definition(options),
      ariaLabel: 'graphe',
      initialView: { x: 100, y: 150, zoom: 1 },
    },
    () => ({
      ...fakeRenderer(),
      sync: (next) => {
        input = next
      },
    }),
  )
  dom.flushFrames()
  return graph
}

function settle(): void {
  vi.advanceTimersByTime(200)
  dom.flushFrames()
}

function routed(runs: readonly FakeRun[]): FakeRun {
  const run = runs.at(-1)
  if (!run) throw new Error('no run')
  run.listener.end(elbows(run.graph))
  dom.flushFrames()
  return run
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  dom = installDom()
  input = null
})

afterEach(() => {
  dom.restore()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('edge routing in the host', () => {
  it('routes once nodes stand still, without loops, and draws the routes', () => {
    const { routing, runs } = fakeRouting()
    const graph = mount({ routing })
    expect(runs).toHaveLength(0)
    settle()
    const run = runs[0]
    if (!run) throw new Error('no run')
    expect(Array.from(run.graph.edges).map((index) => run.graph.keys[index])).toEqual(['ab', 'cd'])
    expect(run.graph.extents[0]).toBeCloseTo(10)
    expect(run.graph.parents[0]).toBe(-1)
    expect(graph.store.get().routing.running).toBe(true)
    expect(graph.store.get().bundling.running).toBe(false)
    routed(runs)
    expect(graph.store.get().routing.running).toBe(false)
    expect(input?.bundles?.bundled).toBe(2)
    expect(input?.bundles?.lanes).toBe(false)
    expect(input?.bundles?.measured).toBe(true)
  })

  it('leaves out the edges with route false', () => {
    const { routing, runs } = fakeRouting()
    mount({ routing, skip: 'cd' })
    settle()
    const run = runs[0]
    expect(Array.from(run?.graph.edges ?? []).map((index) => run?.graph.keys[index])).toEqual([
      'ab',
    ])
  })

  it('picks a routed edge along its route', () => {
    const { routing, runs } = fakeRouting()
    const graph = mount({ routing })
    const point = graph.view.toScreen({ x: 0, y: 250 })
    expect(graph.pick(point)).toBeNull()
    settle()
    routed(runs)
    expect(graph.pick(point)?.key).toBe('ab')
  })

  it('resolves run once the routes are drawn, and reroutes after a move', async () => {
    const { routing, runs } = fakeRouting()
    const graph = mount({ routing })
    const done = graph.routing.run()
    routed(runs)
    await expect(done).resolves.toBe(true)
    await expect(graph.bundling.run()).resolves.toBe(false)
    graph.positions.set([['b', { x: 500, y: 300 }]])
    dom.flushFrames()
    expect(input?.bundles?.bundled).toBe(2)
    settle()
    expect(runs).toHaveLength(2)
    expect(runs[1]?.graph.xy[2]).toBe(500)
  })

  it('redraws a new radius without routing again', () => {
    const first = fakeRouting(0)
    const graph = mount({ routing: first.routing })
    settle()
    routed(first.runs)
    const rounder = fakeRouting(8)
    graph.update({ definition: definition({ routing: rounder.routing }) })
    settle()
    expect(rounder.runs).toHaveLength(0)
    expect(input?.bundles?.bundled).toBe(2)
  })

  it('keeps edges straight above maxEdges', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { routing, runs } = fakeRouting(0, 1)
    const graph = mount({ routing })
    await expect(graph.routing.run()).resolves.toBe(false)
    expect(runs).toHaveLength(0)
  })

  it('routes merged parallel edges once', () => {
    const { routing, runs } = fakeRouting()
    mount({ routing, merged: true })
    settle()
    const run = runs.at(-1)
    expect(run?.graph.edges).toHaveLength(2)
  })

  it('routes neither hidden edges nor around hidden nodes, and routes again when they show', () => {
    const { routing, runs } = fakeRouting()
    const graph = mount({ routing, far: true })
    graph.states.set('off', { nodes: ['d'] })
    settle()
    const run = runs.at(-1)
    expect(Array.from(run?.graph.edges ?? []).map((index) => run?.graph.keys[index])).toEqual([
      'ab',
    ])
    expect(run?.graph.extents[3 * 2]).toBe(0)
    graph.states.set('off', {})
    dom.flushFrames()
    settle()
    expect(runs.at(-1)?.graph.extents[3 * 2]).toBeCloseTo(10)
    expect(runs.at(-1)?.graph.edges).toHaveLength(1)
    graph.view.set({ x: 100, y: 150, zoom: 3 })
    dom.flushFrames()
    settle()
    expect(runs.at(-1)?.graph.edges).toHaveLength(2)
  })

  it('routes only the edges of shown layers', () => {
    const { routing, runs } = fakeRouting()
    const graph = mount({ routing, layered: true })
    graph.layers.hide(['other'])
    settle()
    const run = runs.at(-1)
    expect(Array.from(run?.graph.edges ?? []).map((index) => run?.graph.keys[index])).toEqual([
      'ab',
    ])
  })
})

describe('bridges in the host', () => {
  it('finds crossings of straight edges once nodes stand still', () => {
    const graph = mount({ bridges: true })
    settle()
    settle()
    const set = input?.bridges
    expect(set?.count).toBe(1)
    expect(set?.shape).toBe('arc')
    graph.positions.set([['d', { x: 200, y: 400 }]])
    dom.flushFrames()
    settle()
    settle()
    expect(input?.bridges ?? null).toBeNull()
  })

  it('jumps the horizontal segment of a route', () => {
    const { routing, runs } = fakeRouting()
    mount({ routing, bridges: { shape: 'gap' } })
    settle()
    routed(runs)
    settle()
    settle()
    const set = input?.bridges
    if (!set) throw new Error('no bridges')
    expect(set.shape).toBe('gap')
    expect(set.count).toBe(1)
    expect(set.countOf(2)).toBe(1)
    expect(set.data[set.firstOf(2) * 4]).toBe(0)
  })

  it('draws no bridges over an edge hidden by a state', () => {
    const graph = mount({ bridges: true })
    settle()
    settle()
    expect(input?.bridges?.count).toBe(1)
    graph.states.set('off', { edges: ['cd'] })
    dom.flushFrames()
    settle()
    settle()
    expect(input?.bridges ?? null).toBeNull()
  })

  it('draws no bridges without the option, or for a hidden layer', () => {
    mount({})
    settle()
    expect(input?.bridges ?? null).toBeNull()
    const graph = mount({ bridges: true, layered: true })
    settle()
    settle()
    expect(input?.bridges?.count).toBe(1)
    graph.layers.hide(['other'])
    settle()
    settle()
    expect(input?.bridges ?? null).toBeNull()
  })
})
