import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { View } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
  { id: 'c', x: 0, y: 100 },
]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
]

let dom: FakeDom
let clock = 0

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

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [
          edges<Link>(links, { source: 'from', target: 'to' }),
          nodes<Item>(items, { x: 'x', y: 'y' }),
        ],
        interaction: { wheel: 'pan' },
      }),
      ariaLabel: 'graph',
      initialView: { x: 0, y: 0, zoom: 1 },
    },
    fakeRenderer,
  )
  dom.runFrames(0)
  return graph as GraphInstance
}

function canvasOf(graph: GraphInstance): HTMLCanvasElement {
  const canvas = graph.element.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  return canvas
}

function pointer(graph: GraphInstance, type: string, x: number, y: number): void {
  canvasOf(graph).dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      bubbles: true,
    }),
  )
}

function notch(graph: GraphInstance, time: number): void {
  const event = new WheelEvent('wheel', {
    deltaY: 3,
    deltaMode: 1,
    bubbles: true,
    cancelable: true,
  })
  for (const [name, value] of Object.entries({ clientX: 400, clientY: 300, timeStamp: time })) {
    Object.defineProperty(event, name, { value })
  }
  canvasOf(graph).dispatchEvent(event)
}

function drag(withNotch: boolean): View {
  const graph = mount()
  const at = graph.positions.get('b')
  if (!at) throw new Error('no b')
  const b = graph.view.toScreen(at)
  pointer(graph, 'pointerdown', b.x, b.y)
  pointer(graph, 'pointermove', 790, 300)
  for (let time = 16; time <= 800; time += 16) {
    clock = time
    if (withNotch && time === 160) notch(graph, time)
    dom.runFrames(time)
  }
  const view = graph.view.get()
  pointer(graph, 'pointerup', 790, 300)
  graph.destroy()
  return view
}

describe('a wheel notch during an auto-pan', () => {
  it('keeps the horizontal auto-pan going while a vertical wheel pan glides', () => {
    const alone = drag(false).x
    const glided = drag(true).x
    expect(alone).toBeGreaterThan(300)
    expect(glided).toBeGreaterThan(alone * 0.9)
  })

  it('still carries the wheel pan to its end during the auto-pan', () => {
    const alone = drag(false)
    const glided = drag(true)
    expect(glided.y - alone.y).toBeCloseTo(48, 3)
    expect(glided.zoom).toBe(alone.zoom)
  })
})
