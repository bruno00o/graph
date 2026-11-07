import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { ViewLimitOptions } from '../types'
import type { ViewOrigin } from './events'
import { createGraphHost, type GraphInstance, type MountGraphOptions } from './mount-graph'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
  { id: 'c', x: 0, y: 100 },
]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
]

function definition(view: ViewLimitOptions = {}) {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(items, { x: 'x', y: 'y' }),
    ],
    view,
  })
}

let dom: FakeDom

function mount(
  view: ViewLimitOptions = {},
  options: Partial<MountGraphOptions> = {},
): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definition(view), ariaLabel: 'graphe', ...options },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

function wheel(graph: GraphInstance, deltaY: number) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY })
  for (const [name, value] of [
    ['clientX', 400],
    ['clientY', 300],
    ['ctrlKey', false],
    ['metaKey', false],
    ['shiftKey', false],
  ] as const) {
    Object.defineProperty(event, name, { value })
  }
  graph.element.querySelector('canvas')?.dispatchEvent(event)
}

function fitted(graph: GraphInstance, frame: () => void) {
  graph.view.set({ x: 500, y: 500, zoom: 0.5 })
  frame()
  dom.flushFrames()
  return graph.view.get()
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

describe('view.fit', () => {
  it('frames the nodes and the edges it is given, or everything', () => {
    const graph = mount()
    expect(fitted(graph, () => graph.view.fit({ nodes: ['a'], maxZoom: 2 }))).toEqual({
      x: -100,
      y: 0,
      zoom: 2,
    })
    const edge = fitted(graph, () => graph.view.fit({ edges: ['bc'] }))
    expect(edge.x).toBeCloseTo(50)
    expect(edge.y).toBeCloseTo(50)
    const all = fitted(graph, () => graph.view.fit())
    expect(all.x).toBeCloseTo(0)
    expect(all.y).toBeCloseTo(50)
    expect(all.zoom).toBeLessThan(edge.zoom)
  })

  it('takes a path or the selection as they are', () => {
    const graph = mount()
    const path = graph.paths.shortest('a', 'b')
    if (!path) throw new Error('no path')
    const line = fitted(graph, () => graph.view.fit(path))
    expect(line.x).toBeCloseTo(0)
    expect(line.y).toBeCloseTo(0)
    graph.selection.set({ nodes: ['c'] })
    const selected = fitted(graph, () =>
      graph.view.fit({ ...graph.selection.get(), maxZoom: 1, duration: 300 }),
    )
    expect(selected).toEqual({ x: 0, y: 100, zoom: 1 })
  })

  it('leaves each side its padding, and the definition the padding of the others', () => {
    const graph = mount({ padding: { left: 300 } })
    graph.view.fit()
    dom.flushFrames()
    const center = graph.view.toScreen({ x: 0, y: 50 })
    expect(center.x).toBeCloseTo((300 + 800 - 32) / 2)
    expect(center.y).toBeCloseTo(300)
    graph.view.fit({ nodes: ['a', 'b'], padding: { right: 400, left: 0 } })
    dom.flushFrames()
    expect(graph.view.toScreen({ x: 0, y: 0 }).x).toBeCloseTo(200)
    graph.view.fit({ nodes: ['a', 'b'], padding: 0 })
    dom.flushFrames()
    expect(graph.view.toScreen({ x: 0, y: 0 }).x).toBeCloseTo(400)
  })

  it('refuses keys passed as a list', () => {
    const graph = mount()
    const message = 'graph: view.fit takes options, such as { nodes }'
    expect(() => graph.view.fit(['a'] as never)).toThrow(new TypeError(message))
    expect(() => graph.view.fit(new Set(['a']) as never)).toThrow(TypeError)
    const legacy = graph.view.fit as (...args: unknown[]) => void
    expect(() => legacy({ nodes: ['a'] }, { padding: 0 })).toThrow(TypeError)
  })
})

describe('automatic framing', () => {
  it('frames the first data by default', () => {
    const graph = mount()
    expect(graph.view.get().y).toBeCloseTo(50)
  })

  it('keeps the view of the mount with autoFit never', () => {
    const graph = mount({ autoFit: 'never' })
    expect(graph.view.get()).toEqual({ x: 0, y: 0, zoom: 1 })
    graph.view.fit({ nodes: ['c'], maxZoom: 1 })
    dom.flushFrames()
    expect(graph.view.get()).toEqual({ x: 0, y: 100, zoom: 1 })
  })
})

describe('view origin', () => {
  it('tells user moves from code', () => {
    const graph = mount()
    const origins: ViewOrigin[] = []
    graph.on('viewchange', (event) => origins.push(event.origin))
    graph.view.set({ x: 1, y: 2, zoom: 1 })
    wheel(graph, -120)
    graph.view.fit()
    dom.flushFrames()
    graph.view.zoomBy(2)
    graph.element.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }))
    dom.flushFrames()
    expect(origins).toEqual(['api', 'user', 'api', 'api', 'user'])
  })

  it('carries the origin of controlled requests to the view that answers them', () => {
    const requests: ViewOrigin[] = []
    const applied: ViewOrigin[] = []
    const graph = mount(
      {},
      {
        view: { x: 0, y: 0, zoom: 1 },
        onViewChange: ({ view, origin }) => {
          requests.push(origin)
          graph.update({ view })
        },
      },
    )
    graph.on('viewchange', ({ origin }) => applied.push(origin))
    wheel(graph, -120)
    dom.flushFrames()
    graph.view.set({ x: 4, y: 4, zoom: 2 })
    dom.flushFrames()
    graph.update({ view: { x: 0, y: 0, zoom: 1 } })
    expect(requests).toEqual(['user', 'api'])
    expect(applied).toEqual(['user', 'api', 'api'])
  })
})
