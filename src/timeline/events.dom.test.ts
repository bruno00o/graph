import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { TimeWindow } from '../types'
import { createTimeline, mountTimeline } from './index'

interface Change {
  readonly at: Date
  readonly type: 'added' | 'changed' | 'removed'
  readonly key: string
}

const day = 86_400_000
const origin = new Date(2024, 0, 1).getTime()

function change(offset: number, type: Change['type'], key: string): Change {
  return { at: new Date(origin + offset * day), type, key }
}

const history: Change[] = [
  change(0, 'added', 'a'),
  change(0, 'added', 'b'),
  change(2, 'changed', 'a'),
  change(5, 'added', 'c'),
  change(5, 'removed', 'b'),
  change(9, 'changed', 'c'),
]

const definition = defineGraph({
  marks: [
    nodes(
      [
        { id: 'a', x: 0, y: 0, start: origin, end: null },
        { id: 'b', x: 10, y: 0, start: origin, end: origin + 5 * day },
        { id: 'c', x: 20, y: 0, start: origin + 5 * day, end: null },
      ],
      { x: 'x', y: 'y', time: (item) => ({ start: item.start, end: item.end }) },
    ),
  ],
})

let dom: FakeDom

function mount(time?: TimeWindow | null, onTime?: (window: TimeWindow | null) => void) {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition,
      ariaLabel: 'graph',
      ...(time !== undefined ? { time, onTimeChange: ({ window }) => onTime?.(window) } : {}),
    },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  return graph as unknown as GraphInstance
}

function key(target: Element | null | undefined, name: string, shiftKey = false): void {
  target?.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true }))
}

