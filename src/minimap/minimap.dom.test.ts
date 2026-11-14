import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { nodes } from '../marks'
import { shapes } from '../shapes'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { createMinimap } from './index'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

const items: Item[] = [
  { id: 'a', x: -200, y: -100 },
  { id: 'b', x: 200, y: 100 },
]

let dom: FakeDom

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({ marks: [nodes<Item>(items, { x: 'x', y: 'y' })] }),
      ariaLabel: 'graph',
      initialView: { x: 0, y: 0, zoom: 1 },
    },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  return graph as unknown as GraphInstance
}

function pointer(type: string, x: number, y: number, extra: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    bubbles: true,
    cancelable: true,
    ...extra,
  })
}

describe('createMinimap', () => {
  beforeEach(() => {
    dom = installDom(400, 200)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('sits in a corner of the graph and frames the view once drawn', () => {
    const graph = mount()
    const minimap = createMinimap(graph, { width: 100, height: 60, padding: 0 })
    expect(minimap.element.parentElement).toBe(graph.element)
    expect(minimap.element.getAttribute('aria-hidden')).toBe('true')
    expect(minimap.element.style.bottom).toBe('12px')
    vi.runOnlyPendingTimers()
    const frame = minimap.element.querySelector('[data-view]') as HTMLElement
    expect(frame.style.visibility).toBe('visible')
    expect(frame.style.width).not.toBe('')
    minimap.destroy()
    expect(minimap.element.isConnected).toBe(false)
  })

  it('frames a graph of shapes alone', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const zones = [{ id: 'z', geometry: { x: 0, y: 0, width: 400, height: 200 } }]
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({ marks: [shapes(zones)] }),
        ariaLabel: 'graph',
        initialView: { x: 200, y: 100, zoom: 1 },
      },
      () => fakeRenderer(),
    )
    dom.flushFrames()
    const minimap = createMinimap(graph, { width: 100, height: 60, padding: 0 })
    vi.runOnlyPendingTimers()
    const frame = minimap.element.querySelector('[data-view]') as HTMLElement
    expect(frame.style.visibility).toBe('visible')
    expect(frame.style.width).toBe('100px')
    minimap.destroy()
  })

  it('centers the view on a press and moves it while dragging', () => {
    const graph = mount()
    const minimap = createMinimap(graph, { width: 100, height: 60, padding: 0 })
    vi.runOnlyPendingTimers()
    const view = vi.spyOn(graph.view, 'set')
    minimap.element.dispatchEvent(pointer('pointerdown', 95, 55))
    expect(view).toHaveBeenCalledTimes(1)
    const first = view.mock.calls[0]?.[0]
    expect(first?.x).toBeGreaterThan(0)
    expect(first?.y).toBeGreaterThan(0)
    minimap.element.dispatchEvent(pointer('pointermove', 50, 30))
    expect(view).toHaveBeenCalledTimes(2)
    minimap.element.dispatchEvent(pointer('pointerup', 50, 30))
    minimap.element.dispatchEvent(pointer('pointermove', 10, 10))
    expect(view).toHaveBeenCalledTimes(2)
  })

  it('zooms the view with the wheel unless told not to', () => {
    const graph = mount()
    const minimap = createMinimap(graph)
    const zoom = graph.store.state.view.zoom
    minimap.element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }))
    expect(graph.store.state.view.zoom).toBeGreaterThan(zoom)
    minimap.update({ zoom: false })
    const after = graph.store.state.view.zoom
    minimap.element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }))
    expect(graph.store.state.view.zoom).toBe(after)
  })

  it('zooms the view with a trackpad pinch and ignores its wheel events', () => {
    const graph = mount()
    const minimap = createMinimap(graph)
    const zoom = graph.store.state.view.zoom
    const send = (type: string, scale: number) => {
      const event = new Event(type, { cancelable: true })
      Object.defineProperty(event, 'scale', { value: scale })
      minimap.element.dispatchEvent(event)
      return event
    }
    expect(send('gesturestart', 1).defaultPrevented).toBe(true)
    send('gesturechange', 2)
    expect(graph.store.state.view.zoom).toBeCloseTo(zoom * 2)
    const pinch = new WheelEvent('wheel', { deltaY: -10, cancelable: true })
    Object.defineProperty(pinch, 'ctrlKey', { value: true })
    minimap.element.dispatchEvent(pinch)
    expect(pinch.defaultPrevented).toBe(true)
    expect(graph.store.state.view.zoom).toBeCloseTo(zoom * 2)
    send('gestureend', 2)
    minimap.update({ zoom: false })
    expect(send('gesturestart', 1).defaultPrevented).toBe(false)
  })

  it('keeps the options left out of update and resets those set to undefined', () => {
    const graph = mount()
    const minimap = createMinimap(graph, { zoom: false, width: 120 })
    minimap.update({ height: 90 })
    expect(minimap.element.style.width).toBe('120px')
    expect(minimap.element.style.height).toBe('90px')
    const zoom = graph.store.state.view.zoom
    minimap.element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }))
    expect(graph.store.state.view.zoom).toBe(zoom)
    minimap.update({ zoom: undefined, width: undefined })
    expect(minimap.element.style.width).toBe('200px')
    minimap.element.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }))
    expect(graph.store.state.view.zoom).toBeGreaterThan(zoom)
  })

  it('falls back to the default size for a size that is not above 0', () => {
    const graph = mount()
    const minimap = createMinimap(graph, { width: 0, height: 0 })
    expect(minimap.element.style.width).toBe('200px')
    expect(minimap.element.style.height).toBe('150px')
    minimap.update({ width: -4, height: Number.NaN })
    expect(minimap.element.style.width).toBe('200px')
    expect(minimap.element.style.height).toBe('150px')
    minimap.update({ width: 120, height: 90 })
    minimap.update({ width: 0, height: 0 })
    expect(minimap.element.style.width).toBe('200px')
    expect(minimap.element.style.height).toBe('150px')
  })

  it('leaves the element to the application without a corner', () => {
    const graph = mount()
    const minimap = createMinimap(graph, { corner: null })
    expect(minimap.element.parentElement).toBeNull()
    minimap.update({ corner: 'topLeft' })
    expect(minimap.element.parentElement).toBe(graph.element)
    expect(minimap.element.style.top).toBe('12px')
  })

  it('goes away with the graph', () => {
    const graph = mount()
    const minimap = createMinimap(graph)
    graph.destroy()
    expect(minimap.element.isConnected).toBe(false)
    expect(() => vi.runOnlyPendingTimers()).not.toThrow()
  })

  it('refuses an object that is not a graph', () => {
    expect(() => createMinimap({} as GraphInstance)).toThrow(/createMinimap/)
  })
})
