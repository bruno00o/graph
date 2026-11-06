import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createLegend } from '../legend/index'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { internalsOf } from './internals'
import { createGraphHost, type GraphInstance } from './mount-graph'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly level: number
  readonly group: string
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0, level: 0, group: 'north' },
  { id: 'b', x: 100, y: 0, level: 0, group: 'north' },
  { id: 'c', x: 0, y: 100, level: 1, group: 'south' },
]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
]

function define(data: readonly Item[] = items) {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(data, {
        x: 'x',
        y: 'y',
        color: 'group',
        minZoom: (item) => (item.level > 0 ? 2 : null),
      }),
    ],
    interaction: { lasso: true, select: 'multiple' },
  })
}

let dom: FakeDom

function mount(data: readonly Item[] = items): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(container, { definition: define(data), ariaLabel: 'graph' }, () =>
    fakeRenderer(),
  )
  dom.flushFrames()
  return graph as unknown as GraphInstance
}

function at(graph: GraphInstance, zoom: number): void {
  graph.view.set({ x: 0, y: 50, zoom })
  dom.flushFrames()
}

function screenOf(graph: GraphInstance, key: string) {
  const position = graph.positions.get(key)
  if (!position) throw new Error(`no position for ${key}`)
  return graph.view.toScreen(position)
}

describe('zoom ranges', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('neither picks a hidden node nor the edges that end at it', () => {
    const graph = mount()
    at(graph, 1)
    const b = screenOf(graph, 'b')
    const c = screenOf(graph, 'c')
    expect(graph.pick(c)).toBeNull()
    expect(graph.pick({ x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 })).toBeNull()
    at(graph, 3)
    expect(graph.pick(screenOf(graph, 'c'))?.key).toBe('c')
    const nb = screenOf(graph, 'b')
    const nc = screenOf(graph, 'c')
    expect(graph.pick({ x: (nb.x + nc.x) / 2, y: (nb.y + nc.y) / 2 })?.key).toBe('bc')
  })

  it('counts only the elements shown at the zoom in the legend', () => {
    const graph = mount()
    at(graph, 1)
    const legend = createLegend(graph)
    const counts = () => {
      const color = legend.store.state.color
      return color?.type === 'categories' ? color.items.map((item) => [item.value, item.nodes]) : []
    }
    expect(counts()).toEqual([['north', 2]])
    at(graph, 3)
    vi.runAllTimers()
    expect(counts()).toEqual([
      ['north', 2],
      ['south', 1],
    ])
    legend.destroy()
  })

  it('moves the keyboard focus over shown nodes only', () => {
    const graph = mount()
    at(graph, 1)
    graph.focus.set({ kind: 'node', key: 'a' })
    graph.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    )
    dom.flushFrames()
    expect(graph.focus.get()?.key).toBe('a')
  })

  it('forgets the ranges of removed nodes', () => {
    const graph = mount()
    const scene = internalsOf(graph, 'test').scene
    expect(scene.nodes.zoom.count).toBe(1)
    graph.update({ definition: define(items.slice(0, 2)) })
    dom.flushFrames()
    expect(scene.nodes.zoom.count).toBe(0)
  })
})
