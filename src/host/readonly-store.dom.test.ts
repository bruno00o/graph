import { createStore } from '@tanstack/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createLegend } from '../legend'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { createTimeline } from '../timeline'
import { createGraphHost, type GraphInstance } from './mount-graph'
import { readonlyOf } from './readonly-store'

interface Item {
  readonly id: string
  readonly group: string
  readonly start: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const day = 86_400_000
const items: Item[] = [
  { id: 'a', group: 'north', start: 0 },
  { id: 'b', group: 'south', start: 5 * day },
  { id: 'c', group: 'north', start: 9 * day },
]
const links: Link[] = [{ id: 'ab', from: 'a', to: 'b' }]

let dom: FakeDom

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [
          edges(links, { source: 'from', target: 'to', layer: 'links' }),
          nodes(items, { color: 'group', time: 'start', layer: 'items' }),
        ],
      }),
      ariaLabel: 'graph',
    },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  return graph as unknown as GraphInstance
}

describe('stores written from their own subscribers', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('keeps notifying a subscriber of readonlyOf that writes to the source', () => {
    const source = createStore({ n: 0 })
    const store = readonlyOf(source)
    const seen: number[] = []
    const subscription = store.subscribe((state) => {
      seen.push(state.n)
      if (state.n === 1) source.setState((current) => ({ n: current.n + 10 }))
    })
    for (const n of [1, 12, 13, 14]) source.setState(() => ({ n }))
    expect(seen).toEqual([1, 11, 12, 13, 14])
    expect(store.state).toEqual({ n: 14 })
    subscription.unsubscribe()
    source.setState(() => ({ n: 99 }))
    expect(seen).toHaveLength(5)
    expect(store.get()).toEqual({ n: 99 })
  })

  it('serves several subscribers and observer objects', () => {
    const source = createStore({ n: 0 })
    const store = readonlyOf(source)
    const first: number[] = []
    const second: number[] = []
    const a = store.subscribe((state) => first.push(state.n))
    const b = store.subscribe({ next: (state) => second.push(state.n) })
    source.setState(() => ({ n: 1 }))
    a.unsubscribe()
    source.setState(() => ({ n: 2 }))
    b.unsubscribe()
    source.setState(() => ({ n: 3 }))
    expect(first).toEqual([1])
    expect(second).toEqual([1, 2])
  })

  it('keeps notifying a subscriber of graph.store that calls an action of the graph', () => {
    const graph = mount()
    const widths: number[] = []
    graph.store.subscribe((state) => {
      widths.push(state.selection.nodes.length)
      if (state.selection.nodes.length === 0 && state.hiddenLayers.length === 1) {
        graph.selection.set({ nodes: ['a'] })
      }
    })
    graph.layers.hide(['links'])
    const before = widths.length
    graph.layers.show()
    graph.selection.clear()
    graph.selection.set({ nodes: ['b'] })
    expect(widths.length).toBeGreaterThan(before + 1)
    expect(widths.at(-1)).toBe(1)
    graph.destroy()
  })

  it('keeps notifying a subscriber of legend.store that calls the legend', () => {
    const graph = mount()
    const legend = createLegend(graph)
    const hidden: boolean[] = []
    legend.store.subscribe((state) => {
      hidden.push(state.layers[0]?.off ?? false)
      if (state.layers[0]?.off) legend.hover('l:links')
    })
    legend.toggle('l:links')
    legend.toggle('l:links')
    legend.toggle('l:links')
    expect(hidden.at(-1)).toBe(true)
    expect(hidden).toContain(false)
    expect(legend.store.state.layers[0]?.off).toBe(true)
    legend.destroy()
    graph.destroy()
  })

  it('keeps notifying a subscriber of timeline.store that calls the timeline', () => {
    const graph = mount()
    const timeline = createTimeline(graph, { bins: 20 })
    const windows: number[] = []
    let nudged = false
    timeline.store.subscribe((state) => {
      windows.push(state.window?.start ?? -1)
      if (state.window?.start === 0 && !nudged) {
        nudged = true
        timeline.nudge('end', 1)
      }
    })
    timeline.brush(0, 3 * day)
    timeline.brush(day, 3 * day)
    timeline.brush(2 * day, 3 * day)
    expect(windows).toContain(2 * day)
    expect(timeline.store.state.window?.start).toBe(2 * day)
    timeline.destroy()
    graph.destroy()
  })
})
