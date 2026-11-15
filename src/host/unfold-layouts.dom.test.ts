import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { enableScopes } from '../layouts/scopes'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { LoadingSource } from '../testing/loading-source'
import type { Key, Layout, LayoutGraph, LayoutListener, Point } from '../types'
import { createGraphHost, type GraphInstance, type MountGraphOptions } from './mount-graph'

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

function fake(name: string, incremental?: false): Layout {
  return {
    name,
    options: {},
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

function arranged(run: FakeRun, step: number): Float32Array {
  const { graph } = run
  const xy = Float32Array.from(graph.xy)
  let at = 0
  for (let index = 0; index < graph.capacity; index++) {
    if (graph.movable[index] !== 1) continue
    xy[index * 2] = at * step
    xy[index * 2 + 1] = 0
    at++
  }
  return xy
}

function finish(run: FakeRun | undefined, step = 40): void {
  if (!run) throw new Error('no run')
  run.listener.end(arranged(run, step))
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

function live(): FakeRun[] {
  return runs.filter((run) => !run.stopped)
}

function finishAll(step = 40): void {
  for (let guard = 0; guard < 20; guard++) {
    const run = runs.find((each) => !each.stopped && !ended.has(each))
    if (!run) return
    ended.add(run)
    finish(run, step)
  }
}

const ended = new Set<FakeRun>()

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
  { id: 'de', from: 'd', to: 'e' },
]

interface Options {
  readonly top?: Layout | null
  readonly inner?: (item: Item) => Layout | null
  readonly relayout?: boolean
  readonly duration?: number
  readonly waitForData?: boolean
}

function definition(data: readonly Item[] | LoadingSource<Item> = items, options: Options = {}) {
  const inner = options.inner ?? (() => fake('inner'))
  const mark = Array.isArray(data)
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
      })
  return defineGraph({
    marks: [edges<Link>(links, { source: 'from', target: 'to' }), mark],
    layout: options.top === undefined ? fake('top') : options.top,
    transitions: { layout: options.duration ?? 0 },
    ...(options.relayout ? { relayout: true } : {}),
    ...(options.waitForData ? { waitForData: true } : {}),
  })
}

let dom: FakeDom

function mount(
  graphDefinition = definition(),
  options: Partial<MountGraphOptions> = {},
): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: graphDefinition, ariaLabel: 'graphe', ...options },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

function at(graph: GraphInstance, key: Key): Point {
  const point = graph.positions.get(key)
  if (!point) throw new Error(`no position for ${String(key)}`)
  return point
}

function settle(graph: GraphInstance, step = 40): void {
  finishAll(step)
  dom.flushFrames()
  runs.length = 0
  ended.clear()
  expect(graph.store.get().layout.running).toBe(false)
}

function events(graph: GraphInstance): string[] {
  const seen: string[] = []
  graph.on('layoutstart', ({ name }) => seen.push(`start ${name}`))
  graph.on('layoutend', ({ name, completed }) => seen.push(`end ${name} ${completed}`))
  return seen
}

beforeAll(() => {
  enableScopes()
})

beforeEach(() => {
  runs.length = 0
  ended.clear()
  dom = installDom()
})

