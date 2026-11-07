import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { Layout, LayoutGraph, LayoutListener } from '../types'
import type { GraphPositionEvent } from './events'
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
  readonly pins: (readonly [number, number, number])[]
  stopped: boolean
}

function fakeLayout(options: object = {}) {
  const runs: FakeRun[] = []
  const layout: Layout = {
    name: 'fake',
    options,
    start(graph, listener) {
      const run: FakeRun = { graph, listener, pins: [], stopped: false }
      runs.push(run)
      return {
        pin: (index, x, y) => run.pins.push([index, x, y]),
        stop: () => {
          run.stopped = true
        },
      }
    },
  }
  return { layout, runs }
}

const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
]

function definition(layout: Layout | null, items: readonly Item[]) {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(items, { x: 'x', y: 'y' }),
    ],
    layout,
  })
}

function movers(run: FakeRun | undefined): number[] {
  return Array.from(run?.graph.movable ?? []).flatMap((flag, index) => (flag === 1 ? [index] : []))
}

function spread(run: FakeRun, step = 100): Float32Array {
  const xy = new Float32Array(run.graph.capacity * 2)
  for (let index = 0; index < run.graph.capacity; index++) {
    xy[index * 2] = run.graph.movable[index] === 1 ? index * step : (run.graph.xy[index * 2] ?? 0)
    xy[index * 2 + 1] =
      run.graph.movable[index] === 1 ? index * step : (run.graph.xy[index * 2 + 1] ?? 0)
  }
  return xy
}

let dom: FakeDom

function mount(layout: Layout | null, items: readonly Item[]): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definition(layout, items), ariaLabel: 'graphe' },
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
})

const loose: Item[] = [{ id: 'a' }, { id: 'b' }, { id: 'c', x: 7, y: 9 }]

