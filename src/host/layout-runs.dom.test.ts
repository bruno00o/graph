import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { grid, placed } from '../layouts'
import { enableScopes } from '../layouts/scopes'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { LoadingSource } from '../testing/loading-source'
import type { Key, Layout, LayoutGraph, LayoutListener } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'

interface Item {
  readonly id: string
  readonly parent?: string
  readonly x?: number
  readonly y?: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

interface FakeRun {
  readonly name: string
  readonly graph: LayoutGraph
  readonly listener: LayoutListener
  stopped: boolean
}

const runs: FakeRun[] = []

function fake(name: string, options: object = {}): Layout {
  return {
    name,
    options,
    start(graph, listener) {
      const run: FakeRun = { name, graph, listener, stopped: false }
      runs.push(run)
      return {
        pin: () => {},
        stop: () => {
          run.stopped = true
        },
      }
    },
  }
}

function finish(run: FakeRun | undefined, step = 40): void {
  if (!run) throw new Error('no run')
  const { graph } = run
  const xy = Float32Array.from(graph.xy)
  let at = 0
  for (let index = 0; index < graph.capacity; index++) {
    if (graph.movable[index] !== 1) continue
    xy[index * 2] = at * step
    xy[index * 2 + 1] = 0
    at++
  }
  run.listener.end(xy)
}

const items: Item[] = [
  { id: 'g' },
  { id: 'h' },
  { id: 'a', parent: 'g' },
  { id: 'b', parent: 'g' },
  { id: 'c', parent: 'h' },
  { id: 'd', parent: 'h' },
  { id: 'e' },
]

const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'ac', from: 'a', to: 'c' },
  { id: 'de', from: 'd', to: 'e' },
]

let dom: FakeDom
const reported: unknown[] = []

function mount(definition: ReturnType<typeof defineGraph>): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(container, { definition, ariaLabel: 'graphe' }, fakeRenderer)
  dom.flushFrames()
  return graph
}

async function settle(): Promise<void> {
  for (let round = 0; round < 5; round++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    dom.flushFrames()
  }
}

beforeAll(() => {
  enableScopes()
})

beforeEach(() => {
  runs.length = 0
  reported.length = 0
  dom = installDom()
  vi.stubGlobal('reportError', (error: unknown) => {
    reported.push(error)
  })
})

