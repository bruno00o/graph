import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { Layout, LayoutGraph, LayoutListener, View } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'

interface Item {
  readonly id: string
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

const items: Item[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
]

let dom: FakeDom
let clock = 0

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

function spread(run: FakeRun, step: number): Float32Array {
  const xy = new Float32Array(run.graph.capacity * 2)
  for (let index = 0; index < run.graph.capacity; index++) {
    xy[index * 2] = index * step
    xy[index * 2 + 1] = index * step
  }
  return xy
}

function mount(layout: Layout, wheelGlide?: number): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [edges<Link>(links, { source: 'from', target: 'to' }), nodes<Item>(items)],
        layout,
        interaction: { wheelGlide },
      }),
      ariaLabel: 'graph',
    },
    fakeRenderer,
  )
  dom.runFrames(clock)
  return graph
}

function canvasOf(graph: GraphInstance): HTMLCanvasElement {
  const canvas = graph.element.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  return canvas
}

function notch(graph: GraphInstance, time: number): void {
  clock = time
  const event = new WheelEvent('wheel', {
    deltaY: -3,
    deltaMode: 1,
    bubbles: true,
    cancelable: true,
  })
  for (const [name, value] of Object.entries({ clientX: 400, clientY: 300, timeStamp: time })) {
    Object.defineProperty(event, name, { value })
  }
  canvasOf(graph).dispatchEvent(event)
}

function frame(time: number): void {
  clock = time
  dom.runFrames(time)
}

beforeEach(() => {
  dom = installDom()
  clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('a view move during the framing of the first layout', () => {
  it('keeps a wheel notch that arrives while the first layout reports progress', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(layout)
    const run = runs[0]
    if (!run) throw new Error('no run')
    run.listener.progress(spread(run, 100), 0.2)
    frame(100)
    const framed: View = graph.view.get()
    notch(graph, 1_000)
    run.listener.progress(spread(run, 100), 0.4)
    for (let time = 1_016; time <= 1_400; time += 16) frame(time)
    expect(graph.view.get().zoom).toBeGreaterThan(framed.zoom * 1.05)
  })

  it('keeps a notch followed by a frame before the next progress', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(layout)
    const run = runs[0]
    if (!run) throw new Error('no run')
    run.listener.progress(spread(run, 100), 0.2)
    frame(100)
    const framed: View = graph.view.get()
    notch(graph, 1_000)
    frame(1_016)
    run.listener.progress(spread(run, 100), 0.4)
    for (let time = 1_032; time <= 1_400; time += 16) frame(time)
    expect(graph.view.get().zoom).toBeGreaterThan(framed.zoom * 1.05)
  })

  it('keeps a notch that jumps while the first layout reports progress', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(layout, 0)
    const run = runs[0]
    if (!run) throw new Error('no run')
    run.listener.progress(spread(run, 100), 0.2)
    frame(100)
    const framed: View = graph.view.get()
    notch(graph, 1_000)
    run.listener.progress(spread(run, 100), 0.4)
    for (let time = 1_016; time <= 1_400; time += 16) frame(time)
    expect(graph.view.get().zoom).toBeGreaterThan(framed.zoom * 1.05)
  })

  it('keeps a notch that comes after a progress in the same frame', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(layout)
    const run = runs[0]
    if (!run) throw new Error('no run')
    run.listener.progress(spread(run, 100), 0.2)
    frame(100)
    const framed: View = graph.view.get()
    run.listener.progress(spread(run, 100), 0.4)
    notch(graph, 1_000)
    for (let time = 1_016; time <= 1_400; time += 16) {
      run.listener.progress(spread(run, 100), 0.4 + time / 10_000)
      frame(time)
    }
    expect(graph.view.get().zoom).toBeGreaterThan(framed.zoom * 1.05)
  })

  it('keeps a keyboard zoom pressed while the first layout reports progress', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(layout)
    const run = runs[0]
    if (!run) throw new Error('no run')
    run.listener.progress(spread(run, 100), 0.2)
    frame(100)
    const framed: View = graph.view.get()
    clock = 1_000
    graph.element.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }))
    run.listener.progress(spread(run, 100), 0.4)
    for (let time = 1_016; time <= 1_600; time += 16) frame(time)
    expect(graph.view.get().zoom).toBeGreaterThan(framed.zoom * 1.05)
  })

  it('keeps five wheel notches spread over a layout that reports progress before every frame', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(layout)
    const run = runs[0]
    if (!run) throw new Error('no run')
    run.listener.progress(spread(run, 100), 0.1)
    frame(16)
    const framed: View = graph.view.get()
    for (let time = 32; time <= 1_200; time += 16) {
      if (time % 160 === 0) notch(graph, time - 4)
      run.listener.progress(spread(run, 100), 0.1 + time / 2_000)
      frame(time)
    }
    for (let time = 1_216; time <= 1_600; time += 16) frame(time)
    expect(graph.view.get().zoom).toBeGreaterThan(framed.zoom * 1.5)
  })

  it('keeps a view.set with a duration asked while the first layout reports progress', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(layout)
    const run = runs[0]
    if (!run) throw new Error('no run')
    run.listener.progress(spread(run, 100), 0.2)
    frame(100)
    const wanted: View = { x: 1_000, y: -500, zoom: 0.5 }
    graph.view.set(wanted, { duration: 200 })
    run.listener.progress(spread(run, 100), 0.4)
    for (let time = 116; time <= 600; time += 16) frame(time)
    expect(graph.view.get()).toEqual(wanted)
  })
})
