import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PickIndex } from '../core/pick-index'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { Layout, LayoutGraph, LayoutListener } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'

interface Item {
  readonly id: string
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const count = 400
const items: Item[] = Array.from({ length: count }, (_, i) => ({ id: `n${i}` }))
const links: Link[] = Array.from({ length: count }, (_, i) => ({
  id: `e${i}`,
  from: `n${i}`,
  to: `n${(i * 7 + 1) % count}`,
}))

let dom: FakeDom
let clock = 0
let run: { graph: LayoutGraph; listener: LayoutListener } | null = null

const stepping: Layout = {
  name: 'stepping',
  options: {},
  start: (graph, listener) => {
    run = { graph, listener }
    return { pin: () => {}, stop: () => {} }
  },
}

function mount(layout: Layout | null): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [edges<Link>(links, { source: 'from', target: 'to' }), nodes<Item>(items, {})],
        layout,
      }),
      ariaLabel: 'graphe',
      initialView: { x: 0, y: 0, zoom: 1 },
    },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

function shifted(step: number): Float32Array {
  if (!run) throw new Error('no layout run')
  const xy = new Float32Array(run.graph.xy)
  for (let i = 0; i < xy.length; i++) xy[i] = (xy[i] ?? 0) + step
  return xy
}

function updates(): () => number {
  const refresh = vi.spyOn(PickIndex.prototype, 'refresh')
  const build = vi.spyOn(PickIndex.prototype, 'build')
  return () => refresh.mock.calls.length + build.mock.calls.length
}

function pointer(graph: GraphInstance, type: string, x: number): void {
  graph.element
    .querySelector('canvas')
    ?.dispatchEvent(
      new PointerEvent(type, { clientX: x, clientY: 300, button: 0, pointerId: 1, bubbles: true }),
    )
}

beforeEach(() => {
  dom = installDom()
  clock = 1000
  run = null
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('picking while nodes move', () => {
  it('updates the pick index for hover at most every 150 ms during a layout run', () => {
    const graph = mount(stepping)
    pointer(graph, 'pointermove', 400)
    const calls = updates()
    for (let step = 1; step <= 5; step++) {
      clock += 20
      run?.listener.progress(shifted(step), step / 10)
      dom.flushFrames()
      pointer(graph, 'pointermove', 400 + step)
    }
    expect(calls()).toBe(0)
    clock += 150
    run?.listener.progress(shifted(6), 0.6)
    dom.flushFrames()
    pointer(graph, 'pointermove', 410)
    expect(calls()).toBeGreaterThan(0)
    graph.destroy()
  })

  it('picks with a fresh index on a press and once the run ends', () => {
    const graph = mount(stepping)
    pointer(graph, 'pointermove', 400)
    const calls = updates()
    clock += 20
    run?.listener.progress(shifted(1), 0.5)
    dom.flushFrames()
    pointer(graph, 'pointerdown', 400)
    pointer(graph, 'pointerup', 400)
    const pressed = calls()
    expect(pressed).toBeGreaterThan(0)
    clock += 20
    run?.listener.end(shifted(2))
    dom.flushFrames()
    pointer(graph, 'pointermove', 402)
    expect(calls()).toBeGreaterThan(pressed)
    graph.destroy()
  })

  it('updates the pick index for hover at most every 150 ms while positions glide', () => {
    const graph = mount(null)
    let frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    )
    const frame = () => {
      const pending = frames
      frames = []
      for (const callback of pending) callback(clock)
    }
    pointer(graph, 'pointermove', 400)
    const calls = updates()
    graph.positions.set(
      items.map((item, i) => [item.id, { x: i, y: -i }]),
      { duration: 400 },
    )
    for (let step = 1; step <= 5; step++) {
      clock += 20
      frame()
      pointer(graph, 'pointermove', 400 + step)
    }
    expect(calls()).toBe(0)
    clock += 400
    frame()
    pointer(graph, 'pointermove', 410)
    expect(calls()).toBeGreaterThan(0)
    graph.destroy()
  })
})
