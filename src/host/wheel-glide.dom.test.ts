import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { wheelFactor, zoomAround } from '../core/view'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { InteractionOptions, Point, View } from '../types'
import type { GraphViewEvent } from './events'
import { createGraphHost, type GraphInstance, type MountGraphOptions } from './mount-graph'

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

interface Notch {
  readonly time: number
  readonly x?: number
  readonly y?: number
  readonly deltaX?: number
  readonly deltaY?: number
  readonly deltaMode?: number
  readonly wheelDeltaX?: number
  readonly wheelDeltaY?: number
  readonly ctrlKey?: boolean
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
]
const links: Link[] = [{ id: 'ab', from: 'a', to: 'b' }]
const origin: View = { x: 0, y: 0, zoom: 1 }
const viewport = { width: 800, height: 600 }

let dom: FakeDom
let clock = 0
let reduce = false

function definition(interaction: InteractionOptions = {}) {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(items, { x: 'x', y: 'y' }),
    ],
    interaction,
  })
}

function mount(
  interaction: InteractionOptions = {},
  options: Partial<MountGraphOptions> = { initialView: origin },
): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definition(interaction), ariaLabel: 'graph', ...options },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

function canvasOf(graph: GraphInstance): HTMLCanvasElement {
  const canvas = graph.element.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  return canvas
}

function wheel(graph: GraphInstance, notch: Notch): WheelEvent {
  clock = notch.time
  const init = {
    clientX: notch.x ?? 400,
    clientY: notch.y ?? 300,
    ctrlKey: notch.ctrlKey ?? false,
    metaKey: false,
    shiftKey: false,
  }
  const event = new WheelEvent('wheel', {
    ...init,
    deltaX: notch.deltaX ?? 0,
    deltaY: notch.deltaY ?? -3,
    deltaMode: notch.deltaMode ?? 1,
    bubbles: true,
    cancelable: true,
  })
  for (const [name, value] of Object.entries(init)) {
    Object.defineProperty(event, name, { value })
  }
  Object.defineProperty(event, 'timeStamp', { value: notch.time })
  if (notch.wheelDeltaX !== undefined) {
    Object.defineProperty(event, 'wheelDeltaX', { value: notch.wheelDeltaX })
  }
  if (notch.wheelDeltaY !== undefined) {
    Object.defineProperty(event, 'wheelDeltaY', { value: notch.wheelDeltaY })
  }
  canvasOf(graph).dispatchEvent(event)
  return event
}

function frame(time: number) {
  clock = time
  dom.runFrames(time)
}

function play(from: number, step = 16): number {
  let time = from
  while (dom.pendingFrames() > 0) {
    time += step
    frame(time)
    if (time - from > 5_000) throw new Error('the view never settles')
  }
  return time
}

function viewOf(graph: GraphInstance): View {
  return graph.store.get().view
}

function jump(view: View, at: Point, deltaY = -3, deltaMode = 1): View {
  return zoomAround(view, viewport, at, wheelFactor(deltaY, deltaMode, viewport.height, 1, false))
}

