import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { TimeWindow } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly time: number
}

const items: Item[] = [
  { id: 'a', x: 0, y: 0, time: 5 },
  { id: 'b', x: 100, y: 0, time: 50 },
]

let dom: FakeDom

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

function mount(requests: (TimeWindow | null)[], time: TimeWindow): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [nodes<Item>(items, { x: 'x', y: 'y', time: 'time' })],
        layout: null,
      }),
      ariaLabel: 'graph',
      time,
      onTimeChange: ({ window }) => requests.push(window),
    },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph as GraphInstance
}

describe('controlled time with an application that answers later', () => {
  it('asks again for the current window after asking another one not answered yet', () => {
    const requests: (TimeWindow | null)[] = []
    const first: TimeWindow = { start: 0, end: 10 }
    const graph = mount(requests, first)
    graph.time.set({ start: 40, end: 60 })
    graph.time.set(first)
    expect(requests).toEqual([{ start: 40, end: 60 }, first])
    graph.destroy()
  })

  it('does not ask twice for the window it waits for', () => {
    const requests: (TimeWindow | null)[] = []
    const graph = mount(requests, { start: 0, end: 10 })
    graph.time.set({ start: 40, end: 60 })
    graph.time.set({ start: 40, end: 60 })
    expect(requests).toEqual([{ start: 40, end: 60 }])
    graph.destroy()
  })

  it('asks again for a window the application refused', () => {
    const requests: (TimeWindow | null)[] = []
    const first: TimeWindow = { start: 0, end: 10 }
    const graph = mount(requests, first)
    graph.time.set({ start: 40, end: 60 })
    graph.update({ time: first })
    graph.time.set({ start: 40, end: 60 })
    expect(requests).toEqual([
      { start: 40, end: 60 },
      { start: 40, end: 60 },
    ])
    expect(graph.time.get()).toEqual(first)
    graph.destroy()
  })

  it('ends on the window the application answers last', () => {
    const requests: (TimeWindow | null)[] = []
    const first: TimeWindow = { start: 0, end: 10 }
    const graph = mount(requests, first)
    graph.time.set({ start: 40, end: 60 })
    graph.time.set(first)
    for (const window of requests) graph.update({ time: window })
    expect(graph.time.get()).toEqual(first)
    graph.destroy()
  })

  it('asks selection again for the current value after another request', () => {
    const requests: string[][] = []
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({
          marks: [nodes<Item>(items, { x: 'x', y: 'y' })],
          layout: null,
        }),
        ariaLabel: 'graph',
        selection: { nodes: ['a'] },
        onSelectionChange: ({ selection }) => requests.push([...selection.nodes] as string[]),
      },
      fakeRenderer,
    )
    dom.flushFrames()
    graph.selection.set({ nodes: ['b'] })
    graph.selection.set({ nodes: ['a'] })
    expect(requests).toEqual([['b'], ['a']])
    graph.destroy()
  })
})
