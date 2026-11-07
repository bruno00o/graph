import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphDefinition, Layout, Point, View } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'

interface Item {
  readonly id: string
  readonly x?: number
  readonly y?: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
]

function definition(): GraphDefinition {
  return defineGraph({
    marks: [edges<Link>(links, { source: 'from', target: 'to' }), nodes<Item>(items, {})],
    interaction: { lens: true },
    layout: null,
  })
}

let dom: FakeDom

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definition(), ariaLabel: 'graph', initialView: { x: 0, y: 0, zoom: 1 } },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('positions.set', () => {
  it('skips the entries without a finite x and y, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mount()
    const before = graph.positions.get('a')
    const moved = vi.fn()
    graph.on('positionchange', moved)
    graph.positions.set([
      ['a', { x: Number.NaN, y: 0 }],
      ['b', { x: 10, y: 20 }],
      ['c', { x: 0, y: Number.POSITIVE_INFINITY }],
    ])
    expect(graph.positions.get('a')).toEqual(before)
    expect(graph.positions.get('b')).toEqual({ x: 10, y: 20 })
    expect(Number.isFinite(graph.positions.get('c')?.y)).toBe(true)
    expect(moved).toHaveBeenCalledOnce()
    expect([...(moved.mock.calls[0]?.[0].positions.keys() ?? [])]).toEqual(['b'])
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('2 node(s)')
    graph.destroy()
  })

  it('pins no node of a running layout at a position that is not finite', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pins: Point[] = []
    const pinning: Layout = {
      name: 'pinning',
      options: {},
      start: () => ({ pin: (_, x, y) => pins.push({ x, y }), stop: () => {} }),
    }
    const graph = mount()
    void graph.layout.run(pinning)
    graph.positions.set([
      ['a', { x: Number.NaN, y: Number.NaN }],
      ['b', { x: 5, y: 6 }],
    ])
    expect(pins).toEqual([{ x: 5, y: 6 }])
    graph.layout.stop()
    graph.destroy()
  })

  it('throws a RangeError for a duration that is not finite, and moves nothing', () => {
    const graph = mount()
    const before = graph.positions.get('a')
    expect(() => graph.positions.set([['a', { x: 1, y: 1 }]], { duration: Number.NaN })).toThrow(
      RangeError,
    )
    expect(graph.positions.get('a')).toEqual(before)
    graph.destroy()
  })
})

describe('view', () => {
  const broken: View[] = [
    { x: Number.NaN, y: 0, zoom: 1 },
    { x: 0, y: Number.POSITIVE_INFINITY, zoom: 1 },
    { x: 0, y: 0, zoom: Number.NaN },
  ]

  it('throws a RangeError for a view that is not finite, and keeps the view', () => {
    const graph = mount()
    const before = graph.view.get()
    for (const view of broken) expect(() => graph.view.set(view)).toThrow(RangeError)
    expect(() => graph.view.set({ x: 1, y: 1, zoom: 1 }, { duration: Number.NaN })).toThrow(
      RangeError,
    )
    dom.flushFrames()
    expect(graph.view.get()).toEqual(before)
    graph.destroy()
  })

  it('throws a RangeError for a zoom factor that is not a positive finite number', () => {
    const graph = mount()
    const before = graph.view.get()
    for (const factor of [Number.NaN, 0, -2, Number.POSITIVE_INFINITY]) {
      expect(() => graph.view.zoomBy(factor)).toThrow(RangeError)
    }
    expect(() => graph.view.zoomBy(2, { duration: Number.POSITIVE_INFINITY })).toThrow(RangeError)
    dom.flushFrames()
    expect(graph.view.get()).toEqual(before)
    graph.view.zoomBy(2)
    expect(graph.view.get().zoom).toBe(2)
    graph.destroy()
  })

  it('throws a RangeError for fit options that are not finite', async () => {
    const graph = mount()
    const before = graph.view.get()
    expect(() => graph.view.fit({ maxZoom: Number.NaN })).toThrow(RangeError)
    expect(() => graph.view.fit({ padding: Number.NaN })).toThrow(RangeError)
    expect(() => graph.view.fit({ padding: { left: Number.NaN } })).toThrow(RangeError)
    expect(() => graph.view.fit({ duration: Number.NaN })).toThrow(RangeError)
    dom.flushFrames()
    expect(graph.view.get()).toEqual(before)
    const endless: Layout = {
      name: 'endless',
      options: {},
      start: () => ({ pin: () => {}, stop: () => {} }),
    }
    await expect(graph.layout.run(endless, { duration: Number.NaN })).rejects.toThrow(RangeError)
    await expect(graph.layout.run(endless, { fit: { maxZoom: Number.NaN } })).rejects.toThrow(
      RangeError,
    )
    expect(graph.store.state.layout.running).toBe(false)
    graph.destroy()
  })
})

describe('lens and time', () => {
  it('throws a RangeError for a lens position that is not finite', () => {
    const graph = mount()
    expect(() => graph.lens.set({ at: { x: Number.NaN, y: 10 } })).toThrow(RangeError)
    expect(graph.lens.get()).toBeNull()
    graph.lens.set({ at: { x: 10, y: 10 } })
    expect(graph.lens.get()?.at).toEqual({ x: 10, y: 10 })
    graph.destroy()
  })

  it('throws a RangeError for a time window end that is not finite', () => {
    const graph = mount()
    expect(() => graph.time.set({ start: Number.NaN })).toThrow(RangeError)
    expect(graph.time.get()).toBeNull()
    graph.destroy()
  })
})

describe('after destroy', () => {
  it('throws for no input', () => {
    const graph = mount()
    graph.destroy()
    expect(() => graph.view.set({ x: Number.NaN, y: 0, zoom: 1 })).not.toThrow()
    expect(() => graph.view.zoomBy(0)).not.toThrow()
    expect(() =>
      graph.positions.set([['a', { x: 0, y: 0 }]], { duration: Number.NaN }),
    ).not.toThrow()
  })
})
