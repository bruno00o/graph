import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createLegend } from '../legend/index'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { TimeValue } from '../types'
import type { GraphTimeEvent } from './events'
import { internalsOf } from './internals'
import { createGraphHost, type GraphInstance, type MountGraphOptions } from './mount-graph'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly group: string
  readonly time?: TimeValue
  readonly parent?: string
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly time?: TimeValue
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0, group: 'north', time: { start: 0, end: 100 } },
  { id: 'b', x: 100, y: 0, group: 'north' },
  { id: 'c', x: 0, y: 100, group: 'south', time: { start: 50 } },
  { id: 'd', x: 0, y: -100, group: 'south', time: new Date(30) },
]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c', time: { start: 60, end: 80 } },
  { id: 'bd', from: 'b', to: 'd' },
  { id: 'ac', from: 'a', to: 'c', time: { start: 10, end: 40 } },
]

function define(data: readonly Item[] = items, fade = 0) {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', time: 'time' }),
      nodes<Item>(data, {
        x: 'x',
        y: 'y',
        color: 'group',
        time: 'time',
        parent: (item) => item.parent ?? null,
      }),
    ],
    interaction: { lasso: true, select: 'multiple' },
    time: { fade },
  })
}

let dom: FakeDom

function mount(options: Partial<MountGraphOptions> = {}, data: readonly Item[] = items) {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: define(data), ariaLabel: 'graph', ...options },
    () => fakeRenderer(),
  )
  graph.view.set({ x: 0, y: 0, zoom: 1 })
  dom.flushFrames()
  return graph as unknown as GraphInstance
}

function screenOf(graph: GraphInstance, key: string) {
  const position = graph.positions.get(key)
  if (!position) throw new Error(`no position for ${key}`)
  return graph.view.toScreen(position)
}