beforeEach(() => {
  dom = installDom()
  clock = 0
  reduce = false
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return reduce && query.includes('reduce')
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('wheel glide', () => {
  it('eases a notch to the view a jump gives', () => {
    const graph = mount()
    const zooms: number[] = []
    graph.on('viewchange', ({ view }) => zooms.push(view.zoom))
    const event = wheel(graph, { time: 1_000, x: 600 })
    expect(event.defaultPrevented).toBe(true)
    expect(viewOf(graph)).toEqual(origin)
    play(1_000)
    const target = jump(origin, { x: 600, y: 300 })
    expect(viewOf(graph)).toEqual(target)
    expect(zooms.length).toBeGreaterThan(4)
    for (let i = 1; i < zooms.length; i++) expect(zooms[i]).toBeGreaterThan(zooms[i - 1] ?? 0)
    expect(zooms[0]).toBeGreaterThan(1 + (target.zoom - 1) * 0.15)
  })

  it('keeps the point under the pointer still', () => {
    const graph = mount()
    const at = { x: 650, y: 120 }
    const before = graph.view.toWorld(at)
    wheel(graph, { time: 1_000, ...at })
    for (let time = 1_016; dom.pendingFrames() > 0; time += 16) {
      frame(time)
      const under = graph.view.toWorld(at)
      expect(under.x).toBeCloseTo(before.x, 9)
      expect(under.y).toBeCloseTo(before.y, 9)
    }
  })

  it('ends quick notches where the same jumps end', () => {
    const glides = mount()
    const jumps = mount({ wheelGlide: 0 })
    const notch = (time: number, deltaY = -3) => {
      for (const graph of [glides, jumps]) wheel(graph, { time, x: 500, deltaY })
    }
    notch(1_000)
    frame(1_016)
    frame(1_032)
    notch(1_040)
    frame(1_048)
    frame(1_064)
    frame(1_080)
    notch(1_080, 3)
    frame(1_096)
    notch(1_100)
    let expected = origin
    for (const deltaY of [-3, -3, 3, -3]) expected = jump(expected, { x: 500, y: 300 }, deltaY)
    expect(viewOf(jumps)).toEqual(expected)
    expect(viewOf(glides)).not.toEqual(expected)
    frame(1_112)
    expect(viewOf(glides)).toEqual(expected)
  })

  it('glides a slow notch in full after an earlier glide', () => {
    const graph = mount()
    wheel(graph, { time: 1_000 })
    play(1_000)
    const before = viewOf(graph)
    const after = jump(before, { x: 400, y: 300 })
    wheel(graph, { time: 1_300 })
    frame(1_316)
    const done = Math.log(viewOf(graph).zoom / before.zoom) / Math.log(after.zoom / before.zoom)
    expect(done).toBeGreaterThan(0.2)
    expect(done).toBeLessThan(0.6)
  })

  it('jumps once frames take too long to show a glide', () => {
    const graph = mount()
    wheel(graph, { time: 1_000 })
    frame(1_010)
    expect(viewOf(graph).zoom).toBeLessThan(jump(origin, { x: 400, y: 300 }).zoom)
    frame(1_130)
    const glided = jump(origin, { x: 400, y: 300 })
    expect(viewOf(graph)).toEqual(glided)
    wheel(graph, { time: 1_140 })
    const jumped = jump(glided, { x: 400, y: 300 })
    expect(viewOf(graph)).toEqual(jumped)
    dom.flushFrames()
    wheel(graph, { time: 2_000 })
    frame(2_010)
    frame(2_610)
    wheel(graph, { time: 2_620 })
    expect(viewOf(graph)).toEqual(jump(jump(jumped, { x: 400, y: 300 }), { x: 400, y: 300 }))
  })

  it('anchors a notch at the moved pointer without a jump', () => {
    const graph = mount()
    wheel(graph, { time: 1_000, x: 600 })
    frame(1_050)
    const shown = viewOf(graph)
    const at = { x: 200, y: 400 }
    const under = graph.view.toWorld(at)
    wheel(graph, { time: 1_060, ...at })
    expect(viewOf(graph)).toEqual(shown)
    play(1_060)
    const factor = wheelFactor(-3, 1, viewport.height, 1, false)
    expect(viewOf(graph).zoom).toBeCloseTo(factor * factor, 12)
    const after = graph.view.toWorld(at)
    expect(after.x).toBeCloseTo(under.x, 9)
    expect(after.y).toBeCloseTo(under.y, 9)
  })

  it('tells a notch from a trackpad by its deltas', () => {
    const graph = mount()
    const notches: Notch[] = [
      { time: 1_000, deltaMode: 1, deltaY: -3 },
      { time: 2_000, deltaMode: 2, deltaY: -1 },
      { time: 3_000, deltaMode: 0, deltaY: -100, wheelDeltaY: 120 },
      { time: 4_000, deltaMode: 0, deltaY: -4.000244140625, wheelDeltaY: 12 },
      { time: 5_000, deltaMode: 0, deltaY: -0.400390625 * 40 },
      { time: 6_000, deltaMode: 0, deltaY: -120, wheelDeltaY: 120, ctrlKey: true },
    ]
    for (const notch of notches) {
      const before = viewOf(graph)
      wheel(graph, notch)
      expect(viewOf(graph)).toEqual(before)
      play(notch.time)
      expect(viewOf(graph).zoom).not.toBe(before.zoom)
    }
    const continuous: Notch[] = [
      { time: 7_000, deltaMode: 0, deltaY: -4 },
      { time: 8_000, deltaMode: 0, deltaY: -4, wheelDeltaY: 12 },
      { time: 9_000, deltaMode: 0, deltaY: -7.5, wheelDeltaY: 22 },
      { time: 10_000, deltaMode: 0, deltaY: -40, wheelDeltaY: 120 },
      { time: 11_000, deltaMode: 0, deltaY: -2.3, wheelDeltaY: 120, ctrlKey: true },
    ]
    for (const notch of continuous) {
      const before = viewOf(graph)
      wheel(graph, notch)
      expect(viewOf(graph).zoom).not.toBe(before.zoom)
      expect(dom.pendingFrames()).toBeGreaterThan(0)
      dom.flushFrames()
    }
  })

  it('moves at once with reduced motion', () => {
    reduce = true
    const graph = mount()
    wheel(graph, { time: 1_000, x: 600 })
    expect(viewOf(graph)).toEqual(jump(origin, { x: 600, y: 300 }))
  })

  it('glides no longer than twice the time between notches', () => {
    const graph = mount()
    wheel(graph, { time: 1_000 })
    play(1_000)
    const before = viewOf(graph)
    wheel(graph, { time: 1_010 })
    frame(1_016)
    expect(viewOf(graph)).toEqual(jump(before, { x: 400, y: 300 }))
  })

  it('glides a pan notch and moves a trackpad pan at once', () => {
    const graph = mount({ wheel: 'pan' })
    wheel(graph, { time: 1_000, deltaY: 3 })
    expect(viewOf(graph)).toEqual(origin)
    frame(1_050)
    const shown = viewOf(graph)
    expect(shown.y).toBeGreaterThan(0)
    expect(shown.y).toBeLessThan(48)
    wheel(graph, { time: 1_060, deltaMode: 0, deltaX: 10, deltaY: 0 })
    frame(1_076)
    expect(viewOf(graph).x).toBeCloseTo(10, 9)
    expect(viewOf(graph).y).toBeGreaterThan(shown.y)
    play(1_076)
    expect(viewOf(graph)).toEqual({ x: 10, y: 48, zoom: 1 })
  })

  it('stops at a press, a key or a call from code', () => {
    const graph = mount()
    wheel(graph, { time: 1_000 })
    frame(1_040)
    const shown = viewOf(graph)
    for (const type of ['pointerdown', 'pointerup']) {
      canvasOf(graph).dispatchEvent(
        new PointerEvent(type, {
          clientX: 20,
          clientY: 20,
          button: 0,
          pointerId: 1,
          pointerType: 'mouse',
          bubbles: true,
        }),
      )
    }
    play(1_040)
    expect(viewOf(graph)).toEqual(shown)

    wheel(graph, { time: 3_000 })
    frame(3_040)
    graph.view.set({ x: 5, y: 5, zoom: 2 })
    play(3_040)
    expect(viewOf(graph)).toEqual({ x: 5, y: 5, zoom: 2 })

    wheel(graph, { time: 5_000 })
    frame(5_040)
    const keyed = viewOf(graph)
    graph.element.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }))
    play(5_040)
    expect(viewOf(graph).x).toBeCloseTo(keyed.x, 9)
    expect(viewOf(graph).zoom).toBeGreaterThan(keyed.zoom)
    expect(viewOf(graph).zoom).not.toBeCloseTo(jump(keyed, { x: 400, y: 300 }).zoom, 6)
  })

  it('takes over a fit in progress from where it is', () => {
    const graph = mount()
    graph.view.fit({ duration: 400 })
    frame(100)
    const shown = viewOf(graph)
    wheel(graph, { time: 110 })
    expect(viewOf(graph)).toEqual(shown)
    play(110)
    expect(viewOf(graph)).toEqual(jump(shown, { x: 400, y: 300 }))
  })

  it('asks a controlled view for every step', () => {
    const requests: GraphViewEvent[] = []
    let graph: GraphInstance | null = null
    graph = mount(
      {},
      {
        view: origin,
        onViewChange: (event) => {
          requests.push(event)
          graph?.update({ view: event.view })
        },
      },
    )
    wheel(graph, { time: 1_000, x: 600 })
    play(1_000)
    expect(requests.length).toBeGreaterThan(4)
    expect(requests.every((event) => event.origin === 'user')).toBe(true)
    expect(graph.view.get()).toEqual(jump(origin, { x: 600, y: 300 }))
  })

  it('stays still once a glide ends', () => {
    const graph = mount()
    wheel(graph, { time: 1_000 })
    play(1_000)
    expect(dom.pendingFrames()).toBe(0)
  })

  it('refuses an invalid glide', () => {
    for (const wheelGlide of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => definition({ wheelGlide })).toThrow(RangeError)
    }
    expect(definition({}).interaction.wheelGlide).toBe(200)
    expect(definition({ wheelGlide: 0 }).interaction.wheelGlide).toBe(0)
  })
})
