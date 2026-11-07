import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type {
  BundleGraph,
  BundleListener,
  BundlePaths,
  EdgeBundling,
  Layout,
  LayoutGraph,
  LayoutListener,
} from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'
import type { RenderInput } from './renderer'

interface Item {
  readonly id: string
  readonly x?: number
  readonly y?: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

interface FakeRun {
  readonly graph: BundleGraph
  readonly listener: BundleListener
  stopped: boolean
}

function fakeBundling(options: object = {}, strength = 1, maxEdges = 1000) {
  const runs: FakeRun[] = []
  const bundling: EdgeBundling = {
    name: 'fake',
    options,
    strength,
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
  return { bundling, runs }
}

function arches(graph: BundleGraph, height: number): BundlePaths {
  const offsets = new Uint32Array(graph.edges.length + 1)
  const points: number[] = []
  graph.edges.forEach((_, at) => {
    const source = graph.ends[at * 2] ?? 0
    const target = graph.ends[at * 2 + 1] ?? 0
    const ax = graph.xy[source * 2] ?? 0
    const ay = graph.xy[source * 2 + 1] ?? 0
    const bx = graph.xy[target * 2] ?? 0
    const by = graph.xy[target * 2 + 1] ?? 0
    for (let k = 0; k <= 10; k++) {
      const u = k / 10
      points.push(ax + (bx - ax) * u, ay + (by - ay) * u + Math.sin(Math.PI * u) * height)
    }
    offsets[at + 1] = (offsets[at] ?? 0) + 11
  })
  return { offsets, points: new Float32Array(points) }
}

const items: Item[] = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 400, y: 0 },
  { id: 'c', x: 400, y: 300 },
]

const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
  { id: 'aa', from: 'a', to: 'a' },
]

function definition(
  bundling: EdgeBundling | null,
  options: { readonly skip?: string; readonly items?: readonly Item[] } = {},
) {
  return defineGraph({
    marks: [
      edges<Link>(links, {
        source: 'from',
        target: 'to',
        bundle: (link) => link.id !== options.skip,
      }),
      nodes<Item>(options.items ?? items, { x: 'x', y: 'y' }),
    ],
    bundling,
  })
}

let dom: FakeDom
let input: RenderInput | null = null

function mount(
  bundling: EdgeBundling | null,
  options: { readonly skip?: string; readonly items?: readonly Item[] } = {},
): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: definition(bundling, options),
      ariaLabel: 'graphe',
      initialView: { x: 200, y: 0, zoom: 1 },
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

describe('edge bundling in the host', () => {
  it('bundles once nodes stand still, without loops, and draws the paths', () => {
    const { bundling, runs } = fakeBundling()
    const graph = mount(bundling)
    expect(runs).toHaveLength(0)
    settle()
    const run = runs[0]
    if (!run) throw new Error('no run')
    expect(Array.from(run.graph.edges).map((index) => run.graph.keys[index])).toEqual(['ab', 'bc'])
    expect(Array.from(run.graph.ends)).toEqual([0, 1, 1, 2])
    expect(run.graph.datum(run.graph.edges[0] ?? 0)).toEqual(links[0])
    expect(graph.store.get().bundling.running).toBe(true)
    run.listener.end(arches(run.graph, 100))
    dom.flushFrames()
    expect(graph.store.get().bundling.running).toBe(false)
    expect(input?.bundles?.bundled).toBe(2)
    expect(input?.bundles?.mix).toBe(1)
  })

  it('leaves out the edges with bundle false', () => {
    const { bundling, runs } = fakeBundling()
    mount(bundling, { skip: 'bc' })
    settle()
    const run = runs[0]
    expect(Array.from(run?.graph.edges ?? []).map((index) => run?.graph.keys[index])).toEqual([
      'ab',
    ])
  })

  it('picks a bundled edge along its path', () => {
    const { bundling, runs } = fakeBundling()
    const graph = mount(bundling)
    expect(graph.pick({ x: 400, y: 400 })).toBeNull()
    settle()
    const run = runs[0]
    if (!run) throw new Error('no run')
    run.listener.end(arches(run.graph, 100))
    dom.flushFrames()
    expect(graph.pick({ x: 400, y: 400 })?.key).toBe('ab')
  })

  it('runs again after a move, and keeps the drawn bundles meanwhile', () => {
    const { bundling, runs } = fakeBundling()
    const graph = mount(bundling)
    settle()
    const first = runs[0]
    if (!first) throw new Error('no run')
    first.listener.end(arches(first.graph, 100))
    dom.flushFrames()
    graph.positions.set([['c', { x: 500, y: 300 }]])
    dom.flushFrames()
    expect(input?.bundles?.bundled).toBe(2)
    settle()
    expect(runs).toHaveLength(2)
    expect(runs[1]?.graph.xy[4]).toBe(500)
  })

  it('stops a run when nodes move before it ends', () => {
    const { bundling, runs } = fakeBundling()
    const graph = mount(bundling)
    settle()
    graph.positions.set([['c', { x: 500, y: 300 }]])
    dom.flushFrames()
    expect(runs[0]?.stopped).toBe(true)
    expect(graph.store.get().bundling.running).toBe(false)
  })

  it('resolves run once the bundles are drawn', async () => {
    const { bundling, runs } = fakeBundling()
    const graph = mount(bundling)
    const done = graph.bundling.run()
    const run = runs[0]
    if (!run) throw new Error('no run')
    run.listener.end(arches(run.graph, 100))
    await expect(done).resolves.toBe(true)
  })

  it('keeps edges straight above maxEdges and without bundling', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { bundling, runs } = fakeBundling({}, 1, 1)
    const graph = mount(bundling)
    await expect(graph.bundling.run()).resolves.toBe(false)
    expect(runs).toHaveLength(0)
    const plain = mount(null)
    await expect(plain.bundling.run()).resolves.toBe(false)
  })

  it('eases to a new strength without computing again', () => {
    const first = fakeBundling({ radius: 1 }, 1)
    const graph = mount(first.bundling)
    settle()
    const run = first.runs[0]
    if (!run) throw new Error('no run')
    run.listener.end(arches(run.graph, 100))
    dom.flushFrames()
    const softer = fakeBundling({ radius: 1 }, 0.5)
    graph.update({ definition: definition(softer.bundling) })
    settle()
    expect(softer.runs).toHaveLength(0)
    expect(graph.pick({ x: 400, y: 350 })?.key).toBe('ab')
    const unset = fakeBundling({ radius: 1, iterations: undefined }, 0.5)
    graph.update({ definition: definition(unset.bundling) })
    settle()
    expect(unset.runs).toHaveLength(0)
    const wider = fakeBundling({ radius: 2 }, 0.5)
    graph.update({ definition: definition(wider.bundling) })
    settle()
    expect(wider.runs).toHaveLength(1)
  })

  it('eases to straight lines when a layout moves most nodes', () => {
    const { bundling, runs } = fakeBundling()
    const layoutRuns: { graph: LayoutGraph; listener: LayoutListener }[] = []
    const layout: Layout = {
      name: 'fake',
      options: {},
      start(graph, listener) {
        layoutRuns.push({ graph, listener })
        return { pin: () => {}, stop: () => {} }
      },
    }
    const graph = mount(bundling, { items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] })
    settle()
    runs[0]?.listener.end(arches(runs[0].graph, 100))
    dom.flushFrames()
    expect(input?.bundles?.bundled).toBe(2)
    void graph.layout.run(layout, { keys: ['a', 'b', 'c'] })
    dom.flushFrames()
    expect(input?.bundles?.bundled).toBe(0)
  })
})
