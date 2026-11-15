import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { TimeValue } from '../types'
import { createTimeline } from '.'

const day = 86_400_000
const origin = Date.UTC(2026, 0, 5)

type Item = { id: string; time?: TimeValue | readonly TimeValue[]; x: number }
type Link = { id: string; from: string; to: string; time: number }

let dom: FakeDom

function mount(items: Item[], links: Link[]) {
  const container = document.createElement('div')
  document.body.append(container)
  const definition = defineGraph({
    marks: [
      nodes(items, { x: 'x', y: () => 0, time: 'time' }),
      edges(links, { source: 'from', target: 'to', time: 'time' }),
    ],
  })
  const graph = createGraphHost(
    container,
    { definition, ariaLabel: 'graph', initialTime: null },
    () => fakeRenderer(),
  ) as unknown as GraphInstance
  dom.flushFrames()
  return graph
}

function edgesAt(graph: GraphInstance, time: number): number {
  const timeline = createTimeline(graph, {
    bins: 20,
    extent: { start: origin, end: origin + 20 * day },
  })
  const bin = timeline.store.state.bins.find((each) => each.start <= time && time < each.end)
  timeline.destroy()
  return bin?.edges ?? -1
}

function shownAt(graph: GraphInstance, time: number): number {
  graph.time.set({ start: time, end: time + day })
  dom.flushFrames()
  return graph.count().shown.edges
}

describe('an edge at the instant its end node leaves', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('is not counted by the histogram, as it is never drawn', () => {
    const graph = mount(
      [
        { id: 'a', time: { start: origin, end: origin + 10 * day }, x: 0 },
        { id: 'b', x: 10 },
      ],
      [{ id: 'e', from: 'a', to: 'b', time: origin + 10 * day }],
    )
    expect(shownAt(graph, origin + 10 * day)).toBe(0)
    expect(edgesAt(graph, origin + 10 * day)).toBe(0)
    graph.destroy()
  })

  it('is not counted either when the node has several periods', () => {
    const graph = mount(
      [
        {
          id: 'a',
          time: [
            { start: origin, end: origin + 5 * day },
            { start: origin + 6 * day, end: origin + 10 * day },
          ],
          x: 0,
        },
        { id: 'b', x: 10 },
      ],
      [{ id: 'e', from: 'a', to: 'b', time: origin + 10 * day }],
    )
    expect(shownAt(graph, origin + 10 * day)).toBe(0)
    expect(edgesAt(graph, origin + 10 * day)).toBe(0)
    graph.destroy()
  })
})
