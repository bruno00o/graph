import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
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

function fake(name: string, options: object = {}, incremental?: false): Layout {
  return {
    name,
    options,
    ...(incremental === false ? { incremental } : {}),
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

function movers(run: FakeRun | undefined): Key[] {
  if (!run) return []
  const keys: Key[] = []
  for (let index = 0; index < run.graph.capacity; index++) {
    const key = run.graph.keys[index]
    if (run.graph.movable[index] === 1 && key !== undefined) keys.push(key)
  }
  return keys
}

function scopeOf(run: FakeRun | undefined): Key | null {
  return run?.graph.container?.key ?? null
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

function definition(
  data: readonly Item[] | LoadingSource<Item> = items,
  top: Layout | null = fake('top'),
  inner: (item: Item) => Layout | null = () => fake('inner'),
  extra: { waitForData?: number | boolean } = {},
) {
  const marks = [
    edges<Link>(links, { source: 'from', target: 'to' }),
    Array.isArray(data)
      ? nodes<Item>(data as Item[], {
          x: 'x',
          y: 'y',
          parent: 'parent',
          container: { layout: inner },
        })
      : nodes(data as LoadingSource<Item>, {
          x: 'x',
          y: 'y',
          parent: 'parent',
          container: { layout: inner },
        }),
  ]
  return defineGraph({
    marks,
    layout: top,
    transitions: { layout: 0 },
    ...extra,
  })
}

let dom: FakeDom

function mount(graphDefinition = definition()): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: graphDefinition, ariaLabel: 'graphe' },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

beforeAll(() => {
  enableScopes()
})

beforeEach(() => {
  runs.length = 0
  dom = installDom()
})

afterEach(() => {
  dom.restore()
  vi.useRealTimers()
})

describe('layouts of groups', () => {
  it('lays out each group, then the top, as one run named after the top', () => {
    const seen: string[] = []
    const graph = mount()
    graph.on('layoutend', ({ name, completed }) => seen.push(`end ${name} ${completed}`))
    expect(runs.map(scopeOf)).toEqual(['g', 'h'])
    expect(movers(runs[0])).toEqual(['a', 'b'])
    expect(graph.store.get().layout.running).toBe(true)
    finish(runs[0])
    finish(runs[1])
    expect(runs.map(scopeOf)).toEqual(['g', 'h', null])
    const top = runs[2]
    expect(top?.name).toBe('top')
    const block = top?.graph.keys.indexOf('g') ?? -1
    expect(top?.graph.blocks?.size[block]).toBe(2)
    expect(top?.graph.blocks?.keys(block)).toEqual(['a', 'b'])
    expect(seen).toEqual([])
    finish(top, 400)
    dom.flushFrames()
    expect(seen).toEqual(['end top true'])
    expect(graph.store.get().layout.running).toBe(false)
    const a = graph.positions.get('a')
    const b = graph.positions.get('b')
    expect(Math.abs((b?.x ?? 0) - (a?.x ?? 0))).toBeCloseTo(40, 3)
    graph.destroy()
  })

  it('names the run after the outermost group layout when the definition has none', async () => {
    const started: string[] = []
    const graph = mount(definition(items, null))
    graph.on('layoutstart', ({ name }) => started.push(name))
    const done = graph.layout.run()
    expect(started).toEqual(['inner'])
    for (const run of runs.filter((run) => !run.stopped)) finish(run)
    dom.flushFrames()
    expect(await done).toBe(true)
    expect(runs.some((run) => run.name === 'top')).toBe(false)
    graph.destroy()
  })

  it('stops every layout of the run', async () => {
    const graph = mount()
    const ended: boolean[] = []
    graph.on('layoutend', ({ completed }) => ended.push(completed))
    graph.layout.stop()
    expect(runs.map((run) => run.stopped)).toEqual([true, true])
    expect(ended).toEqual([false])
    expect(graph.store.get().layout.running).toBe(false)
    graph.destroy()
  })

  it('arranges only the group of the given keys, and keeps the group in place', async () => {
    const graph = mount()
    for (const run of [...runs]) finish(run)
    finish(runs[2], 400)
    dom.flushFrames()
    runs.length = 0
    const before = graph.positions.get('c')
    const done = graph.layout.run(undefined, { keys: ['a', 'b'] })
    expect(runs.map(scopeOf)).toEqual(['g'])
    expect(movers(runs[0])).toEqual(['a', 'b'])
    finish(runs[0], 10)
    dom.flushFrames()
    expect(await done).toBe(true)
    expect(graph.positions.get('c')).toEqual(before)
    graph.destroy()
  })

  it('moves a group in its parent only when its own key is given', async () => {
    const graph = mount()
    for (const run of [...runs]) finish(run)
    finish(runs[2], 400)
    dom.flushFrames()
    runs.length = 0
    const done = graph.layout.run(undefined, { keys: ['g'] })
    expect(runs.map(scopeOf)).toEqual([null])
    expect(movers(runs[0])).toEqual(['g'])
    finish(runs[0])
    dom.flushFrames()
    expect(await done).toBe(true)
    graph.destroy()
  })

  it('lays out an arrival in its group only', () => {
    const graph = mount()
    for (const run of [...runs]) finish(run)
    finish(runs[2], 400)
    dom.flushFrames()
    runs.length = 0
    graph.update({ definition: definition([...items, { id: 'f', parent: 'g' }]) })
    dom.flushFrames()
    expect(runs.map(scopeOf)).toEqual(['g'])
    expect(movers(runs[0])).toEqual(['f'])
    graph.destroy()
  })

  it('runs a whole group again when its layout is not incremental', () => {
    const whole = () => fake('whole', {}, false)
    const graph = mount(definition(items, fake('top'), whole))
    for (const run of [...runs]) finish(run)
    finish(runs[2], 400)
    dom.flushFrames()
    runs.length = 0
    graph.update({
      definition: definition([...items, { id: 'f', parent: 'g' }], fake('top'), whole),
    })
    dom.flushFrames()
    expect(runs.map(scopeOf)).toEqual(['g'])
    expect(movers(runs[0])).toEqual(['a', 'b', 'f'])
    graph.destroy()
  })

  it('runs nothing again for a definition rebuilt with equal layouts', () => {
    const graph = mount()
    for (const run of [...runs]) finish(run)
    finish(runs[2], 400)
    dom.flushFrames()
    runs.length = 0
    graph.update({ definition: definition([...items]) })
    dom.flushFrames()
    expect(runs).toHaveLength(0)
    graph.update({
      definition: definition([...items], fake('top'), () => fake('inner', { gap: 2 })),
    })
    dom.flushFrames()
    expect(runs.map(scopeOf)).toEqual(['g', 'h'])
    graph.destroy()
  })

  it('waits for the data before the first run', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const source = new LoadingSource<Item>()
    const graph = mount(definition(source, fake('top'), () => fake('inner'), { waitForData: true }))
    for (const item of items) source.add(item)
    dom.flushFrames()
    expect(runs).toHaveLength(0)
    source.own.set('ready')
    dom.flushFrames()
    expect(runs.map(scopeOf)).toEqual(['g', 'h'])
    graph.destroy()
  })

  it('keeps members placed by the data where the data puts them', () => {
    const graph = mount(
      definition([{ id: 'g' }, { id: 'a', parent: 'g', x: 5, y: 6 }, { id: 'b', parent: 'g' }]),
    )
    expect(movers(runs[0])).toEqual(['b'])
    finish(runs[0])
    dom.flushFrames()
    expect(graph.positions.get('a')).toEqual({ x: 5, y: 6 })
    graph.destroy()
  })
})