describe('layouts in the host', () => {
  it('runs the definition layout on the first nodes and follows it to the end', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(layout, loose)
    const seen: string[] = []
    let moved: GraphPositionEvent | null = null
    graph.on('layoutend', ({ completed }) => seen.push(`end ${completed}`))
    graph.on('positionchange', (event) => {
      moved = event
    })
    const run = runs[0]
    if (!run) throw new Error('no run')
    expect(runs).toHaveLength(1)
    expect(movers(run)).toEqual([0, 1])
    expect(graph.store.get().layout).toEqual({ running: true, progress: 0 })
    run.listener.progress(spread(run, 50), 0.5)
    dom.flushFrames()
    expect(graph.positions.get('b')).toEqual({ x: 50, y: 50 })
    expect(graph.positions.get('c')).toEqual({ x: 7, y: 9 })
    expect(graph.store.get().layout).toEqual({ running: true, progress: 0.5 })
    run.listener.end(spread(run))
    dom.flushFrames()
    expect(graph.positions.get('b')).toEqual({ x: 100, y: 100 })
    expect(graph.store.get().layout).toEqual({ running: false, progress: 1 })
    expect(seen).toEqual(['end true'])
    expect(moved).toMatchObject({ origin: 'layout' })
    expect([...((moved as GraphPositionEvent | null)?.positions.keys() ?? [])]).toEqual(['a', 'b'])
  })

  it('keeps the view framed during the first run until the user moves it', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(layout, loose)
    const run = runs[0]
    if (!run) throw new Error('no run')
    const before = graph.view.get()
    run.listener.progress(spread(run, 1000), 0.3)
    dom.flushFrames()
    const framed = graph.view.get()
    expect(framed.zoom).toBeLessThan(before.zoom)
    graph.view.set({ x: 0, y: 0, zoom: 3 })
    dom.flushFrames()
    run.listener.progress(spread(run, 2000), 0.6)
    dom.flushFrames()
    expect(graph.view.get()).toEqual({ x: 0, y: 0, zoom: 3 })
  })

  it('lets a fit asked at the end of the first run replace the automatic framing', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(layout, loose)
    const run = runs[0]
    if (!run) throw new Error('no run')
    graph.on('layoutend', () => graph.view.fit(['a'], { padding: 0 }))
    run.listener.progress(spread(run, 500), 0.5)
    dom.flushFrames()
    run.listener.end(spread(run, 1000))
    dom.flushFrames()
    expect(graph.view.get()).toMatchObject({ x: 0, y: 0 })
  })

  it('frames the keys of a fit asked before the first frame during the first run', () => {
    dom.restore()
    dom = installDom(0, 0)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { layout, runs } = fakeLayout()
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      { definition: definition(layout, loose), ariaLabel: 'graphe' },
      fakeRenderer,
    )
    graph.view.fit(['b'], { padding: 0 })
    dom.resize(800, 600)
    dom.flushFrames()
    const run = runs[0]
    if (!run) throw new Error('no run')
    run.listener.progress(spread(run, 500), 0.5)
    dom.flushFrames()
    expect(graph.view.get()).toMatchObject({ x: 500, y: 500 })
    run.listener.end(spread(run, 1000))
    dom.flushFrames()
    expect(graph.view.get()).toMatchObject({ x: 1000, y: 1000 })
    warn.mockRestore()
  })

  it('frees a node whose x and y become empty, and leaves it in place until a layout runs', async () => {
    const { layout, runs } = fakeLayout()
    const placed: Item[] = [{ id: 'a', x: 10, y: 10 }, { id: 'b' }, { id: 'c', x: 7, y: 9 }]
    const graph = mount(null, placed)
    graph.update({ definition: definition(null, [{ id: 'a' }, { id: 'b' }, placed[2] as Item]) })
    dom.flushFrames()
    expect(graph.positions.get('a')).toEqual({ x: 10, y: 10 })
    const done = graph.layout.run(layout, { duration: 0 })
    const run = runs[0] as FakeRun
    expect(movers(run)).toEqual([0, 1])
    run.listener.end(spread(run, 50))
    await done
    expect(graph.positions.get('a')).toEqual({ x: 0, y: 0 })
    expect(graph.positions.get('c')).toEqual({ x: 7, y: 9 })
  })

  it('lays out around the targets of fixed nodes that glide to new data positions', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(null, loose)
    graph.update({
      definition: definition(null, [{ id: 'a' }, { id: 'b' }, { id: 'c', x: 1000, y: 1000 }]),
    })
    void graph.layout.run(layout, { fit: { padding: 0 } })
    const run = runs[0] as FakeRun
    expect([run.graph.xy[4], run.graph.xy[5]]).toEqual([1000, 1000])
    run.listener.end(spread(run))
    dom.flushFrames()
    expect(graph.positions.get('c')).toEqual({ x: 1000, y: 1000 })
    const view = graph.view.get()
    expect(view.x).toBeCloseTo(500, 0)
    expect(view.y).toBeCloseTo(500, 0)
  })

  it('moves only new nodes once laid out, and merges arrivals into a running layout', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(layout, loose)
    const first = runs[0]
    if (!first) throw new Error('no run')
    first.listener.end(spread(first))
    dom.flushFrames()
    const starts: string[] = []
    graph.on('layoutstart', ({ name }) => starts.push(name))
    graph.update({ definition: definition(layout, [...loose, { id: 'd' }]) })
    dom.flushFrames()
    expect(movers(runs[1])).toEqual([3])
    graph.update({ definition: definition(layout, [...loose, { id: 'd' }, { id: 'e' }]) })
    dom.flushFrames()
    expect(runs[1]?.stopped).toBe(true)
    expect(movers(runs[2])).toEqual([3, 4])
    expect(starts).toEqual(['fake'])
  })

  it('reruns everything when the layout options change, not for an equal layout', () => {
    const first = fakeLayout({ strength: 1 })
    const graph = mount(first.layout, loose)
    first.runs[0]?.listener.end(spread(first.runs[0] as FakeRun))
    dom.flushFrames()
    const same = fakeLayout({ strength: 1 })
    graph.update({ definition: definition(same.layout, loose) })
    dom.flushFrames()
    expect(same.runs).toHaveLength(0)
    const unset = fakeLayout({ strength: 1, spacing: undefined })
    graph.update({ definition: definition(unset.layout, loose) })
    dom.flushFrames()
    expect(unset.runs).toHaveLength(0)
    const other = fakeLayout({ strength: 2 })
    graph.update({ definition: definition(other.layout, loose) })
    dom.flushFrames()
    expect(movers(other.runs[0])).toEqual([0, 1])
    graph.update({ definition: definition(null, loose) })
    dom.flushFrames()
    expect(other.runs[0]?.stopped).toBe(true)
    expect(graph.store.get().layout.running).toBe(false)
  })

  it('runs on demand for chosen keys, resolves on completion and on stop', async () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(null, loose)
    expect(runs).toHaveLength(0)
    await expect(graph.layout.run()).rejects.toThrow('no layout')
    const done = graph.layout.run(layout, { keys: ['b', 'c', 'missing'] })
    expect(movers(runs[0])).toEqual([1])
    runs[0]?.listener.end(spread(runs[0] as FakeRun))
    dom.flushFrames()
    await expect(done).resolves.toBe(true)
    const ends: boolean[] = []
    graph.on('layoutend', ({ completed }) => ends.push(completed))
    const stopped = graph.layout.run(layout)
    graph.layout.stop()
    await expect(stopped).resolves.toBe(false)
    expect(runs[1]?.stopped).toBe(true)
    expect(ends).toEqual([false])
    runs[1]?.listener.end(spread(runs[1] as FakeRun, 9))
    expect(graph.positions.get('b')).toEqual({ x: 100, y: 100 })
  })

  it('glides to a result delivered at once, then frames it when asked', async () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(null, loose)
    let ended: boolean | null = null
    const done = graph.layout.run(layout, { fit: true }).then((completed) => {
      ended = completed
    })
    const run = runs[0] as FakeRun
    run.listener.end(spread(run))
    expect(graph.store.get().layout).toEqual({ running: true, progress: 1 })
    expect(graph.positions.get('b')).not.toEqual({ x: 100, y: 100 })
    await Promise.resolve()
    expect(ended).toBeNull()
    dom.flushFrames()
    await done
    expect(ended).toBe(true)
    expect(graph.positions.get('b')).toEqual({ x: 100, y: 100 })
    expect(graph.store.get().layout).toEqual({ running: false, progress: 1 })
    const view = graph.view.get()
    expect(view.x).toBeCloseTo(50, 0)
    expect(view.y).toBeCloseTo(50, 0)
  })

  it('frames the first glide once the element has a size', () => {
    let report = () => {}
    vi.stubGlobal(
      'ResizeObserver',
      class {
        readonly #callback: ResizeObserverCallback
        constructor(callback: ResizeObserverCallback) {
          this.#callback = callback
        }
        observe() {
          report = () =>
            this.#callback(
              [{ contentRect: { width: 800, height: 600 } } as ResizeObserverEntry],
              this as unknown as ResizeObserver,
            )
        }
        disconnect() {}
      },
    )
    const { layout, runs } = fakeLayout()
    const graph = mount(layout, loose)
    runs[0]?.listener.end(spread(runs[0] as FakeRun))
    report()
    dom.flushFrames()
    expect(graph.positions.get('b')).toEqual({ x: 100, y: 100 })
    const view = graph.view.get()
    expect(view.x).toBeCloseTo(50, 0)
    expect(view.y).toBeCloseTo(50, 0)
  })

  it('freezes the glide where it is when stopped', async () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(null, loose)
    const before = graph.positions.get('b')
    const done = graph.layout.run(layout)
    runs[0]?.listener.end(spread(runs[0] as FakeRun))
    graph.layout.stop()
    await expect(done).resolves.toBe(false)
    dom.flushFrames()
    expect(graph.positions.get('b')).toEqual(before)
  })

  it('redoes every node when nodes arrive for a layout that is not incremental', () => {
    const { layout, runs } = fakeLayout()
    const whole: Layout = { ...layout, incremental: false }
    const graph = mount(whole, loose)
    runs[0]?.listener.end(spread(runs[0] as FakeRun))
    dom.flushFrames()
    graph.update({ definition: definition(whole, [...loose, { id: 'd' }]) })
    dom.flushFrames()
    expect(runs).toHaveLength(2)
    expect(movers(runs[1])).toEqual([0, 1, 3])
  })

  it('pins dragged nodes and nodes moved through the API', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(layout, loose)
    const run = runs[0]
    if (!run) throw new Error('no run')
    run.listener.progress(spread(run), 0.2)
    dom.flushFrames()
    graph.positions.set([['a', { x: -40, y: -40 }]])
    expect(run.pins).toEqual([[0, -40, -40]])
    const canvas = graph.element.querySelector('canvas')
    const b = graph.view.toScreen(graph.positions.get('b') ?? { x: 0, y: 0 })
    const down = { clientX: b.x, clientY: b.y, button: 0, pointerId: 1, bubbles: true }
    canvas?.dispatchEvent(new PointerEvent('pointerdown', down))
    canvas?.dispatchEvent(new PointerEvent('pointermove', { ...down, clientX: b.x + 30 }))
    run.listener.progress(spread(run, 500), 0.4)
    expect(run.pins.at(-1)?.[0]).toBe(1)
    expect(graph.positions.get('b')?.x).not.toBe(500)
    canvas?.dispatchEvent(new PointerEvent('pointerup', { ...down, clientX: b.x + 30 }))
  })

  it('stops quietly when destroyed', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(layout, loose)
    graph.destroy()
    expect(runs[0]?.stopped).toBe(true)
    expect(() => runs[0]?.listener.progress(spread(runs[0] as FakeRun), 0.5)).not.toThrow()
  })
})