describe('a timeline of events', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('stacks events by kind in calendar bins, and takes the extent from them', () => {
    const graph = mount()
    const timeline = createTimeline(graph, {
      events: history,
      eventTime: 'at',
      eventKind: 'type',
      kinds: ['removed'],
      kindColors: { changed: 'red' },
      bins: 20,
    })
    const state = timeline.store.state
    expect(state.extent).toEqual({ start: origin, end: origin + 9 * day + 1 })
    expect(state.kinds).toEqual([
      { kind: 'removed', color: 'var(--graph-cat-1)', count: 1, hidden: false },
      { kind: 'added', color: 'var(--graph-cat-2)', count: 3, hidden: false },
      { kind: 'changed', color: 'red', count: 2, hidden: false },
    ])
    const bin = (offset: number) =>
      state.bins.find((entry) => entry.start === origin + offset * day)
    expect(bin(0)).toMatchObject({ events: 2, kinds: [0, 2, 0], nodes: 2 })
    expect(bin(5)).toMatchObject({ events: 2, kinds: [1, 1, 0] })
    expect(bin(1)).toMatchObject({ events: 0, kinds: [0, 0, 0] })
    timeline.toggleKind('added')
    const hidden = timeline.store.state
    expect(hidden.kinds[1]?.hidden).toBe(true)
    expect(hidden.bins.find((entry) => entry.start === origin)).toMatchObject({
      events: 0,
      kinds: [0, 2, 0],
    })
    expect(timeline.events(origin, origin + 10 * day).map((entry) => entry.type)).toEqual([
      'changed',
      'removed',
      'changed',
    ])
    timeline.toggleKind('added')
    expect(timeline.store.state.kinds[1]?.hidden).toBe(false)
    timeline.destroy()
  })

  it('counts again when the list changes, and keeps toggled kinds', () => {
    const graph = mount()
    const timeline = createTimeline(graph, { events: history, eventTime: 'at', eventKind: 'type' })
    timeline.toggleKind('removed')
    timeline.update({ events: [...history, change(12, 'removed', 'a')] })
    const state = timeline.store.state
    expect(state.extent?.end).toBe(origin + 12 * day + 1)
    expect(state.kinds.find((kind) => kind.kind === 'removed')).toMatchObject({
      count: 2,
      hidden: true,
    })
    timeline.update({ hiddenKinds: [] })
    expect(timeline.store.state.kinds.every((kind) => !kind.hidden)).toBe(true)
    timeline.update({ events: null })
    expect(timeline.store.state.kinds).toEqual([])
    expect(timeline.store.state.extent?.start).toBe(origin)
    timeline.destroy()
  })

  it('moves an instant cursor by bins, by events, and by playback', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    )
    const graph = mount()
    const timeline = createTimeline(graph, {
      events: history,
      eventTime: 'at',
      eventKind: 'type',
      instant: true,
      speed: day,
      bins: 5,
    })
    expect(timeline.store.state.instant).toBe(true)
    timeline.stepEvent()
    expect(graph.time.get()).toEqual({ start: origin, end: origin })
    timeline.stepEvent()
    expect(graph.time.get()).toEqual({ start: origin + 2 * day, end: origin + 2 * day })
    expect(timeline.events(origin + 2 * day).map((entry) => entry.key)).toEqual(['a'])
    timeline.stepEvent(2)
    expect(graph.time.get()?.start).toBe(origin + 9 * day)
    timeline.stepEvent()
    expect(graph.time.get()?.start).toBe(origin + 9 * day)
    timeline.stepEvent(-1)
    expect(graph.time.get()?.start).toBe(origin + 5 * day)
    expect(graph.count().shown.nodes).toBe(2)
    timeline.step(-1)
    expect(graph.time.get()).toEqual({ start: origin + 3 * day, end: origin + 3 * day })
    timeline.nudge('start', 1)
    expect(graph.time.get()).toEqual({ start: origin + 5 * day, end: origin + 5 * day })
    timeline.play()
    for (const time of [1000, 1100]) for (const callback of frames.splice(0)) callback(time)
    expect(graph.time.get()?.start).toBeCloseTo(origin + 5.1 * day)
    expect(graph.time.get()?.end).toBe(graph.time.get()?.start)
    timeline.pause()
    timeline.destroy()
  })

  it('steps a window so that its end passes the next event', () => {
    const graph = mount()
    const timeline = createTimeline(graph, { events: history, eventTime: 'at', eventKind: 'type' })
    timeline.set({ start: origin, end: origin + day })
    timeline.stepEvent()
    expect(graph.time.get()).toEqual({ start: origin + day + 1, end: origin + 2 * day + 1 })
    timeline.update({ mode: 'grow' })
    timeline.stepEvent()
    expect(graph.time.get()).toEqual({ start: origin + day + 1, end: origin + 5 * day + 1 })
    timeline.stepEvent(-1)
    expect(graph.time.get()?.end).toBe(origin + 2 * day + 1)
    timeline.destroy()
  })

  it('asks a controlled graph and follows the answer', () => {
    let window: TimeWindow | null = null
    const asked: Array<TimeWindow | null> = []
    const graph = mount(null, (next) => asked.push(next))
    const timeline = createTimeline(graph, {
      events: history,
      eventTime: 'at',
      eventKind: 'type',
      instant: true,
    })
    timeline.stepEvent()
    expect(asked).toEqual([{ start: origin, end: origin }])
    expect(graph.time.get()).toBeNull()
    window = asked[0] ?? null
    graph.update({ time: window })
    expect(timeline.store.state.window).toEqual(window)
    timeline.stepEvent()
    expect(asked[1]).toEqual({ start: origin + 2 * day, end: origin + 2 * day })
    timeline.destroy()
  })

  it('works without a graph, with a window of its own', () => {
    const timeline = createTimeline({
      events: history,
      eventTime: 'at',
      eventKind: 'type',
      instant: true,
    })
    const seen: Array<TimeWindow | null> = []
    timeline.store.subscribe((state) => seen.push(state.window))
    expect(timeline.store.state.extent).toEqual({ start: origin, end: origin + 9 * day + 1 })
    timeline.stepEvent(-1)
    expect(timeline.store.state.window).toEqual({ start: origin + 9 * day, end: origin + 9 * day })
    timeline.clear()
    expect(seen).toEqual([{ start: origin + 9 * day, end: origin + 9 * day }, null])
    timeline.destroy()
    timeline.stepEvent()
    expect(timeline.store.state.window).toBeNull()
  })

  it('types the events it reads back and the fields it reads', () => {
    const timeline = createTimeline({ events: history, eventTime: 'at', eventKind: 'type' })
    expectTypeOf(timeline.events(origin)).toEqualTypeOf<readonly Change[]>()
    const wrong = () =>
      createTimeline({
        events: history,
        // @ts-expect-error
        eventTime: 'key',
      })
    expect(typeof wrong).toBe('function')
    timeline.destroy()
  })

  it('reads plain events with a time and a kind by default', () => {
    const timeline = createTimeline({
      events: [
        { time: origin, kind: 'x' },
        { time: new Date(origin + day), kind: 'y' },
        { time: origin + 2 * day },
      ],
    })
    expect(timeline.store.state.kinds.map((kind) => [kind.kind, kind.count])).toEqual([
      ['x', 1],
      ['y', 1],
      ['', 1],
    ])
    timeline.destroy()
  })
})

