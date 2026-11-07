import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { InteractionOptions } from '../types'
import type { GraphEvents } from './events'
import { lensContains, lensView } from './lens'
import { createGraphHost, type GraphInstance } from './mount-graph'
import type { RenderFrame } from './renderer'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

const items: Item[] = [
  { id: 'near', x: 20, y: 0 },
  { id: 'far', x: -200, y: 100 },
]

let dom: FakeDom
let frames: RenderFrame[]

function mount(interaction: InteractionOptions = {}): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const definition = defineGraph({
    marks: [nodes<Item>(items, { x: 'x', y: 'y' })],
    interaction,
  })
  const graph = createGraphHost(
    container,
    { definition, ariaLabel: 'graphe', initialView: { x: 0, y: 0, zoom: 1 } },
    () => ({
      ...fakeRenderer(),
      render: (frame: RenderFrame) => {
        frames.push(frame)
        return -1
      },
    }),
  )
  dom.flushFrames()
  return graph
}

function canvasOf(graph: GraphInstance): HTMLCanvasElement {
  const canvas = graph.element.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  return canvas
}

function pointer(graph: GraphInstance, type: string, x: number, y: number) {
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
  dom.flushFrames()
}

function key(type: 'keydown' | 'keyup', name: string, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent(type, { key: name, bubbles: true, cancelable: true }))
  dom.flushFrames()
}

function collect<K extends keyof GraphEvents>(graph: GraphInstance, name: K): GraphEvents[K][] {
  const seen: GraphEvents[K][] = []
  graph.on(name, (event) => seen.push(event))
  return seen
}

beforeEach(() => {
  dom = installDom()
  frames = []
  let clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => {
    clock += 16
    return clock
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('lensView', () => {
  it('keeps the world point under the center and multiplies the zoom', () => {
    const view = { x: 10, y: -5, zoom: 2 }
    const size = { width: 800, height: 600 }
    const lens = { at: { x: 300, y: 200 }, radius: 100, zoom: 4, follow: null }
    const inside = lensView(view, size, lens)
    expect(inside.zoom).toBe(8)
    const toWorld = (v: typeof view, x: number, y: number) => ({
      x: (x - size.width / 2) / v.zoom + v.x,
      y: (y - size.height / 2) / v.zoom + v.y,
    })
    expect(toWorld(inside, 300, 200)).toEqual(toWorld(view, 300, 200))
    expect(lensContains(lens, { x: 399, y: 200 })).toBe(true)
    expect(lensContains(lens, { x: 401, y: 200 })).toBe(false)
  })
})

describe('lens', () => {
  it('stays hidden until code shows it, and reports changes', () => {
    const graph = mount()
    const changes = collect(graph, 'lenschange')
    expect(graph.lens.get()).toBeNull()
    expect(graph.store.get().lens).toBeNull()
    graph.lens.set({ at: { x: 400, y: 300 } })
    const shown = { at: { x: 400, y: 300 }, radius: 120, zoom: 3, follow: null }
    expect(graph.lens.get()).toEqual(shown)
    expect(graph.store.get().lens).toEqual(shown)
    graph.lens.set({ zoom: 5 })
    expect(graph.lens.get()?.zoom).toBe(5)
    graph.lens.set(null)
    expect(graph.lens.get()).toBeNull()
    expect(changes.map((event) => event.lens?.zoom ?? null)).toEqual([3, 5, null])
  })

  it('hands the lens to the renderer and leaves no frame pending', () => {
    const graph = mount()
    expect(frames.at(-1)?.lens ?? null).toBeNull()
    graph.lens.set({ at: { x: 460, y: 300 }, radius: 80, zoom: 2 })
    dom.flushFrames()
    expect(frames.at(-1)?.lens).toEqual({
      x: 460,
      y: 300,
      radius: 80,
      view: { x: 60, y: 0, zoom: 2 },
    })
    expect(dom.pendingFrames()).toBe(0)
    const count = frames.length
    dom.flushFrames()
    expect(frames.length).toBe(count)
  })

  it('picks what the lens shows inside it', () => {
    const graph = mount()
    expect(graph.pick({ x: 420, y: 300 })?.key).toBe('near')
    graph.lens.set({ at: { x: 400, y: 300 } })
    expect(graph.pick({ x: 420, y: 300 })).toBeNull()
    expect(graph.pick({ x: 460, y: 300 })?.key).toBe('near')
    expect(graph.lens.toWorld({ x: 460, y: 300 })).toEqual({ x: 20, y: 0 })
    expect(graph.pick({ x: 200, y: 400 })?.key).toBe('far')
  })

  it('shows under the pointer while its key is held', () => {
    const graph = mount({ lens: { radius: 90 } })
    pointer(graph, 'pointermove', 300, 200)
    key('keydown', 'Alt')
    expect(graph.lens.get()).toEqual({
      at: { x: 300, y: 200 },
      radius: 90,
      zoom: 3,
      follow: 'pointer',
    })
    pointer(graph, 'pointermove', 350, 250)
    expect(graph.lens.get()?.at).toEqual({ x: 350, y: 250 })
    key('keyup', 'Alt')
    expect(graph.lens.get()).toBeNull()
  })

  it('ignores the key when the lens interaction is off or the pointer is elsewhere', () => {
    const off = mount()
    pointer(off, 'pointermove', 300, 200)
    key('keydown', 'Alt')
    expect(off.lens.get()).toBeNull()
    off.destroy()
    const away = mount({ lens: true })
    key('keydown', 'Alt')
    expect(away.lens.get()).toBeNull()
  })

  it('follows the focused node when the key is held from the keyboard', () => {
    const graph = mount({ lens: true })
    graph.element.focus()
    graph.focus.set({ kind: 'node', key: 'near' })
    key('keydown', 'Alt', graph.element)
    expect(graph.lens.get()).toMatchObject({ at: { x: 420, y: 300 }, follow: 'focus' })
    graph.focus.set({ kind: 'node', key: 'far' })
    dom.flushFrames()
    expect(graph.lens.get()?.at).toEqual({ x: 200, y: 400 })
    key('keyup', 'Alt', graph.element)
    expect(graph.lens.get()).toBeNull()
  })

  it('changes the magnification with the wheel over the lens', () => {
    const graph = mount()
    graph.lens.set({ at: { x: 400, y: 300 } })
    const event = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
    for (const [name, value] of [
      ['clientX', 400],
      ['clientY', 300],
    ] as const) {
      Object.defineProperty(event, name, { value })
    }
    canvasOf(graph).dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(graph.lens.get()?.zoom).toBeGreaterThan(3)
    expect(graph.store.get().view.zoom).toBe(1)
  })

  it('moves a fixed lens dragged from its empty inside', () => {
    const graph = mount()
    graph.lens.set({ at: { x: 400, y: 300 } })
    const view = graph.store.get().view
    pointer(graph, 'pointerdown', 400, 280)
    pointer(graph, 'pointermove', 450, 300)
    pointer(graph, 'pointerup', 450, 300)
    expect(graph.lens.get()?.at).toEqual({ x: 450, y: 320 })
    expect(graph.store.get().view).toEqual(view)
  })

  it('drags a node through the lens magnification', () => {
    const graph = mount()
    graph.lens.set({ at: { x: 400, y: 300 } })
    pointer(graph, 'pointerdown', 460, 300)
    pointer(graph, 'pointermove', 490, 300)
    pointer(graph, 'pointerup', 490, 300)
    expect(graph.positions.get('near')?.x).toBeCloseTo(30)
  })
})