afterEach(() => {
  dom.restore()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('a layout that throws', () => {
  it('ends the run when the order of a grid throws, instead of running forever', async () => {
    const order = (a: Item, b: Item) => {
      if (a.id === 'b' || b.id === 'b') throw new Error('boom')
      return a.id.localeCompare(b.id)
    }
    const graph = mount(
      defineGraph({
        marks: [nodes<Item>([{ id: 'a' }, { id: 'b' }, { id: 'c' }], {})],
        layout: null,
        transitions: { layout: 0 },
      }),
    )
    const ended: boolean[] = []
    graph.on('layoutend', ({ completed }) => ended.push(completed))
    let settled = false
    void graph.layout.run(grid<Item>({ order })).then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    await settle()
    expect(reported).toHaveLength(1)
    expect(graph.store.get().layout.running).toBe(false)
    expect(settled).toBe(true)
    expect(ended).toHaveLength(1)
    graph.destroy()
  })

  it('ends the run when the layout of a group throws, instead of running forever', async () => {
    const order = (a: Item, b: Item) => {
      if (a.id === 'b' || b.id === 'b') throw new Error('boom')
      return a.id.localeCompare(b.id)
    }
    const graph = mount(
      defineGraph({
        marks: [
          nodes<Item>(items, { parent: 'parent', container: { layout: grid<Item>({ order }) } }),
        ],
        layout: grid<Item>(),
        transitions: { layout: 0 },
      }),
    )
    await settle()
    await new Promise((resolve) => setTimeout(resolve, 50))
    await settle()
    expect(graph.store.get().layout.running).toBe(false)
    expect(reported).toHaveLength(1)
    graph.destroy()
  })

  it('reports the error of a layout whose start throws and leaves nothing running', async () => {
    const graph = mount(
      defineGraph({
        marks: [nodes<Item>([{ id: 'a' }, { id: 'b' }], {})],
        layout: null,
        transitions: { layout: 0 },
      }),
    )
    const failure = new Error('cannot start')
    const broken: Layout = {
      name: 'broken',
      options: {},
      start() {
        throw failure
      },
    }
    expect(await graph.layout.run(broken)).toBe(false)
    expect(reported).toEqual([failure])
    expect(graph.store.get().layout.running).toBe(false)
    graph.destroy()
  })
})

describe('a layout that throws when an arrival restarts it', () => {
  it('reports the error and leaves nothing running', async () => {
    const failure = new Error('cannot restart')
    let starts = 0
    const flaky: Layout = {
      name: 'flaky',
      options: {},
      start() {
        starts++
        if (starts > 1) throw failure
        return { pin: () => {}, stop: () => {} }
      },
    }
    const build = (data: Item[]) =>
      defineGraph({
        marks: [nodes<Item>(data, {})],
        layout: flaky,
        transitions: { layout: 0 },
      })
    const graph = mount(build([{ id: 'a' }, { id: 'b' }]))
    expect(graph.store.get().layout.running).toBe(true)
    graph.update({ definition: build([{ id: 'a' }, { id: 'b' }, { id: 'c' }]) })
    dom.flushFrames()
    await settle()
    expect(starts).toBe(2)
    expect(reported).toEqual([failure])
    expect(graph.store.get().layout.running).toBe(false)
    graph.destroy()
  })
})

describe('group layouts and the API', () => {
  it('computes only the keys of a group with others ignored, and moves nothing', async () => {
    const graph = mount(
      defineGraph({
        marks: [
          edges<Link>(links, { source: 'from', target: 'to' }),
          nodes<Item>(items, { parent: 'parent', container: { layout: () => fake('inner') } }),
        ],
        layout: fake('top'),
        transitions: { layout: 0 },
      }),
    )
    for (const run of [...runs]) finish(run)
    finish(runs[2], 400)
    dom.flushFrames()
    runs.length = 0
    const before = graph.positions.snapshot()
    const computed = graph.layout.compute(undefined, { keys: ['a', 'b'], others: 'ignored' })
    for (const run of [...runs]) finish(run, 7)
    const result = await computed
    expect([...result.keys()].sort()).toEqual(['a', 'b'])
    expect(graph.positions.snapshot()).toEqual(before)
    graph.destroy()
  })

  it('places a block at the mean of its members with placed', async () => {
    const graph = mount(
      defineGraph({
        marks: [
          nodes<Item>(items, { parent: 'parent', container: { layout: () => fake('inner') } }),
        ],
        layout: fake('top'),
        transitions: { layout: 0 },
      }),
    )
    for (const run of [...runs]) finish(run)
    finish(runs[2], 400)
    dom.flushFrames()
    const target = new Map<Key, { x: number; y: number }>([
      ['a', { x: 1000, y: 1000 }],
      ['b', { x: 1040, y: 1000 }],
    ])
    await graph.layout.run(placed(target), { keys: ['g'] })
    dom.flushFrames()
    const a = graph.positions.get('a')
    const b = graph.positions.get('b')
    expect(((a?.x ?? 0) + (b?.x ?? 0)) / 2).toBeCloseTo(1020, 0)
    graph.destroy()
  })

  it('lays a group out again when the item of its container changed', () => {
    interface Box extends Item {
      readonly columns?: number
    }
    const seen: unknown[] = []
    const inner = (): Layout => ({
      name: 'inner',
      options: {},
      incremental: false,
      start(graph, listener) {
        seen.push(graph.container?.datum)
        queueMicrotask(() => listener.end(Float32Array.from(graph.xy)))
        return { pin: () => {}, stop: () => {} }
      },
    })
    const build = (data: Box[], top: Layout) =>
      defineGraph({
        marks: [nodes<Box>(data, { parent: 'parent', container: { layout: inner } })],
        layout: top,
        transitions: { layout: 0 },
      })
    const first: Box[] = [
      { id: 'g', columns: 1 },
      { id: 'a', parent: 'g' },
      { id: 'b', parent: 'g' },
    ]
    const graph = mount(build(first, fake('top')))
    return settle().then(async () => {
      for (const run of [...runs]) finish(run)
      await settle()
      seen.length = 0
      const second: Box[] = [{ id: 'g', columns: 2 }, first[1] as Box, first[2] as Box]
      graph.update({ definition: build(second, fake('top', { other: true })) })
      dom.flushFrames()
      await settle()
      expect(seen).toEqual([{ id: 'g', columns: 2 }])
      graph.destroy()
    })
  })

  it('finishes a group run whose container layout changes before it ends', async () => {
    const build = (inner: () => Layout, relayout = false) =>
      defineGraph({
        marks: [
          edges<Link>(links, { source: 'from', target: 'to' }),
          nodes<Item>(items, { parent: 'parent', container: { layout: inner } }),
        ],
        layout: fake('top'),
        relayout,
        transitions: { layout: 0 },
      })
    const graph = mount(build(() => fake('inner')))
    expect(runs.map((run) => run.name)).toEqual(['inner', 'inner'])
    graph.update({ definition: build(() => fake('other', { changed: true })) })
    dom.flushFrames()
    for (let round = 0; round < 6; round++) {
      for (const run of runs.filter((run) => !run.stopped)) {
        run.stopped = true
        finish(run)
      }
      dom.flushFrames()
      await settle()
    }
    expect(runs.map((run) => run.name)).toContain('other')
    expect(graph.store.get().layout.running).toBe(false)
    graph.destroy()
  })

  it('finishes a group run when a group folds before it ends, with relayout', async () => {
    const graph = mount(
      defineGraph({
        marks: [
          edges<Link>(links, { source: 'from', target: 'to' }),
          nodes<Item>(items, { parent: 'parent', container: { layout: () => fake('inner') } }),
        ],
        layout: fake('top'),
        relayout: true,
        transitions: { layout: 0 },
      }),
    )
    const ends: boolean[] = []
    graph.on('layoutend', ({ completed }) => ends.push(completed))
    graph.groups.fold(['g'])
    dom.flushFrames()
    for (let round = 0; round < 6; round++) {
      for (const run of runs.filter((run) => !run.stopped)) {
        run.stopped = true
        finish(run)
      }
      dom.flushFrames()
      await settle()
    }
    expect(graph.store.get().layout.running).toBe(false)
    expect(ends.at(-1)).toBe(true)
    graph.destroy()
  })

  it('runs the group layouts once the data is loaded, with restored positions for some', async () => {
    const source = new LoadingSource<Item>('loading')
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({
          marks: [
            nodes<Item>(source, { parent: 'parent', container: { layout: () => fake('inner') } }),
          ],
          layout: fake('top'),
          transitions: { layout: 0 },
        }),
        ariaLabel: 'graphe',
        initialPositions: [['a', { x: 500, y: 500 }]],
      },
      fakeRenderer,
    )
    dom.flushFrames()
    source.add({ id: 'g' }, { id: 'a', parent: 'g' }, { id: 'h' })
    dom.flushFrames()
    await settle()
    expect(runs).toHaveLength(0)
    source.add({ id: 'b', parent: 'g' }, { id: 'c', parent: 'h' }, { id: 'd', parent: 'h' })
    source.set('ready')
    dom.flushFrames()
    await settle()
    for (let round = 0; round < 6; round++) {
      for (const run of runs.filter((run) => !run.stopped)) {
        run.stopped = true
        finish(run)
      }
      dom.flushFrames()
      await settle()
    }
    const scoped = runs.map((run) => run.graph.container?.key ?? null)
    expect(scoped).toContain('h')
    expect(graph.store.get().layout.running).toBe(false)
    const c = graph.positions.get('c')
    const d = graph.positions.get('d')
    expect(c && d && (c.x !== d.x || c.y !== d.y)).toBe(true)
    graph.destroy()
  })

  it('gives the computed positions to the nodes that were laid out, even when the data changes meanwhile', async () => {
    const graph = mount(
      defineGraph({
        marks: [nodes<Item>([{ id: 'a' }, { id: 'b' }, { id: 'c' }], {})],
        layout: null,
        transitions: { layout: 0 },
      }),
    )
    const computed = graph.layout.compute(fake('slow'))
    const run = runs.at(-1)
    graph.update({
      definition: defineGraph({
        marks: [nodes<Item>([{ id: 'a' }, { id: 'c' }], {})],
        layout: null,
        transitions: { layout: 0 },
      }),
    })
    dom.flushFrames()
    graph.update({
      definition: defineGraph({
        marks: [nodes<Item>([{ id: 'a' }, { id: 'c' }, { id: 'z' }], {})],
        layout: null,
        transitions: { layout: 0 },
      }),
    })
    dom.flushFrames()
    finish(run)
    const result = await computed
    expect([...result.keys()].sort()).toEqual(['a', 'b', 'c'])
    graph.destroy()
  })
})