describe('mountTimeline with events', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('draws stacked kinds, a cursor slider, and buttons that hide kinds', () => {
    const graph = mount()
    const timeline = createTimeline(graph, {
      events: history,
      eventTime: 'at',
      eventKind: 'type',
      instant: true,
      bins: 10,
    })
    const view = mountTimeline(timeline, {
      labels: { cursor: 'Moment', kinds: 'Sortes' },
      kindText: (kind) => `k:${kind}`,
      format: (time, unit, use) => `${use}:${unit}:${(time - origin) / day}`,
    })
    document.body.append(view.element)
    const cursor = view.element.querySelector<HTMLElement>('[data-part=cursor]')
    const legend = view.element.querySelector<HTMLElement>('[data-part=kinds]')
    expect(cursor?.hidden).toBe(true)
    expect(legend?.hidden).toBe(false)
    expect(legend?.getAttribute('aria-label')).toBe('Sortes')
    const fills = new Set(
      [...view.element.querySelectorAll('rect[fill]')].map((rect) => rect.getAttribute('fill')),
    )
    expect(fills.has('var(--graph-cat-2)')).toBe(true)
    timeline.stepEvent()
    expect(cursor?.hidden).toBe(false)
    expect(cursor?.getAttribute('role')).toBe('slider')
    expect(cursor?.getAttribute('aria-label')).toBe('Moment')
    expect(cursor?.getAttribute('aria-valuetext')).toBe('value:day:0')
    for (const node of view.element.querySelectorAll('[data-part=window], [data-part=start]')) {
      expect((node as HTMLElement).hidden).toBe(true)
    }
    key(cursor, 'ArrowRight', true)
    expect(graph.time.get()?.start).toBe(origin + 2 * day)
    key(cursor, 'ArrowRight')
    expect(graph.time.get()).toEqual({ start: origin + 3 * day, end: origin + 3 * day })
    key(cursor, 'ArrowLeft', true)
    expect(graph.time.get()?.start).toBe(origin + 2 * day)
    key(cursor, 'End')
    expect(graph.time.get()?.start).toBe(timeline.store.state.extent?.end)
    const buttons = [...(legend?.querySelectorAll('button') ?? [])]
    expect(buttons.map((node) => node.textContent)).toEqual(['k:added', 'k:changed', 'k:removed'])
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true')
    buttons[0]?.click()
    expect(timeline.store.state.kinds[0]?.hidden).toBe(true)
    const after = [...(legend?.querySelectorAll('button') ?? [])]
    expect(after[0]).toBe(buttons[0])
    expect(after[0]?.getAttribute('aria-pressed')).toBe('false')
    view.update({ legend: false })
    expect(legend?.hidden).toBe(true)
    view.destroy()
    timeline.destroy()
  })

  it('places the cursor where the pointer presses and drags', () => {
    const graph = mount()
    const timeline = createTimeline(graph, {
      events: history,
      eventTime: 'at',
      eventKind: 'type',
      instant: true,
      bins: 20,
    })
    const view = mountTimeline(timeline, { snap: false })
    document.body.append(view.element)
    const track = view.element.querySelector('[data-part=cursor]')?.parentElement
    if (!track) throw new Error('no track')
    track.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 48)
    const range = timeline.store.state.range
    if (!range) throw new Error('no range')
    const at = (x: number) => range.start + (x / 1000) * (range.end - range.start)
    track.dispatchEvent(new PointerEvent('pointerdown', { clientX: 250, button: 0, bubbles: true }))
    expect(graph.time.get()).toEqual({ start: at(250), end: at(250) })
    track.dispatchEvent(new PointerEvent('pointermove', { clientX: 500, bubbles: true }))
    expect(graph.time.get()).toEqual({ start: at(500), end: at(500) })
    track.dispatchEvent(new PointerEvent('pointerup', { clientX: 500, bubbles: true }))
    view.destroy()
    timeline.destroy()
  })
})
