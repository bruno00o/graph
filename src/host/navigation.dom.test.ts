import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphDefinitionOptions, InteractionOptions, View, ViewLimitOptions } from '../types'
import type { GraphEvents } from './events'
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

const items: Item[] = [
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
  { id: 'c', x: 0, y: 100 },
]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
]
const origin: View = { x: 0, y: 0, zoom: 1 }

let dom: FakeDom
let clock = 0

function definition(
  interaction: InteractionOptions = {},
  view: ViewLimitOptions = {},
  extra: Partial<GraphDefinitionOptions> = {},
) {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(items, { x: 'x', y: 'y' }),
    ],
    interaction,
    view,
    ...extra,
  })
}

function mount(
  graphDefinition = definition(),
  options: Partial<MountGraphOptions> = { initialView: origin },
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

function canvasOf(graph: GraphInstance): HTMLCanvasElement {
  const canvas = graph.element.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  return canvas
}

function pointer(
  graph: GraphInstance,
  type: string,
  x: number,
  y: number,
  init: PointerEventInit = {},
) {
  canvasOf(graph).dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      bubbles: true,
      ...init,
    }),
  )
}

function touch(graph: GraphInstance, type: string, id: number, x: number, y: number) {
  pointer(graph, type, x, y, { pointerId: id, pointerType: 'touch', isPrimary: id === 1 })
}

function wheel(graph: GraphInstance, init: WheelEventInit): WheelEvent {
  const full = { clientX: 400, clientY: 300, bubbles: true, cancelable: true, ...init }
  const event = new WheelEvent('wheel', full)
  for (const name of ['clientX', 'clientY', 'ctrlKey', 'metaKey', 'shiftKey'] as const) {
    Object.defineProperty(event, name, { value: full[name] ?? false })
  }
  canvasOf(graph).dispatchEvent(event)
  return event
}

function press(graph: GraphInstance, key: string, init: KeyboardEventInit = {}) {
  graph.element.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
  )
  dom.flushFrames()
}

function screenOf(graph: GraphInstance, key: string) {
  const position = graph.positions.get(key)
  if (!position) throw new Error(`no position for ${key}`)
  return graph.view.toScreen(position)
}

function viewOf(graph: GraphInstance): View {
  return graph.store.get().view
}

function collect<K extends keyof GraphEvents>(graph: GraphInstance, name: K): GraphEvents[K][] {
  const seen: GraphEvents[K][] = []
  graph.on(name, (event) => seen.push(event))
  return seen
}

function visible(graph: GraphInstance) {
  const topLeft = graph.view.toWorld({ x: 0, y: 0 })
  const bottomRight = graph.view.toWorld({ x: 800, y: 600 })
  return { minX: topLeft.x, minY: topLeft.y, maxX: bottomRight.x, maxY: bottomRight.y }
}

