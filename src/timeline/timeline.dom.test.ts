import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { createTimeline, mountTimeline } from './index'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly start: number
  readonly end: number | null
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const day = 86_400_000
const origin = new Date(2024, 0, 1).getTime()

function item(id: string, from: number, to: number | null): Item {
  return {
    id,
    x: from / day,
    y: 0,
    start: origin + from * day,
    end: to === null ? null : origin + to * day,
  }
}

const items: Item[] = [item('a', 0, 10), item('b', 5, 30), item('c', 20, null), item('d', 40, 40)]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
]

function define(data: readonly Item[]) {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(data, {
        x: 'x',
        y: 'y',
        time: (entry) => ({ start: entry.start, end: entry.end }),
      }),
    ],
  })
}

let dom: FakeDom
let frames: FrameRequestCallback[] = []

function mount(data: readonly Item[] = items): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(container, { definition: define(data), ariaLabel: 'graph' }, () =>
    fakeRenderer(),
  )
  dom.flushFrames()
  return graph as unknown as GraphInstance
}

function frame(time: number): void {
  const pending = frames
  frames = []
  for (const callback of pending) callback(time)
}

describe('createTimeline', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('reads the extent and counts nodes and edges by day', () => {
    const graph = mount()
    const timeline = createTimeline(graph, { bins: 50 })
    const state = timeline.store.state
    expect(state.extent).toEqual({ start: origin, end: origin + 40 * day + 1 })
    expect(state.unit).toBe('day')
    const bin = (offset: number) =>
      state.bins.find((entry) => entry.start === origin + offset * day)
    expect(bin(0)).toMatchObject({ nodes: 1, edges: 0 })
    expect(bin(6)).toMatchObject({ nodes: 2, edges: 1 })
    expect(bin(25)).toMatchObject({ nodes: 2, edges: 1 })
    expect(bin(35)).toMatchObject({ nodes: 1, edges: 0 })
    expect(bin(40)).toMatchObject({ nodes: 2, edges: 0 })
    expect(state.ticks.length).toBeGreaterThan(2)
    timeline.destroy()
  })

  it('brushes, steps and clears the window of the graph', () => {
    const graph = mount()
    const timeline = createTimeline(graph, { bins: 50 })
    timeline.brush(origin + 10 * day, origin)
    expect(graph.time.get()).toEqual({ start: origin, end: origin + 10 * day })
    expect(timeline.store.state.window).toEqual(graph.time.get())
    timeline.step(2)
    expect(graph.time.get()).toEqual({ start: origin + 2 * day, end: origin + 12 * day })
    timeline.nudge('end', -20)
    expect(graph.time.get()).toEqual({ start: origin + 2 * day, end: origin + 2 * day })
    timeline.update({ mode: 'grow', bins: 50 })
    timeline.step()
    expect(graph.time.get()).toEqual({ start: origin + 2 * day, end: origin + 3 * day })
    timeline.move(day)
    expect(graph.time.get()).toEqual({ start: origin + 3 * day, end: origin + 4 * day })
    timeline.set({ start: origin })
    expect(graph.time.get()).toEqual({ start: origin, end: null })
    timeline.clear()
    expect(graph.time.get()).toBeNull()
    timeline.step()
    expect(graph.time.get()).toEqual({ start: origin, end: origin + day })
    timeline.destroy()
  })

  it('zooms and pans the bar inside the extent', () => {
    const graph = mount()
    const timeline = createTimeline(graph, { bins: 50 })
    const full = timeline.store.state.range
    timeline.zoom(4, origin + 20 * day)
    const range = timeline.store.state.range
    if (!full || !range) throw new Error('no range')
    expect(range.end - range.start).toBeCloseTo((full.end - full.start) / 4)
    expect(timeline.store.state.unit).toBe('hour')
    timeline.pan(-1000 * day)
    expect(timeline.store.state.range?.start).toBe(full.start)
    timeline.fit()
    expect(timeline.store.state.range).toEqual(full)
    timeline.destroy()
  })

  it('plays forward at its speed, then stops at the end or loops', () => {
    frames = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    )
    const graph = mount()
    for (let round = 0; round < 3; round++) frame(0)
    const timeline = createTimeline(graph, { speed: day })
    timeline.brush(origin, origin + 5 * day)
    timeline.play()
    expect(timeline.store.state.playing).toBe(true)
    frame(1000)
    frame(1050)
    frame(1100)
    expect(graph.time.get()?.start).toBeCloseTo(origin + 0.1 * day)
    frame(1150)
    expect(graph.time.get()?.end).toBeCloseTo(origin + 5.15 * day)
    timeline.update({ speed: 400 * day })
    frame(1250)
    expect(graph.time.get()?.end).toBe(origin + 40 * day + 1)
    expect(timeline.store.state.playing).toBe(false)
    timeline.play()
    expect(graph.time.get()?.start).toBe(origin)
    timeline.update({ speed: 400 * day, loop: true })
    frame(2000)
    frame(2100)
    expect(timeline.store.state.playing).toBe(true)
    expect(graph.time.get()?.start).toBe(origin)
    timeline.pause()
    expect(timeline.store.state.playing).toBe(false)
    timeline.destroy()
  })

  it('counts again when the data changes', () => {
    const graph = mount()
    const timeline = createTimeline(graph, { bins: 50 })
    graph.update({ definition: define([...items, item('e', 0, 2)]) })
    dom.flushFrames()
    vi.runAllTimers()
    const first = timeline.store.state.bins.find((entry) => entry.start === origin)
    expect(first).toMatchObject({ nodes: 2 })
    timeline.destroy()
  })

  it('counts only what changed and agrees with a fresh count', () => {
    const graph = mount()
    const timeline = createTimeline(graph, { bins: 50 })
    const steps: Item[][] = [
      [item('a', 0, 10), item('b', 12, 30), item('c', 20, null), item('d', 40, 40)],
      [item('a', 0, 10), item('b', 12, 30), item('c', 20, null)],
      [item('a', 0, 10), item('b', 12, 30), item('c', 2, 25), item('d', 3, 3), item('e', 1, 4)],
      [item('b', 12, 30), item('c', 2, 25), item('d', 3, 3), item('a', 0, 10)],
    ]
    for (const data of steps) {
      graph.update({ definition: define(data) })
      dom.flushFrames()
      vi.runAllTimers()
      const fresh = createTimeline(graph, { bins: 50 })
      expect(timeline.store.state.extent).toEqual(fresh.store.state.extent)
      expect(timeline.store.state.bins).toEqual(fresh.store.state.bins)
      fresh.destroy()
    }
    timeline.destroy()
  })
})

