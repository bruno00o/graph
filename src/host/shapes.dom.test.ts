import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { mountMapGraph } from '../map'
import { nodes } from '../marks'
import { shapes } from '../shapes'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
import type { Layout, LayoutGraph, ShapeGeometry } from '../types'
import { internalsOf } from './internals'
import { createGraphHost } from './mount-graph'

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Zone {
  readonly id: string
  readonly geometry: ShapeGeometry | null
}

const items: Item[] = [
  { id: 'a', x: -10, y: 0 },
  { id: 'b', x: 10, y: 0 },
]

const zones: Zone[] = [
  { id: 'wide', geometry: { x: -400, y: -100, width: 800, height: 200 } },
  { id: 'small', geometry: { center: { x: 300, y: 300 }, radius: 50 } },
  { id: 'broken', geometry: { rings: [] } },
  { id: 'none', geometry: null },
]

let dom: FakeDom

function gliding(): Layout {
  return {
    name: 'gliding',
    options: {},
    start: (graph: LayoutGraph, listener) => {
      const xy = new Float32Array(graph.xy)
      for (let index = 0; index < graph.capacity; index++) {
        if (graph.movable[index] !== 1) continue
        xy[index * 2] = index * 100
        xy[index * 2 + 1] = index * 100
      }
      queueMicrotask(() => listener.end(xy))
      return { pin: () => {}, stop: () => {} }
    },
  }
}

function mountLaidOut(layout: Layout | null) {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [shapes(zones), nodes([{ id: 'a' }, { id: 'b' }])],
        layout,
      }),
      ariaLabel: 'graph',
    },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  return graph
}

function mount(withShapes = true, view = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const marks = withShapes
    ? [shapes(zones), nodes(items, { x: 'x', y: 'y' })]
    : [nodes(items, { x: 'x', y: 'y' })]
  const graph = createGraphHost(
    container,
    { definition: defineGraph({ marks, view }), ariaLabel: 'graph' },
    () => fakeRenderer(),
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

describe('shapes in a mounted graph', () => {
  it('counts shapes, and the shapes drawn, only with a shape mark', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mount()
    expect(graph.count()).toEqual({
      nodes: 2,
      edges: 0,
      pending: 0,
      shapes: 4,
      pendingShapes: 0,
      shown: { nodes: 2, edges: 0, shapes: 2 },
    })
    expect(mount(false).count()).toEqual({
      nodes: 2,
      edges: 0,
      pending: 0,
      shown: { nodes: 2, edges: 0 },
    })
    graph.destroy()
    expect(graph.count()).toEqual({
      nodes: 0,
      edges: 0,
      pending: 0,
      shapes: 0,
      pendingShapes: 0,
      shown: { nodes: 0, edges: 0, shapes: 0 },
    })
  })

  it('reports shapes that cannot be read among the issues', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mount()
    expect(graph.issues()).toEqual([
      { type: 'invalid-shape', kind: 'shapes', key: 'broken', reason: 'empty' },
    ])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('1 invalid-shape'))
  })

  it('frames the shapes on the first fit and on demand', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mount()
    const first = graph.view.get()
    expect(first.zoom).toBeLessThan(1)
    expect(first.x).toBeCloseTo(0)
    expect(first.y).toBeCloseTo(125)
    graph.view.set({ x: 0, y: 0, zoom: 1 })
    graph.view.fit({ shapes: ['small'] })
    dom.flushFrames()
    expect(graph.view.get().x).toBeCloseTo(300)
    expect(graph.view.get().y).toBeCloseTo(300)
    graph.view.fit({ nodes: ['a'], shapes: [] })
    dom.flushFrames()
    expect(graph.view.get().x).toBeCloseTo(-10)
    graph.view.fit({ shapes: ['broken', 'missing'] })
    dom.flushFrames()
    expect(graph.view.get().x).toBeCloseTo(-10)
  })

  it('frames the shapes after a run whose result glides', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mountLaidOut(null)
    const layout = gliding()
    const done = graph.layout.run(layout, { fit: true })
    await Promise.resolve()
    dom.flushFrames()
    await done
    expect(graph.view.get().x).toBeCloseTo(0)
    expect(graph.view.get().y).toBeCloseTo(125)
    graph.view.set({ x: 0, y: 0, zoom: 1 })
    const only = graph.layout.run(layout, { fit: { shapes: ['small'] } })
    await Promise.resolve()
    dom.flushFrames()
    await only
    expect(graph.view.get().x).toBeCloseTo(300)
    expect(graph.view.get().y).toBeCloseTo(300)
  })

  it('frames the shapes after the first layout, whose result glides', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mountLaidOut(gliding())
    await Promise.resolve()
    dom.flushFrames()
    expect(graph.view.get().x).toBeCloseTo(0)
    expect(graph.view.get().y).toBeCloseTo(125)
  })

  it('frames a pinned shape where its node ends a gliding run', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const pinned = [{ id: 'p', geometry: { center: { x: 0, y: 0 }, radius: 20 }, node: 'b' }]
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({
          marks: [shapes(pinned, { node: 'node' }), nodes([{ id: 'a' }, { id: 'b' }])],
          layout: null,
        }),
        ariaLabel: 'graph',
      },
      () => fakeRenderer(),
    )
    dom.flushFrames()
    const done = graph.layout.run(gliding(), { fit: { shapes: ['p'] } })
    await Promise.resolve()
    dom.flushFrames()
    await done
    expect(graph.view.get().x).toBeCloseTo(100)
    expect(graph.view.get().y).toBeCloseTo(100)
  })

  it('frames a graph of shapes alone', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      { definition: defineGraph({ marks: [shapes(zones)] }), ariaLabel: 'graph' },
      () => fakeRenderer(),
    )
    dom.flushFrames()
    expect(graph.view.get().x).toBeCloseTo(0)
    expect(graph.view.get().y).toBeCloseTo(125)
  })

  it('leaves the shapes out on a map and says so once in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { map } = fakeMap()
    const graph = mountMapGraph(map, {
      definition: defineGraph({ marks: [shapes(zones), nodes(items, { x: 'x', y: 'y' })] }),
      ariaLabel: 'map',
    })
    dom.flushFrames()
    expect(warn).toHaveBeenCalledWith('graph: shapes are not drawn on a map yet')
    expect(internalsOf(graph, 'test').scene.shapes.any).toBe(false)
    expect(graph.count()).toMatchObject({ shapes: 4, shown: { shapes: 0 } })
    graph.destroy()
  })
})