beforeEach(() => {
  dom = installDom()
  clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => {
    clock += 16
    return clock
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('wheel', () => {
  it('zooms around the pointer and keeps the page still by default', () => {
    const graph = mount()
    const event = wheel(graph, { deltaY: -100, clientX: 600, clientY: 300 })
    expect(event.defaultPrevented).toBe(true)
    expect(viewOf(graph).zoom).toBeGreaterThan(1)
    expect(graph.view.toWorld({ x: 600, y: 300 }).x).toBeCloseTo(200)
  })

  it('leaves the plain wheel to the page and zooms with Cmd or Ctrl in page mode', () => {
    const graph = mount(definition({ wheel: 'page' }))
    const hints = collect(graph, 'zoomhint')
    const plain = wheel(graph, { deltaY: 100 })
    expect(plain.defaultPrevented).toBe(false)
    expect(viewOf(graph)).toEqual(origin)
    expect(hints).toHaveLength(1)
    expect(hints[0]?.originalEvent).toBe(plain)
    expect(['Meta', 'Control']).toContain(hints[0]?.key)
    expect(wheel(graph, { deltaY: -100, ctrlKey: true }).defaultPrevented).toBe(true)
    const zoomed = viewOf(graph).zoom
    expect(zoomed).toBeGreaterThan(1)
    expect(wheel(graph, { deltaY: -100, metaKey: true }).defaultPrevented).toBe(true)
    expect(viewOf(graph).zoom).toBeGreaterThan(zoomed)
    expect(hints).toHaveLength(1)
  })

  it('suggests Cmd on Apple systems and Ctrl elsewhere', () => {
    const graph = mount(definition({ wheel: 'page' }))
    const hints = collect(graph, 'zoomhint')
    const platform = vi.spyOn(navigator, 'platform', 'get')
    platform.mockReturnValue('MacIntel')
    wheel(graph, { deltaY: 100 })
    platform.mockReturnValue('Win32')
    wheel(graph, { deltaY: 100 })
    expect(hints.map((hint) => hint.key)).toEqual(['Meta', 'Control'])
  })

  it('emits no hint when zoom is off', () => {
    const graph = mount(definition({ wheel: 'page', zoom: false }))
    const hints = collect(graph, 'zoomhint')
    expect(wheel(graph, { deltaY: 100 }).defaultPrevented).toBe(false)
    expect(wheel(graph, { deltaY: 100, ctrlKey: true }).defaultPrevented).toBe(false)
    expect(hints).toHaveLength(0)
    expect(viewOf(graph)).toEqual(origin)
  })

  it('pans with a two-finger scroll and zooms on a pinch in pan mode', () => {
    const graph = mount(definition({ wheel: 'pan' }))
    expect(wheel(graph, { deltaX: 30, deltaY: -20 }).defaultPrevented).toBe(true)
    expect(viewOf(graph)).toEqual({ x: 30, y: -20, zoom: 1 })
    wheel(graph, { deltaY: 3, deltaMode: 1, shiftKey: true })
    expect(viewOf(graph)).toEqual({ x: 78, y: -20, zoom: 1 })
    wheel(graph, { deltaY: -10, ctrlKey: true })
    expect(viewOf(graph).zoom).toBeCloseTo(Math.exp(0.1))
  })

  it('leaves the wheel to the page in pan mode when pan is off', () => {
    const graph = mount(definition({ wheel: 'pan', pan: false }))
    expect(wheel(graph, { deltaY: 40 }).defaultPrevented).toBe(false)
    expect(viewOf(graph)).toEqual(origin)
    expect(wheel(graph, { deltaY: 40, ctrlKey: true }).defaultPrevented).toBe(true)
    expect(viewOf(graph).zoom).toBeLessThan(1)
  })
})

function gesture(
  graph: GraphInstance,
  type: 'gesturestart' | 'gesturechange' | 'gestureend',
  scale: number,
  at: { clientX?: number; clientY?: number } = {},
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'scale', { value: scale })
  for (const [name, value] of Object.entries(at)) Object.defineProperty(event, name, { value })
  canvasOf(graph).dispatchEvent(event)
  return event
}

describe('gesture events', () => {
  it('zooms around the fingers and keeps the page from zooming', () => {
    const graph = mount()
    expect(gesture(graph, 'gesturestart', 1, { clientX: 600, clientY: 300 }).defaultPrevented).toBe(
      true,
    )
    const change = gesture(graph, 'gesturechange', 1.5, { clientX: 600, clientY: 300 })
    expect(change.defaultPrevented).toBe(true)
    expect(viewOf(graph).zoom).toBeCloseTo(1.5)
    expect(graph.view.toWorld({ x: 600, y: 300 }).x).toBeCloseTo(200)
    gesture(graph, 'gesturechange', 3, { clientX: 600, clientY: 300 })
    expect(viewOf(graph).zoom).toBeCloseTo(3)
    expect(gesture(graph, 'gestureend', 3).defaultPrevented).toBe(true)
  })

  it('zooms around the pointer when the event has no position', () => {
    const graph = mount()
    pointer(graph, 'pointermove', 200, 300)
    gesture(graph, 'gesturestart', 1)
    gesture(graph, 'gesturechange', 2)
    expect(viewOf(graph).zoom).toBeCloseTo(2)
    expect(graph.view.toWorld({ x: 200, y: 300 }).x).toBeCloseTo(-200)
  })

  it('ignores the wheel a browser sends along with the pinch', () => {
    const graph = mount()
    gesture(graph, 'gesturestart', 1)
    gesture(graph, 'gesturechange', 2)
    const zoom = viewOf(graph).zoom
    expect(wheel(graph, { deltaY: -10, ctrlKey: true }).defaultPrevented).toBe(true)
    expect(viewOf(graph).zoom).toBe(zoom)
    gesture(graph, 'gestureend', 2)
    wheel(graph, { deltaY: -10, ctrlKey: true })
    expect(viewOf(graph).zoom).toBeGreaterThan(zoom)
  })

  it('follows the zoom option and limits', () => {
    const graph = mount(definition({}, { maxZoom: 1.2 }))
    gesture(graph, 'gesturestart', 1)
    gesture(graph, 'gesturechange', 4)
    expect(viewOf(graph).zoom).toBeCloseTo(1.2)
    const still = mount(definition({ zoom: false }))
    expect(gesture(still, 'gesturestart', 1).defaultPrevented).toBe(false)
    expect(gesture(still, 'gesturechange', 2).defaultPrevented).toBe(false)
    expect(viewOf(still)).toEqual(origin)
  })

  it('leaves a touch pinch to the pointers', () => {
    const graph = mount()
    touch(graph, 'pointerdown', 1, 300, 200)
    touch(graph, 'pointerdown', 2, 500, 200)
    gesture(graph, 'gesturestart', 1)
    touch(graph, 'pointermove', 2, 600, 200)
    gesture(graph, 'gesturechange', 1.5)
    expect(viewOf(graph).zoom).toBeCloseTo(1.5)
  })

  it('stops listening once destroyed', () => {
    const graph = mount()
    const canvas = canvasOf(graph)
    graph.destroy()
    const event = new Event('gesturestart', { cancelable: true })
    canvas.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('view limits', () => {
  it('keeps every zoom within the limits', () => {
    const graph = mount(definition({}, { minZoom: 0.5, maxZoom: 2 }))
    for (let i = 0; i < 20; i++) wheel(graph, { deltaY: -120 })
    expect(viewOf(graph).zoom).toBe(2)
    for (let i = 0; i < 40; i++) wheel(graph, { deltaY: 120 })
    expect(viewOf(graph).zoom).toBe(0.5)
    graph.view.set({ x: 0, y: 0, zoom: 10 })
    expect(viewOf(graph).zoom).toBe(2)
    graph.view.zoomBy(1e-3)
    expect(viewOf(graph).zoom).toBe(0.5)
    graph.view.fit(['a'])
    dom.flushFrames()
    expect(viewOf(graph).zoom).toBe(2)
    graph.view.set({ x: 0, y: 0, zoom: 1 })
    for (let i = 0; i < 5; i++) press(graph, '-')
    expect(viewOf(graph).zoom).toBe(0.5)
  })

  it('brings the initial view within the limits', () => {
    const bounds = { minX: -500, minY: -400, maxX: 500, maxY: 400 }
    const graph = mount(definition({}, { maxZoom: 4, bounds }), {
      initialView: { x: 2000, y: 0, zoom: 10 },
    })
    expect(viewOf(graph)).toEqual({ x: 400, y: 0, zoom: 4 })
  })

  it('emits no view change when a gesture hits a limit', () => {
    const graph = mount(definition({}, { maxZoom: 1 }))
    const changes = collect(graph, 'viewchange')
    expect(wheel(graph, { deltaY: -120 }).defaultPrevented).toBe(true)
    expect(changes).toHaveLength(0)
  })

  it('keeps the view inside a world rectangle', () => {
    const bounds = { minX: -500, minY: -400, maxX: 500, maxY: 400 }
    const graph = mount(definition({}, { bounds }))
    pointer(graph, 'pointerdown', 400, 500)
    pointer(graph, 'pointermove', 100, 100)
    pointer(graph, 'pointermove', -800, -900)
    pointer(graph, 'pointerup', -800, -900)
    expect(visible(graph)).toEqual({ minX: -300, minY: -200, maxX: 500, maxY: 400 })
    expect(viewOf(graph)).toEqual({ x: 100, y: 100, zoom: 1 })
    graph.view.set({ x: -2000, y: 0, zoom: 1 })
    expect(viewOf(graph).x).toBe(-100)
    for (let i = 0; i < 10; i++) press(graph, 'ArrowLeft', { shiftKey: true })
    expect(viewOf(graph).x).toBe(-100)
  })

  it('lets a rectangle narrower than the view move inside it', () => {
    const bounds = { minX: -50, minY: -50, maxX: 50, maxY: 50 }
    const graph = mount(definition({}, { bounds }))
    graph.view.set({ x: 1000, y: 0, zoom: 1 })
    expect(viewOf(graph)).toEqual({ x: 350, y: 0, zoom: 1 })
    expect(graph.view.toScreen({ x: -50, y: 0 }).x).toBe(0)
  })

  it('keeps every frame of an animation inside the bounds', () => {
    const bounds = { minX: -500, minY: -400, maxX: 500, maxY: 400 }
    const graph = mount(definition({}, { bounds }))
    const changes = collect(graph, 'viewchange')
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    )
    graph.view.set({ x: 3000, y: -3000, zoom: 0.5 }, { duration: 200 })
    const start = clock
    for (let step = 1; step <= 8 && frames.length > 0; step++) {
      for (const callback of frames.splice(0)) callback(start + step * 40)
    }
    expect(changes.length).toBeGreaterThan(3)
    expect(changes.at(-1)?.view.zoom).toBe(0.5)
    for (const { view } of changes) {
      const halfWidth = 400 / view.zoom
      const halfHeight = 300 / view.zoom
      const insideX = view.x - halfWidth >= -500 - 1e-9 && view.x + halfWidth <= 500 + 1e-9
      const insideY = view.y - halfHeight >= -400 - 1e-9 && view.y + halfHeight <= 400 + 1e-9
      const holdsX = view.x - halfWidth <= -500 && view.x + halfWidth >= 500
      const holdsY = view.y - halfHeight <= -400 && view.y + halfHeight >= 400
      expect(insideX || holdsX).toBe(true)
      expect(insideY || holdsY).toBe(true)
    }
  })

  it('keeps a margin around the nodes', () => {
    const graph = mount(definition({}, { bounds: { margin: 40 } }), {})
    graph.view.set({ x: 5000, y: 5000, zoom: 6 })
    const radius = 8 * 6
    expect(screenOf(graph, 'b').x + radius).toBeCloseTo(800 - 40)
    expect(screenOf(graph, 'c').y + radius).toBeCloseTo(600 - 40)
    graph.view.set({ x: 5000, y: 5000, zoom: 4 })
    expect(screenOf(graph, 'b').x + 8 * 4).toBeCloseTo(800 - 40)
    expect(screenOf(graph, 'a').y - 8 * 4).toBeCloseTo(40)
  })

  it('constrains the view again when the definition changes', () => {
    const graph = mount()
    graph.view.set({ x: 900, y: 0, zoom: 8 })
    graph.update({ definition: definition({}, { maxZoom: 2, bounds: { margin: 0 } }) })
    expect(viewOf(graph).zoom).toBe(2)
    expect(screenOf(graph, 'b').x).toBeGreaterThan(0)
  })

  it('keeps working from code when gestures are off', () => {
    const graph = mount(definition({ pan: false, zoom: false }))
    wheel(graph, { deltaY: -100 })
    pointer(graph, 'pointerdown', 400, 500)
    pointer(graph, 'pointermove', 200, 300)
    pointer(graph, 'pointerup', 200, 300)
    press(graph, '+')
    press(graph, 'ArrowLeft', { shiftKey: true })
    expect(viewOf(graph)).toEqual(origin)
    graph.view.zoomBy(2)
    graph.view.set({ ...viewOf(graph), x: 50 })
    expect(viewOf(graph)).toEqual({ x: 50, y: 0, zoom: 2 })
  })
})

describe('touch', () => {
  it('pinches to zoom and pan at once', () => {
    const graph = mount()
    touch(graph, 'pointerdown', 1, 300, 200)
    touch(graph, 'pointerdown', 2, 500, 200)
    touch(graph, 'pointermove', 2, 600, 200)
    expect(viewOf(graph).zoom).toBeCloseTo(1.5)
    const under = graph.view.toWorld({ x: 450, y: 200 })
    expect(under.x).toBeCloseTo(0)
    expect(under.y).toBeCloseTo(-100)
    touch(graph, 'pointermove', 1, 400, 300)
    touch(graph, 'pointermove', 2, 700, 300)
    expect(viewOf(graph).zoom).toBeCloseTo(1.5)
    const followed = graph.view.toWorld({ x: 550, y: 300 })
    expect(followed.x).toBeCloseTo(0)
    expect(followed.y).toBeCloseTo(-100)
    touch(graph, 'pointerup', 2, 700, 300)
    const before = viewOf(graph).x
    touch(graph, 'pointermove', 1, 300, 300)
    expect(viewOf(graph).x).toBeCloseTo(before + 100 / 1.5)
    const selection = collect(graph, 'selectionchange')
    const clicks = collect(graph, 'click')
    touch(graph, 'pointerup', 1, 300, 300)
    expect(clicks).toHaveLength(0)
    expect(selection).toHaveLength(0)
  })

  it('follows the pinch limits and options', () => {
    const graph = mount(definition({ pan: false }, { maxZoom: 1.2 }))
    touch(graph, 'pointerdown', 1, 400, 150)
    touch(graph, 'pointerdown', 2, 400, 450)
    touch(graph, 'pointermove', 1, 400, 50)
    touch(graph, 'pointermove', 2, 400, 550)
    expect(viewOf(graph)).toEqual({ x: 0, y: 0, zoom: 1.2 })
    touch(graph, 'pointerup', 1, 400, 50)
    touch(graph, 'pointerup', 2, 400, 550)
    const panOnly = mount(definition({ zoom: false }))
    touch(panOnly, 'pointerdown', 1, 400, 150)
    touch(panOnly, 'pointerdown', 2, 400, 450)
    touch(panOnly, 'pointermove', 2, 600, 450)
    expect(viewOf(panOnly)).toEqual({ x: -100, y: 0, zoom: 1 })
  })

  it('selects on a tap that moves a little', () => {
    const graph = mount()
    const a = screenOf(graph, 'a')
    touch(graph, 'pointerdown', 1, a.x, a.y)
    touch(graph, 'pointermove', 1, a.x + 7, a.y + 3)
    touch(graph, 'pointerup', 1, a.x + 7, a.y + 3)
    expect(graph.selection.get().nodes).toEqual(['a'])
    expect(graph.store.get().hovered).toBeNull()
    pointer(graph, 'pointerdown', 400, 500)
    pointer(graph, 'pointermove', 407, 503)
    pointer(graph, 'pointerup', 407, 503)
    expect(graph.selection.get().nodes).toEqual(['a'])
  })

  it('ends a node drag when a second finger lands, then pinches', () => {
    const graph = mount()
    const seen: string[] = []
    for (const name of ['dragstart', 'dragend', 'click'] as const) {
      graph.on(name, () => seen.push(name))
    }
    const b = screenOf(graph, 'b')
    touch(graph, 'pointerdown', 1, b.x, b.y)
    touch(graph, 'pointermove', 1, b.x + 30, b.y)
    const dropped = graph.positions.get('b')
    touch(graph, 'pointerdown', 2, 200, 300)
    expect(seen).toEqual(['dragstart', 'dragend'])
    touch(graph, 'pointermove', 1, b.x + 80, b.y)
    expect(graph.positions.get('b')).toEqual(dropped)
    expect(viewOf(graph).zoom).toBeGreaterThan(1)
    touch(graph, 'pointerup', 1, b.x + 80, b.y)
    touch(graph, 'pointerup', 2, 200, 300)
    expect(seen).toEqual(['dragstart', 'dragend'])
  })

  it('never starts a lasso on a long press', () => {
    const graph = mount(definition({ lasso: true }))
    touch(graph, 'pointerdown', 1, 400, 500)
    clock += 2000
    dom.flushFrames()
    touch(graph, 'pointermove', 1, 300, 500)
    expect(graph.element.querySelector('svg')).toBeNull()
    expect(viewOf(graph).x).toBe(100)
    touch(graph, 'pointerup', 1, 300, 500)
    expect(graph.selection.get().nodes).toEqual([])
  })
})

describe('auto-pan', () => {
  it('scrolls toward the edge while a node is dragged near it', () => {
    const graph = mount()
    const drags = collect(graph, 'drag')
    const b = screenOf(graph, 'b')
    pointer(graph, 'pointerdown', b.x, b.y)
    pointer(graph, 'pointermove', 790, 300)
    const count = drags.length
    dom.flushFrames()
    const first = viewOf(graph).x
    expect(first).toBeGreaterThanOrEqual(0.75 * 900 * 0.016)
    expect(first).toBeLessThanOrEqual(0.75 * 900 * 0.05 * 5)
    dom.flushFrames()
    expect(viewOf(graph).x).toBeGreaterThan(first)
    expect(viewOf(graph).y).toBe(0)
    expect(drags.length).toBeGreaterThan(count)
    const held = screenOf(graph, 'b')
    expect(held.x).toBeCloseTo(790)
    expect(held.y).toBeCloseTo(300)
    pointer(graph, 'pointermove', 600, 300)
    dom.flushFrames()
    const stopped = viewOf(graph)
    dom.flushFrames()
    expect(viewOf(graph)).toBe(stopped)
    pointer(graph, 'pointermove', 795, 300)
    pointer(graph, 'pointerup', 795, 300)
    dom.flushFrames()
    expect(viewOf(graph)).toBe(stopped)
  })

  it('stops at the bounds', () => {
    const bounds = { minX: -1400, minY: -300, maxX: 1400, maxY: 300 }
    const graph = mount(definition({}, { bounds }))
    const a = screenOf(graph, 'a')
    pointer(graph, 'pointerdown', a.x, a.y)
    pointer(graph, 'pointermove', -50, 300)
    for (let i = 0; i < 100 && viewOf(graph).x > -1000; i++) dom.flushFrames()
    expect(viewOf(graph)).toEqual({ x: -1000, y: 0, zoom: 1 })
    expect(screenOf(graph, 'a').x).toBeCloseTo(-50)
    pointer(graph, 'pointerup', -50, 300)
  })

  it('stays off without pan or with autoPan off', () => {
    for (const interaction of [{ autoPan: false }, { pan: false }]) {
      const graph = mount(definition(interaction))
      const b = screenOf(graph, 'b')
      pointer(graph, 'pointerdown', b.x, b.y)
      pointer(graph, 'pointermove', 799, 599)
      dom.flushFrames()
      expect(viewOf(graph)).toEqual(origin)
      pointer(graph, 'pointerup', 799, 599)
    }
  })

  it('scrolls while drawing a lasso and selects in world units', () => {
    const graph = mount(definition({ lasso: true }), { initialView: { x: 600, y: 0, zoom: 1 } })
    pointer(graph, 'pointerdown', 300, 150, { shiftKey: true })
    pointer(graph, 'pointermove', 5, 150, { shiftKey: true })
    for (let i = 0; i < 40 && viewOf(graph).x > 150; i++) dom.flushFrames()
    expect(viewOf(graph).x).toBeLessThanOrEqual(150)
    pointer(graph, 'pointermove', 60, 550, { shiftKey: true })
    pointer(graph, 'pointermove', 300, 550, { shiftKey: true })
    pointer(graph, 'pointerup', 300, 550, { shiftKey: true })
    expect([...graph.selection.get().nodes].sort()).toEqual(['a', 'b', 'c'])
  })
})
