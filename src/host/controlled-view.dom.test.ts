import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { View, ViewLimitOptions } from '../types'
import type { GraphViewEvent } from './events'
import { createGraphHost, type GraphInstance, type MountGraphOptions } from './mount-graph'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
]
const origin: View = { x: 0, y: 0, zoom: 1 }

let dom: FakeDom
let clock = 0
let frames: FrameRequestCallback[] = []

function definition(view: ViewLimitOptions = {}) {
  return defineGraph({ marks: [nodes<Item>(items, { x: 'x', y: 'y' })], view })
}

function mount(options: Partial<MountGraphOptions> = {}, limits: ViewLimitOptions = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  return createGraphHost(
    container,
    { definition: definition(limits), ariaLabel: 'graphe', ...options },
    fakeRenderer,
  )
}

function step(time: number): void {
  const pending = frames
  frames = []
  for (const callback of pending) callback(time)
}

function drag(graph: GraphInstance, moves: readonly (readonly [number, number])[]): void {
  const canvas = graph.element.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  const send = (type: string, x: number, y: number) =>
    canvas.dispatchEvent(
      new PointerEvent(type, {
        clientX: x,
        clientY: y,
        button: 0,
        pointerId: 1,
        pointerType: 'mouse',
        bubbles: true,
      }),
    )
  send('pointerdown', 400, 300)
  for (const [x, y] of moves) send('pointermove', x, y)
  const last = moves[moves.length - 1] ?? [400, 300]
  send('pointerup', last[0], last[1])
}

beforeEach(() => {
  dom = installDom()
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
  clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('controlled view', () => {
  it('sends gestures to onViewChange and moves only on update', () => {
    const requests: View[] = []
    const graph = mount({ view: origin, onViewChange: (event) => requests.push(event.view) })
    step(0)
    drag(graph, [
      [380, 300],
      [370, 290],
    ])
    expect(graph.store.get().view).toEqual(origin)
    step(16)
    expect(requests).toEqual([{ x: 30, y: 10, zoom: 1 }])
    expect(graph.store.get().view).toEqual(origin)
    graph.update({ view: { x: 30, y: 10, zoom: 1 } })
    expect(graph.view.get()).toEqual({ x: 30, y: 10, zoom: 1 })
  })

  it('draws a request applied in the callback within the same frame', () => {
    const seen: View[] = []
    let graph: GraphInstance | null = null
    graph = mount({ view: origin, onViewChange: ({ view }) => graph?.update({ view }) })
    graph.on('viewchange', ({ view }) => seen.push(view))
    step(0)
    graph.view.set({ x: 50, y: 0, zoom: 2 })
    expect(graph.view.get()).toEqual(origin)
    step(16)
    expect(graph.view.get()).toEqual({ x: 50, y: 0, zoom: 2 })
    expect(seen).toEqual([{ x: 50, y: 0, zoom: 2 }])
    expect(frames).toHaveLength(0)
  })

  it('requests every step of an animation within the limits', () => {
    const requests: View[] = []
    let graph: GraphInstance | null = null
    graph = mount(
      {
        view: origin,
        onViewChange: ({ view }) => {
          requests.push(view)
          graph?.update({ view })
        },
      },
      { maxZoom: 4 },
    )
    step(0)
    graph.view.set({ x: 100, y: 0, zoom: 10 }, { duration: 100 })
    for (let time = 16; frames.length > 0; time += 16) step(time)
    expect(requests.length).toBeGreaterThan(4)
    expect(requests.every((view) => view.zoom <= 4)).toBe(true)
    expect(graph.view.get()).toEqual({ x: 100, y: 0, zoom: 4 })
  })

  it('builds on unanswered requests so slow applications lose no motion', () => {
    const requests: GraphViewEvent[] = []
    const graph = mount({ view: origin, onViewChange: (event) => requests.push(event) })
    step(0)
    drag(graph, [[390, 300]])
    step(16)
    drag(graph, [[390, 300]])
    step(32)
    expect(requests.map((event) => event.view.x)).toEqual([10, 20])
    graph.update({ view: { x: 10, y: 0, zoom: 1 } })
    drag(graph, [[390, 300]])
    step(48)
    expect(requests.map((event) => event.view.x)).toEqual([10, 20, 30])
    graph.update({ view: { x: -500, y: 0, zoom: 1 } })
    drag(graph, [[390, 300]])
    step(64)
    expect(requests.at(-1)?.view.x).toBe(-490)
  })

  it('applies the given view as is and does not fit the data', () => {
    const graph = mount({ view: { x: 9, y: 9, zoom: 100 } }, { maxZoom: 4 })
    step(0)
    expect(graph.view.get()).toEqual({ x: 9, y: 9, zoom: 100 })
  })

  it('keeps the view of an uncontrolled graph in the store', () => {
    const requests: View[] = []
    const graph = mount({
      initialView: origin,
      onViewChange: (event) => requests.push(event.view),
    })
    step(0)
    drag(graph, [[380, 300]])
    expect(graph.view.get()).toEqual({ x: 20, y: 0, zoom: 1 })
    step(16)
    expect(requests).toEqual([])
  })
})
