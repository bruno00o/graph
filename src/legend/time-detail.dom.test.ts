import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detailStep } from '../core/visibility'
import { defineGraph } from '../define-graph'
import { internalsOf } from '../host/internals'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { TimeWindow } from '../types'
import { createLegend } from '.'

type Item = { id: string; kind: string; time: { start: number; end: number }; x: number }

const items: Item[] = [
  { id: 'a', kind: 'k0', time: { start: 5, end: 9 }, x: 0 },
  { id: 'b', kind: 'k1', time: { start: 6, end: 9 }, x: 10 },
]

let dom: FakeDom

function mount(window: TimeWindow | null) {
  const container = document.createElement('div')
  document.body.append(container)
  const definition = defineGraph({
    marks: [nodes(items, { x: 'x', y: () => 0, color: 'kind', time: 'time' })],
  })
  const graph = createGraphHost(
    container,
    { definition, ariaLabel: 'graph', initialTime: window },
    () => fakeRenderer(),
  ) as unknown as GraphInstance
  dom.flushFrames()
  return graph
}

function shownCounts(legend: ReturnType<typeof createLegend>): Record<string, number> {
  const color = legend.store.state.color
  const counts: Record<string, number> = {}
  if (color?.type === 'categories')
    for (const item of color.items) counts[String(item.value)] = item.nodes
  return counts
}

describe('a window before every time bound, then no window', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('gives a different detail step to the two sights', () => {
    const graph = mount({ start: 0, end: 1 })
    const internals = internalsOf(graph, 'review')
    const { nodes: columns, edges: lines } = internals.scene
    const before = detailStep(columns, lines, internals.sight())
    graph.time.set(null)
    dom.flushFrames()
    const after = detailStep(columns, lines, internals.sight())
    expect(graph.count().shown.nodes).toBe(2)
    expect(after).not.toBe(before)
    graph.destroy()
  })

  it('counts again the nodes the legend shows once the window is cleared', () => {
    const graph = mount({ start: 0, end: 1 })
    const legend = createLegend(graph)
    expect(shownCounts(legend)).toEqual({})
    graph.time.set(null)
    dom.flushFrames()
    vi.advanceTimersByTime(1_000)
    dom.flushFrames()
    vi.advanceTimersByTime(1_000)
    expect(shownCounts(legend)).toEqual({ k0: 1, k1: 1 })
    legend.destroy()
    graph.destroy()
  })

  it('counts them for a window that holds them', () => {
    const graph = mount({ start: 0, end: 1 })
    const legend = createLegend(graph)
    graph.time.set({ start: 5, end: 10 })
    dom.flushFrames()
    vi.advanceTimersByTime(1_000)
    dom.flushFrames()
    vi.advanceTimersByTime(1_000)
    expect(shownCounts(legend)).toEqual({ k0: 1, k1: 1 })
    legend.destroy()
    graph.destroy()
  })
})