afterEach(() => {
  dom.restore()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('arranging a group as it unfolds', () => {
  it('arranges the members of a group with its layout, around the folded node', () => {
    const graph = mount(definition(), { initialFolded: ['g'] })
    settle(graph)
    const folded = at(graph, 'g')
    const seen = events(graph)
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(runs.map(scopeOf)).toEqual(['g'])
    expect(movers(runs[0])).toEqual(['a', 'b'])
    expect(seen).toEqual(['start inner'])
    expect(graph.store.get().layout.running).toBe(true)
    finish(runs[0])
    dom.flushFrames()
    expect(seen).toEqual(['start inner', 'end inner true'])
    expect(graph.store.get().layout.running).toBe(false)
    const a = at(graph, 'a')
    const b = at(graph, 'b')
    expect(b.x - a.x).toBeCloseTo(40, 3)
    expect(Math.abs((a.x + b.x) / 2 - folded.x)).toBeLessThan(2)
    expect(Math.abs(a.y - folded.y)).toBeLessThan(2)
    graph.destroy()
  })

  it('arranges without a layout in the definition', () => {
    const graph = mount(definition(items, { top: null }), { initialFolded: ['g', 'h'] })
    expect(runs).toHaveLength(0)
    const seen = events(graph)
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(runs.map(scopeOf)).toEqual(['g'])
    expect(seen).toEqual(['start inner'])
    finish(runs[0])
    dom.flushFrames()
    expect(seen).toEqual(['start inner', 'end inner true'])
    const a = at(graph, 'a')
    const b = at(graph, 'b')
    expect(b.x - a.x).toBeCloseTo(40, 3)
    graph.destroy()
  })

  it('emits one position change for the arranged members', () => {
    const graph = mount(definition(), { initialFolded: ['g'] })
    settle(graph)
    const moved: Key[][] = []
    graph.on('positionchange', ({ positions, origin }) => {
      if (origin === 'layout') moved.push([...positions.keys()])
    })
    graph.groups.unfold(['g'])
    dom.flushFrames()
    finish(runs[0])
    dom.flushFrames()
    expect(moved).toEqual([['a', 'b']])
    graph.destroy()
  })

  it('arranges nested groups from the deepest up', () => {
    const nested: Item[] = [
      { id: 'g' },
      { id: 's', parent: 'g' },
      { id: 'a', parent: 'g' },
      { id: 'x', parent: 's' },
      { id: 'y', parent: 's' },
      { id: 'e' },
    ]
    const graph = mount(definition(nested), { initialFolded: ['g'] })
    settle(graph)
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(runs.map(scopeOf)).toEqual(['s'])
    expect(movers(runs[0])).toEqual(['x', 'y'])
    finish(runs[0])
    expect(runs.map(scopeOf)).toEqual(['s', 'g'])
    expect(movers(runs[1])).toEqual(['a', 's'])
    finish(runs[1])
    dom.flushFrames()
    expect(graph.store.get().layout.running).toBe(false)
    const x = at(graph, 'x')
    const y = at(graph, 'y')
    expect(y.x - x.x).toBeCloseTo(40, 3)
    graph.destroy()
  })

  it('arranges only the newcomers of an incremental layout', () => {
    const graph = mount(definition(), { initialFolded: [] })
    settle(graph)
    graph.groups.fold(['g'])
    dom.flushFrames()
    graph.update({ definition: definition([...items, { id: 'f', parent: 'g' }]) })
    dom.flushFrames()
    expect(runs).toHaveLength(0)
    const before = { a: at(graph, 'a'), b: at(graph, 'b') }
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(runs.map(scopeOf)).toEqual(['g'])
    expect(movers(runs[0])).toEqual(['f'])
    finish(runs[0])
    dom.flushFrames()
    expect(at(graph, 'b').x - at(graph, 'a').x).toBeCloseTo(before.b.x - before.a.x, 3)
    graph.destroy()
  })

  it('arranges every member again when the layout is not incremental', () => {
    const whole = () => fake('whole', false)
    const graph = mount(definition(items, { inner: whole }), { initialFolded: [] })
    settle(graph)
    graph.groups.fold(['g'])
    dom.flushFrames()
    graph.update({
      definition: definition([...items, { id: 'f', parent: 'g' }], { inner: whole }),
    })
    dom.flushFrames()
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(runs.map(scopeOf)).toEqual(['g'])
    expect(movers(runs[0])).toEqual(['a', 'b', 'f'])
    graph.destroy()
  })

  it('recalls the arrangement of an unchanged group whose layout is not incremental', () => {
    const whole = () => fake('whole', false)
    const graph = mount(definition(items, { inner: whole }), { initialFolded: [] })
    settle(graph)
    const gap = at(graph, 'b').x - at(graph, 'a').x
    graph.groups.fold(['g'])
    dom.flushFrames()
    const seen = events(graph)
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(runs).toHaveLength(0)
    expect(seen).toEqual(['start whole', 'end whole true'])
    expect(at(graph, 'b').x - at(graph, 'a').x).toBeCloseTo(gap, 3)
    graph.destroy()
  })

  it('gives a dragged member its arranged place back on the next unfold', () => {
    const graph = mount(definition(), { initialFolded: [] })
    settle(graph)
    const gap = at(graph, 'b').x - at(graph, 'a').x
    expect(gap).toBeCloseTo(40, 3)
    const b = at(graph, 'b')
    graph.positions.set([['a', { x: b.x + 300, y: b.y + 200 }]])
    dom.flushFrames()
    graph.groups.fold(['g'])
    dom.flushFrames()
    const seen = events(graph)
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(runs).toHaveLength(0)
    expect(seen).toEqual([])
    expect(at(graph, 'b').x - at(graph, 'a').x).toBeCloseTo(gap, 3)
    expect(at(graph, 'b').y - at(graph, 'a').y).toBeCloseTo(0, 3)
    graph.destroy()
  })

  it('keeps a member placed by its data where the data puts it', () => {
    const data: Item[] = [
      { id: 'g' },
      { id: 'a', parent: 'g', x: 500, y: 600 },
      { id: 'b', parent: 'g' },
      { id: 'e' },
    ]
    const graph = mount(definition(data), { initialFolded: ['g'] })
    settle(graph)
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(runs.map(scopeOf)).toEqual(['g'])
    expect(movers(runs[0])).toEqual(['b'])
    finish(runs[0])
    dom.flushFrames()
    expect(at(graph, 'a')).toEqual({ x: 500, y: 600 })
    graph.destroy()
  })

  it('lays the whole graph out again with relayout, carrying the members with their block', () => {
    const graph = mount(definition(items, { relayout: true, duration: 400 }), {
      initialFolded: ['g'],
    })
    settle(graph, 400)
    const seen = events(graph)
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(runs.map(scopeOf)).toContain('g')
    for (const run of [...runs]) finish(run)
    const top = runs.find((run) => run.name === 'top')
    if (!top) throw new Error('no top run')
    expect(top.name).toBe('top')
    expect(seen).toEqual(['start top'])
    const block = top.graph.keys.indexOf('g')
    const shifted = (by: number) => {
      const xy = Float32Array.from(top.graph.xy)
      xy[block * 2] = (xy[block * 2] ?? 0) + by
      return xy
    }
    const before = at(graph, 'a')
    top.listener.progress(shifted(100), 0.5)
    expect(at(graph, 'a')).toEqual(before)
    dom.flushFrames()
    const carried = at(graph, 'a')
    expect(at(graph, 'b').x - carried.x).toBeCloseTo(40, 3)
    top.listener.progress(shifted(150), 0.8)
    expect(at(graph, 'a').x - carried.x).toBeCloseTo(50, 3)
    top.listener.end(shifted(150))
    expect(graph.store.get().layout.running).toBe(true)
    dom.flushFrames()
    expect(seen).toEqual(['start top', 'end top true'])
    expect(at(graph, 'b').x - at(graph, 'a').x).toBeCloseTo(40, 3)
    graph.destroy()
  })

  it('restores the positions of members of a folded group, then arranges them', () => {
    const graph = mount(definition(), {
      initialFolded: ['g'],
      initialPositions: [
        ['g', { x: 0, y: 0 }],
        ['h', { x: 300, y: 0 }],
        ['a', { x: -10, y: 5 }],
        ['b', { x: 10, y: -5 }],
        ['c', { x: 290, y: 0 }],
        ['d', { x: 310, y: 0 }],
        ['e', { x: 0, y: 300 }],
      ],
    })
    expect(runs).toHaveLength(0)
    expect(at(graph, 'g')).toEqual({ x: 0, y: 0 })
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(runs.map(scopeOf)).toEqual(['g'])
    const run = runs[0]
    const a = run?.graph.keys.indexOf('a') ?? -1
    expect(run?.graph.xy[a * 2]).toBeCloseTo(-10, 3)
    expect(run?.graph.xy[a * 2 + 1]).toBeCloseTo(5, 3)
    graph.destroy()
  })

  it('joins a second unfold to the run of the first', () => {
    const graph = mount(definition(), { initialFolded: ['g', 'h'] })
    settle(graph)
    const seen = events(graph)
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(runs.map(scopeOf)).toEqual(['g'])
    graph.groups.unfold(['h'])
    dom.flushFrames()
    expect(runs[0]?.stopped).toBe(true)
    expect(live().map(scopeOf)).toEqual(['g', 'h'])
    for (const run of live()) finish(run)
    dom.flushFrames()
    expect(seen).toEqual(['start inner', 'end inner true'])
    expect(graph.store.get().layout.running).toBe(false)
    graph.destroy()
  })

  it('stops the arrangement with layout.stop and leaves the members apart', () => {
    const graph = mount(definition(), { initialFolded: ['g'] })
    settle(graph)
    const seen = events(graph)
    graph.groups.unfold(['g'])
    dom.flushFrames()
    graph.layout.stop()
    dom.flushFrames()
    expect(runs[0]?.stopped).toBe(true)
    expect(seen).toEqual(['start inner', 'end inner false'])
    expect(graph.store.get().layout.running).toBe(false)
    expect(at(graph, 'a')).not.toEqual(at(graph, 'b'))
    graph.destroy()
  })

  it('arranges a group of controlled folded groups once the parent answers', () => {
    const onFoldChange = vi.fn()
    const graph = mount(definition(), { folded: ['g'], onFoldChange })
    settle(graph)
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(onFoldChange).toHaveBeenCalledWith({ folded: [] })
    expect(runs).toHaveLength(0)
    graph.update({ folded: [] })
    dom.flushFrames()
    expect(runs.map(scopeOf)).toEqual(['g'])
    graph.destroy()
  })

  it('arranges a group that is not incremental again when it loses members', () => {
    const whole = () => fake('whole', false)
    const graph = mount(definition(items, { inner: whole }), { initialFolded: [] })
    settle(graph)
    graph.update({
      definition: definition(
        items.filter((item) => item.id !== 'b'),
        { inner: whole },
      ),
    })
    dom.flushFrames()
    expect(runs.map(scopeOf)).toEqual(['g'])
    expect(movers(runs[0])).toEqual(['a'])
    graph.destroy()
  })

  it('waits for the data before the first run, unfolds included', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const source = new LoadingSource<Item>()
    const graph = mount(definition(source, { waitForData: true }), { initialFolded: ['g'] })
    for (const item of items) source.add(item)
    dom.flushFrames()
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(runs).toHaveLength(0)
    source.own.set('ready')
    dom.flushFrames()
    expect(runs.map(scopeOf).sort()).toEqual(['g', 'h'])
    graph.destroy()
  })

  it('runs nothing on unfold without container layouts', () => {
    const graph = mount(definition(items, { inner: () => null }), { initialFolded: [] })
    settle(graph)
    graph.groups.fold(['g'])
    dom.flushFrames()
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(runs).toHaveLength(0)
    graph.destroy()
  })
})
