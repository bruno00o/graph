import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { createLegend } from '../legend'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { TimeWindow } from '../types'
import { historyFrom } from '.'

type Item = { id: string; x: number; y: number }
type Link = { id: string; from: string; to: string; kind: string }

const items: Item[] = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 10, y: 0 },
]
const links: Link[] = [
  { id: 'e1', from: 'a', to: 'b', kind: 'k0' },
  { id: 'e2', from: 'a', to: 'b', kind: 'k0' },
]
const journal = historyFrom([{ key: 'e1', time: 5, values: { kind: 'k1' } }])

let dom: FakeDom

function mount(window: TimeWindow) {
  const container = document.createElement('div')
  document.body.append(container)
  const definition = defineGraph({
    marks: [
      nodes(items, { x: 'x', y: 'y' }),
      edges(links, {
        source: 'from',
        target: 'to',
        color: 'kind',
        merge: true,
        history: journal,
      }),
    ],
  })
  const graph = createGraphHost(
    container,
    { definition, ariaLabel: 'graph', initialTime: window },
    () => fakeRenderer(),
  ) as unknown as GraphInstance
  dom.flushFrames()
  return graph
}

function edgeColors(graph: GraphInstance): Record<string, number> {
  const legend = createLegend(graph)
  const color = legend.store.state.color
  const counts: Record<string, number> = {}
  if (color?.type === 'categories') {
    for (const item of color.items) if (item.edges > 0) counts[String(item.value)] = item.edges
  }
  legend.destroy()
  return counts
}

describe('a merged edge whose first member changes through its history', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('takes the new value of its first member when the time moves', () => {
    const graph = mount({ start: 0, end: 1 })
    expect(edgeColors(graph)).toEqual({ k0: 1 })
    graph.time.set({ start: 6, end: 7 })
    dom.flushFrames()
    expect(edgeColors(graph)).toEqual({ k1: 1 })
    graph.destroy()
  })

  it('has that value when mounted at the same time', () => {
    const graph = mount({ start: 6, end: 7 })
    expect(edgeColors(graph)).toEqual({ k1: 1 })
    graph.destroy()
  })
})