describe('mountTimeline', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('draws bins and a window operable by keyboard, without text of its own', () => {
    document.documentElement.lang = 'fr'
    const graph = mount()
    const timeline = createTimeline(graph, { bins: 50 })
    const view = mountTimeline(timeline, {
      ariaLabel: 'Frise',
      labels: { play: 'Lecture', start: 'Début', end: 'Fin', window: 'Période' },
      format: (time, unit, use) => `${use}:${unit}:${(time - origin) / day}`,
    })
    document.body.append(view.element)
    expect(view.element.getAttribute('aria-label')).toBe('Frise')
    expect(view.element.querySelectorAll('rect').length).toBeGreaterThan(20)
    const button = view.element.querySelector('button')
    expect(button?.getAttribute('aria-label')).toBe('Lecture')
    expect(button?.getAttribute('aria-pressed')).toBe('false')
    const end = view.element.querySelector<HTMLElement>('[data-part=end]')
    expect(end?.hidden).toBe(true)
    timeline.brush(origin, origin + 10 * day)
    expect(end?.hidden).toBe(false)
    expect(end?.getAttribute('role')).toBe('slider')
    expect(end?.getAttribute('aria-valuetext')).toBe('value:day:10')
    end?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(graph.time.get()).toEqual({ start: origin, end: origin + 11 * day })
    const both = view.element.querySelector<HTMLElement>('[data-part=window]')
    both?.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }))
    expect(graph.time.get()).toEqual({ start: origin - 10 * day, end: origin + day })
    both?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(graph.time.get()?.start).toBe(origin)
    expect(both?.getAttribute('aria-valuetext')).toBe('value:day:0, value:day:11')
    const texts = [...view.element.querySelectorAll('span')].map((span) => span.textContent)
    expect(texts.every((text) => text?.startsWith('tick:'))).toBe(true)
    button?.click()
    expect(button?.getAttribute('aria-pressed')).toBe('true')
    button?.click()
    view.destroy()
    expect(view.element.isConnected).toBe(false)
    timeline.destroy()
  })

  it('zooms by lines of the wheel and by a pinch on the bar', () => {
    const graph = mount()
    const timeline = createTimeline(graph, { bins: 50 })
    const view = mountTimeline(timeline)
    document.body.append(view.element)
    const track = view.element.querySelector('[data-part=window]')?.parentElement
    const span = () => {
      const range = timeline.store.state.range
      return range ? range.end - range.start : 0
    }
    const full = span()
    const lines = new WheelEvent('wheel', { deltaY: -3, deltaMode: 1, cancelable: true })
    track?.dispatchEvent(lines)
    expect(lines.defaultPrevented).toBe(true)
    expect(span()).toBeCloseTo(full / 2 ** (48 / 300), -3)
    timeline.fit()
    const send = (type: string, scale: number) => {
      const event = new Event(type, { cancelable: true })
      Object.defineProperty(event, 'scale', { value: scale })
      track?.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    }
    send('gesturestart', 1)
    send('gesturechange', 4)
    const pinch = new WheelEvent('wheel', { deltaY: -10, cancelable: true })
    Object.defineProperty(pinch, 'ctrlKey', { value: true })
    track?.dispatchEvent(pinch)
    send('gestureend', 4)
    expect(span()).toBeCloseTo(full / 4, -3)
    view.destroy()
    timeline.destroy()
  })
})
