import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { LoadingSource } from '../testing/loading-source'
import type { GraphDefinitionOptions, Layout, LayoutGraph, LayoutListener, Mark } from '../types'
import type { GraphDataStatus } from './events'
import { createGraphHost, type GraphInstance } from './mount-graph'

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
  readonly graph: LayoutGraph
  readonly listener: LayoutListener
}

function fakeLayout() {
  const runs: FakeRun[] = []
  const layout: Layout = {
    name: 'fake',
    options: {},
    start(graph, listener) {
      runs.push({ graph, listener })
      return { pin: () => {}, stop: () => {} }
    },
  }
  return { layout, runs }
}

function movers(run: FakeRun | undefined): number {
  return Array.from(run?.graph.movable ?? []).filter((flag) => flag === 1).length
}

const linkOptions = { source: 'from', target: 'to' } as const

let dom: FakeDom

function mount(
  marks: readonly Mark[],
  options: Omit<GraphDefinitionOptions<never, Mark>, 'marks'> = {},
): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: defineGraph({ marks, ...options }), ariaLabel: 'graphe' },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
  vi.useRealTimers()
})

describe('loading of live sources', () => {
  it('tells in the store, by an event and by loaded() when the data is in', async () => {
    const live = new LoadingSource<Item>()
    const graph = mount([nodes(live)])
    expect(graph.store.get().data).toEqual({ loading: true, failed: [] })
    const seen: GraphDataStatus[] = []
    graph.on('loadingchange', (event) => seen.push(event))
    let done = false
    void graph.loaded().then(() => {
      done = true
    })
    live.add({ id: 'a' })
    dom.flushFrames()
    await Promise.resolve()
    expect(done).toBe(false)
    live.set('ready')
    expect(graph.store.get().data.loading).toBe(true)
    dom.flushFrames()
    expect(graph.store.get().data).toEqual({ loading: false, failed: [] })
    expect(seen).toEqual([{ loading: false, failed: [] }])
    await vi.waitFor(() => expect(done).toBe(true))
    await expect(graph.loaded()).resolves.toBeUndefined()
    graph.destroy()
  })

  it('is loaded at once with array data and sources without a status', async () => {
    const plain = new LoadingSource<Item>(null)
    const graph = mount([nodes([{ id: 'a' }]), nodes(plain)])
    expect(graph.store.get().data).toEqual({ loading: false, failed: [] })
    await expect(graph.loaded()).resolves.toBeUndefined()
    graph.destroy()
  })

  it('lists a failed source and stops loading, without throwing', async () => {
    const live = new LoadingSource<Item>()
    const graph = mount([nodes(live)])
    const loaded = graph.loaded()
    live.add({ id: 'a' })
    live.set('error')
    dom.flushFrames()
    await expect(loaded).resolves.toBeUndefined()
    expect(graph.store.get().data).toEqual({ loading: false, failed: [live] })
    expect(graph.issues()).toEqual([])
    expect(graph.count().nodes).toBe(1)
    live.set('ready')
    dom.flushFrames()
    expect(graph.store.get().data.failed).toEqual([])
    graph.destroy()
  })

  it('goes back to loading for a new definition with sources that load', () => {
    const first = new LoadingSource<Item>('ready')
    const definition = (source: LoadingSource<Item>) => defineGraph({ marks: [nodes(source)] })
    const graph = mount([nodes(first)])
    expect(graph.store.get().data.loading).toBe(false)
    const second = new LoadingSource<Item>()
    graph.update({ definition: definition(second) })
    expect(graph.store.get().data.loading).toBe(true)
    const third = new LoadingSource<Item>('ready')
    graph.update({ definition: definition(third) })
    expect(graph.store.get().data.loading).toBe(false)
    second.set('error')
    dom.flushFrames()
    expect(graph.store.get().data).toEqual({ loading: false, failed: [] })
    expect(second.watchers).toBe(0)
    graph.destroy()
  })

  it('rejects loaded() once destroyed, also while it waits', async () => {
    const live = new LoadingSource<Item>()
    const graph = mount([nodes(live)])
    const waiting = graph.loaded()
    graph.destroy()
    await expect(waiting).rejects.toThrow('destroyed')
    await expect(graph.loaded()).rejects.toThrow('destroyed')
    expect(graph.store.get().data.loading).toBe(true)
    expect(live.watchers).toBe(0)
  })
})

