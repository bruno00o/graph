import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { createLegend, type LegendCategory } from '../legend'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { createTimeline } from '../timeline'
import type { TimeWindow } from '../types'
import { historyFrom } from '.'

type Item = { id: string; status: string; x: number; y: number }
type Change = { id: string; time: number; kind: 'status'; node: string; status: string }

const day = 86_400_000
const origin = new Date(2024, 0, 1).getTime()

const items: Item[] = [
  { id: 'a', status: 'idle', x: 0, y: 0 },
  { id: 'b', status: 'idle', x: 10, y: 0 },
]

const changes: Change[] = [
  { id: 'c1', time: origin, kind: 'status', node: 'a', status: 'busy' },
  { id: 'c2', time: origin + 2 * day, kind: 'status', node: 'b', status: 'busy' },
  { id: 'c3', time: origin + 5 * day, kind: 'status', node: 'a', status: 'done' },
]

const history = historyFrom(changes, {
  key: 'node',
  values: (change) => ({ status: change.status }),
})

const definition = defineGraph({
  marks: [nodes(items, { x: 'x', y: 'y', label: 'status', history })],
})

let dom: FakeDom

function mount(time?: TimeWindow | null) {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition, ariaLabel: 'graph', ...(time !== undefined ? { initialTime: time } : {}) },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  return graph as unknown as GraphInstance<never, (typeof definition.marks)[number]>
}

const status = (graph: GraphInstance<never, (typeof definition.marks)[number]>, key: string) =>
  graph.datumOf({ kind: 'node', key })?.status

describe('values over time in a graph', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('shows the latest values without a time window', () => {
    const graph = mount()
    expect(status(graph, 'a')).toBe('done')
    expect(status(graph, 'b')).toBe('busy')
    expect(graph.history.instant()).toBe(Infinity)
    graph.destroy()
  })

  it('follows an instant cursor that steps through the shared journal', () => {
    const graph = mount()
    const timeline = createTimeline(graph, {
      events: changes,
      eventKind: 'kind',
      instant: true,
    })
    timeline.stepEvent()
    expect(graph.history.instant()).toBe(origin)
    expect(status(graph, 'a')).toBe('busy')
    expect(status(graph, 'b')).toBe('idle')
    timeline.stepEvent()
    expect(status(graph, 'b')).toBe('busy')
    timeline.stepEvent()
    expect(status(graph, 'a')).toBe('done')
    timeline.stepEvent(-1)
    expect(status(graph, 'a')).toBe('busy')
    timeline.clear()
    expect(status(graph, 'a')).toBe('done')
    timeline.destroy()
    graph.destroy()
  })

  it('reads values at the end of a window, excluding its end', () => {
    const graph = mount({ start: origin, end: origin + 5 * day })
    expect(graph.history.instant()).toBe(origin + 5 * day)
    expect(status(graph, 'a')).toBe('busy')
    graph.time.set({ start: origin - day, end: origin })
    expect(status(graph, 'a')).toBe('idle')
    graph.destroy()
  })

  it('lists the entries of an element', () => {
    const graph = mount()
    expect(graph.history.of({ kind: 'node', key: 'a' })).toEqual([
      { key: 'a', time: origin, values: { status: 'busy' } },
      { key: 'a', time: origin + 5 * day, values: { status: 'done' } },
    ])
    expect(graph.history.of({ kind: 'node', key: 'z' })).toEqual([])
    expect(Object.isFrozen(graph.history.of({ kind: 'node', key: 'a' }))).toBe(true)
    graph.destroy()
    expect(graph.history.of({ kind: 'node', key: 'a' })).toEqual([])
    expect(graph.history.instant()).toBe(Infinity)
  })

  it('keeps the categories of the whole history in the legend, counted at the moment', () => {
    const colored = defineGraph({
      marks: [nodes(items, { x: 'x', y: 'y', color: 'status', history })],
    })
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      { definition: colored, ariaLabel: 'graph', initialTime: { start: origin, end: origin } },
      () => fakeRenderer(),
    )
    dom.flushFrames()
    const legend = createLegend(graph)
    const categories = () => {
      const color = legend.store.state.color
      return color?.type === 'categories' ? color.items : []
    }
    const row = (item: LegendCategory) => [item.value, item.nodes]
    expect(categories().map(row)).toEqual([
      ['idle', 1],
      ['busy', 1],
      ['done', 0],
    ])
    legend.update({ empty: 'hide' })
    vi.runAllTimers()
    expect(categories().map(row)).toEqual([
      ['idle', 1],
      ['busy', 1],
    ])
    legend.update({ empty: undefined })
    vi.runAllTimers()
    expect(categories()).toHaveLength(3)
    legend.destroy()
    graph.destroy()
  })
})