function middle(graph: GraphInstance, from: string, to: string) {
  const a = screenOf(graph, from)
  const b = screenOf(graph, to)
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

describe('time window', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('sets, reads and announces the window', () => {
    const graph = mount()
    const events: GraphTimeEvent[] = []
    graph.on('timechange', (event) => events.push(event))
    expect(graph.time.get()).toBeNull()
    graph.time.set({ start: new Date(10), end: 20 })
    expect(graph.time.get()).toEqual({ start: 10, end: 20 })
    expect(graph.store.get().time).toEqual({ start: 10, end: 20 })
    graph.time.set({ start: 10, end: 20 })
    graph.time.set(null)
    expect(events.map((event) => event.window)).toEqual([{ start: 10, end: 20 }, null])
    expect(() => graph.time.set({ start: 5, end: 1 })).toThrow(RangeError)
    expect(() => graph.time.set({ start: Number.NaN })).toThrow(RangeError)
  })

  it('starts from the initial window', () => {
    const graph = mount({ initialTime: { start: 60, end: 70 } })
    expect(graph.time.get()).toEqual({ start: 60, end: 70 })
  })

  it('neither picks elements out of the window nor edges whose end is out of it', () => {
    const graph = mount({ initialTime: { start: 0, end: 10 } })
    expect(graph.pick(screenOf(graph, 'a'))?.key).toBe('a')
    expect(graph.pick(screenOf(graph, 'c'))).toBeNull()
    expect(graph.pick(middle(graph, 'a', 'b'))?.key).toBe('ab')
    expect(graph.pick(middle(graph, 'b', 'c'))).toBeNull()
    graph.time.set({ start: 65, end: 66 })
    dom.flushFrames()
    expect(graph.pick(screenOf(graph, 'c'))?.key).toBe('c')
    expect(graph.pick(middle(graph, 'b', 'c'))?.key).toBe('bc')
    graph.time.set({ start: 85, end: 90 })
    dom.flushFrames()
    expect(graph.pick(middle(graph, 'b', 'c'))).toBeNull()
    graph.time.set({ start: 120, end: 130 })
    dom.flushFrames()
    expect(graph.pick(screenOf(graph, 'a'))).toBeNull()
    expect(graph.pick(screenOf(graph, 'b'))?.key).toBe('b')
  })

  it('shows an instant from the start of the window, not at its end', () => {
    const graph = mount({ initialTime: { start: 30, end: 31 } })
    expect(graph.pick(screenOf(graph, 'd'))?.key).toBe('d')
    graph.time.set({ start: 29, end: 30 })
    dom.flushFrames()
    expect(graph.pick(screenOf(graph, 'd'))).toBeNull()
    graph.time.set({ start: 30, end: 30 })
    dom.flushFrames()
    expect(graph.pick(screenOf(graph, 'd'))?.key).toBe('d')
  })

  it('moves the keyboard focus over nodes in the window only', () => {
    const graph = mount({ initialTime: { start: 0, end: 10 } })
    graph.focus.set({ kind: 'node', key: 'a' })
    graph.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    )
    dom.flushFrames()
    expect(graph.focus.get()?.key).toBe('a')
    graph.time.set(null)
    dom.flushFrames()
    graph.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    )
    dom.flushFrames()
    expect(graph.focus.get()?.key).toBe('c')
  })

  it('counts only the elements in the window in the legend', () => {
    const graph = mount({ initialTime: { start: 0, end: 10 } })
    const legend = createLegend(graph)
    const counts = () => {
      const color = legend.store.state.color
      return color?.type === 'categories' ? color.items.map((item) => [item.value, item.nodes]) : []
    }
    expect(counts()).toEqual([['north', 2]])
    graph.time.set({ start: 60, end: 70 })
    dom.flushFrames()
    vi.runAllTimers()
    expect(counts()).toEqual([
      ['north', 2],
      ['south', 1],
    ])
    graph.time.set({ start: 120, end: 130 })
    dom.flushFrames()
    vi.runAllTimers()
    expect(counts()).toEqual([
      ['north', 1],
      ['south', 1],
    ])
    legend.destroy()
  })

  it('searches paths over the elements in the window with visible', () => {
    const graph = mount({ initialTime: { start: 85, end: 90 } })
    expect(graph.paths.shortest('b', 'c')?.edges).toEqual(['bc'])
    expect(graph.paths.shortest('b', 'c', { visible: true })).toBeNull()
    expect(graph.paths.reach('b', { visible: true }).nodes).toEqual(['b', 'a'])
  })

  it('sends requests to onTimeChange in controlled mode', () => {
    const requests: GraphTimeEvent[] = []
    const graph = mount({ time: null, onTimeChange: (event) => requests.push(event) })
    const changes: GraphTimeEvent[] = []
    graph.on('timechange', (event) => changes.push(event))
    graph.time.set({ start: 1, end: 2 })
    expect(requests).toEqual([{ window: { start: 1, end: 2 } }])
    expect(graph.time.get()).toBeNull()
    graph.update({ time: { start: 1, end: 2 } })
    expect(graph.time.get()).toEqual({ start: 1, end: 2 })
    expect(changes).toEqual([{ window: { start: 1, end: 2 } }])
    graph.time.set({ start: 1, end: 2 })
    expect(requests).toHaveLength(1)
  })

  it('gives a folded group the time of the edges it gathers', () => {
    const nested: Item[] = [
      { id: 'g', x: 0, y: 0, group: 'north' },
      { id: 'a', x: -100, y: 0, group: 'north', parent: 'g', time: { start: 0, end: 100 } },
      { id: 'b', x: 100, y: 0, group: 'north', parent: 'g' },
      { id: 'c', x: 0, y: 100, group: 'south', time: { start: 50 } },
      { id: 'd', x: 0, y: -100, group: 'south', time: 30 },
    ]
    const graph = mount({ initialFolded: ['g'] }, nested)
    const scene = internalsOf(graph, 'test').scene
    const spans: number[][] = []
    for (let index = 0; index < scene.edges.capacity; index++) {
      if (scene.edges.alive[index] !== 1 || !scene.edges.time.timed(index)) continue
      spans.push([scene.edges.time.start[index] ?? 0, scene.edges.time.end[index] ?? 0])
    }
    expect(spans).toEqual([[10, 80]])
  })

  it('forgets the time of removed nodes', () => {
    const graph = mount()
    const scene = internalsOf(graph, 'test').scene
    expect(scene.nodes.time.count).toBe(3)
    graph.update({ definition: define(items.slice(0, 2)) })
    dom.flushFrames()
    expect(scene.nodes.time.count).toBe(1)
  })
})