describe('first layout and fit on complete data', () => {
  it('runs the first layout once, on every node, when the sources are loaded', () => {
    const { layout, runs } = fakeLayout()
    const people = new LoadingSource<Item>()
    const links = new LoadingSource<Link>()
    const graph = mount([nodes(people), edges(links, linkOptions)], { layout })
    people.add({ id: 'a' })
    dom.flushFrames()
    expect(graph.count().nodes).toBe(1)
    expect(runs).toHaveLength(0)
    people.add({ id: 'b' }, { id: 'c' })
    links.add({ id: 'ab', from: 'a', to: 'b' })
    people.set('ready')
    dom.flushFrames()
    expect(runs).toHaveLength(0)
    links.set('ready')
    dom.flushFrames()
    expect(runs).toHaveLength(1)
    expect(movers(runs[0])).toBe(3)
    expect(runs[0]?.graph.edges).toHaveLength(2)
    graph.destroy()
  })

  it('runs it in the same frame when the last batch and the ready signal come together', () => {
    const { layout, runs } = fakeLayout()
    const people = new LoadingSource<Item>()
    const graph = mount([nodes(people)], { layout })
    people.add({ id: 'a' }, { id: 'b' })
    people.set('ready')
    dom.flushFrames()
    expect(runs).toHaveLength(1)
    expect(movers(runs[0])).toBe(2)
    graph.destroy()
  })

  it('places the arrivals after the first layout as before', () => {
    const { layout, runs } = fakeLayout()
    const people = new LoadingSource<Item>('ready')
    people.add({ id: 'a' })
    const graph = mount([nodes(people)], { layout })
    expect(runs).toHaveLength(1)
    people.add({ id: 'b' })
    dom.flushFrames()
    expect(runs).toHaveLength(2)
    expect(movers(runs[1])).toBe(2)
    expect(graph.store.get().layout.running).toBe(true)
    graph.destroy()
  })

  it('runs on the first nodes of array data, as before', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount([nodes<Item>([{ id: 'a' }, { id: 'b' }])], { layout })
    expect(runs).toHaveLength(1)
    expect(movers(runs[0])).toBe(2)
    graph.destroy()
  })

  it('stops waiting for a source that never loads once the time is up', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { layout, runs } = fakeLayout()
    const people = new LoadingSource<Item>()
    const graph = mount([nodes(people)], { layout, waitForData: 500 })
    vi.advanceTimersByTime(2000)
    dom.flushFrames()
    expect(runs).toHaveLength(0)
    people.add({ id: 'a' })
    dom.flushFrames()
    vi.advanceTimersByTime(499)
    dom.flushFrames()
    expect(runs).toHaveLength(0)
    vi.advanceTimersByTime(1)
    dom.flushFrames()
    expect(runs).toHaveLength(1)
    people.add({ id: 'b' })
    dom.flushFrames()
    expect(runs).toHaveLength(2)
    expect(movers(runs[1])).toBe(2)
    expect(graph.store.get().data.loading).toBe(true)
    graph.destroy()
  })

  it('does not wait with waitForData false, and waits with no limit with true', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const eager = fakeLayout()
    const first = new LoadingSource<Item>()
    const graph = mount([nodes(first)], { layout: eager.layout, waitForData: false })
    first.add({ id: 'a' })
    dom.flushFrames()
    expect(eager.runs).toHaveLength(1)
    graph.destroy()

    const patient = fakeLayout()
    const second = new LoadingSource<Item>()
    const other = mount([nodes(second)], { layout: patient.layout, waitForData: true })
    second.add({ id: 'a' })
    dom.flushFrames()
    vi.advanceTimersByTime(60_000)
    dom.flushFrames()
    expect(patient.runs).toHaveLength(0)
    second.set('ready')
    dom.flushFrames()
    expect(patient.runs).toHaveLength(1)
    other.destroy()
  })

  it('starts the layout when the source fails', () => {
    const { layout, runs } = fakeLayout()
    const people = new LoadingSource<Item>()
    const graph = mount([nodes(people)], { layout })
    people.add({ id: 'a' })
    dom.flushFrames()
    people.set('error')
    dom.flushFrames()
    expect(runs).toHaveLength(1)
    graph.destroy()
  })

  it('fits the view once the data is in', () => {
    const people = new LoadingSource<Item>()
    const graph = mount([nodes(people, { x: 'x', y: 'y' })])
    const start = graph.view.get()
    people.add({ id: 'a', x: 1000, y: 1000 })
    dom.flushFrames()
    expect(graph.view.get()).toEqual(start)
    people.add({ id: 'b', x: 1200, y: 1000 })
    people.set('ready')
    dom.flushFrames()
    expect(graph.view.get().x).toBeCloseTo(1100)
    expect(graph.view.get().y).toBeCloseTo(1000)
    graph.destroy()
  })
})
