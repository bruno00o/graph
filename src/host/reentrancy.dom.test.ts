import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { EdgeBundling, GraphDefinition, Layout, LayoutListener } from '../types'
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

function definition(data: readonly Item[] = items): GraphDefinition {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(data, { x: 'x', y: 'y' }),
    ],
  })
}

function counted() {
  const runs = { started: 0, stopped: 0 }
  const layout: Layout = {
    name: 'counted',
    options: {},
    start: () => {
      runs.started++
      return {
        pin: () => {},
        stop: () => {
          runs.stopped++
        },
      }
    },
  }
  return { layout, runs }
}

let dom: FakeDom

function mount(
  graphDefinition = definition(),
  options: Partial<MountGraphOptions> = {},
): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  return createGraphHost(
    container,
    { definition: graphDefinition, ariaLabel: 'graph', ...options },
    fakeRenderer,
  )
}

function press(graph: GraphInstance, x: number, y: number): void {
  const canvas = graph.element.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  for (const type of ['pointerdown', 'pointerup']) {
    canvas.dispatchEvent(
      new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true }),
    )
  }
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('destroy from a store subscriber', () => {
  it('ends the frame without drawing', () => {
    const render = vi.fn(() => -1)
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      { definition: definition(), ariaLabel: 'graph' },
      () => ({
        ...fakeRenderer(),
        render,
      }),
    )
    const subscription = graph.store.subscribe(() => {
      if (graph.store.state.positionsVersion > 0) graph.destroy()
    })
    expect(() => dom.flushFrames()).not.toThrow()
    expect(graph.destroyed).toBe(true)
    expect(render).not.toHaveBeenCalled()
    subscription.unsubscribe()
  })

  it('stops a layout run that destroyed the graph as it started', () => {
    const runs = { started: 0, stopped: 0 }
    const stepping: Layout = {
      name: 'stepping',
      options: {},
      start: (layoutGraph, listener) => {
        runs.started++
        listener.progress(layoutGraph.xy, 0.5)
        return {
          pin: () => {},
          stop: () => {
            runs.stopped++
          },
        }
      },
    }
    const graph = mount(defineGraph({ marks: [nodes<Item>(items, {})], layout: null }))
    dom.flushFrames()
    graph.store.subscribe(() => {
      if (graph.store.state.layout.progress === 0.5) graph.destroy()
    })
    let result: boolean | null = null
    void graph.layout.run(stepping).then((completed) => {
      result = completed
    })
    expect(graph.destroyed).toBe(true)
    expect(runs).toEqual({ started: 1, stopped: 1 })
    return Promise.resolve().then(() => expect(result).toBe(false))
  })

  it('starts no bundling run once the graph is destroyed as bundling begins', () => {
    const runs = { started: 0, stopped: 0 }
    const bundling: EdgeBundling = {
      name: 'counted',
      options: {},
      strength: 1,
      maxEdges: 100,
      start: () => {
        runs.started++
        return {
          stop: () => {
            runs.stopped++
          },
        }
      },
    }
    const graph = mount(
      defineGraph({
        marks: [
          edges<Link>(links, { source: 'from', target: 'to' }),
          nodes<Item>(items, { x: 'x', y: 'y' }),
        ],
        bundling,
      }),
    )
    dom.flushFrames()
    graph.store.subscribe(() => {
      if (graph.store.state.bundling.running) graph.destroy()
    })
    void graph.bundling.run()
    expect(graph.destroyed).toBe(true)
    expect(runs.started - runs.stopped).toBe(0)
  })
})

describe('destroy from an event handler', () => {
  it('starts no layout run once a selectionchange handler destroyed the graph', () => {
    const { layout, runs } = counted()
    const placed = (data: readonly Item[]) =>
      defineGraph({
        marks: [edges<Link>(links, { source: 'from', target: 'to' }), nodes<Item>(data, {})],
        layout,
      })
    const graph = mount(placed(items))
    dom.flushFrames()
    graph.selection.set({ nodes: ['c'] })
    graph.on('selectionchange', () => graph.destroy())
    graph.update({ definition: placed([...items.slice(0, 2), { id: 'd', x: 0, y: 0 }]) })
    dom.flushFrames()
    expect(graph.destroyed).toBe(true)
    expect(runs.started - runs.stopped).toBe(0)
  })

  it('resolves layout.run to false when a layoutstart handler destroys the graph', async () => {
    const { layout, runs } = counted()
    const graph = mount()
    dom.flushFrames()
    graph.on('layoutstart', () => graph.destroy())
    await expect(graph.layout.run(layout)).resolves.toBe(false)
    expect(runs.started).toBe(0)
  })

  it('changes no state after a click handler destroyed the graph', () => {
    const graph = mount()
    dom.flushFrames()
    const selected = vi.fn()
    graph.on('selectionchange', selected)
    graph.on('click', () => graph.destroy())
    const at = graph.view.toScreen({ x: -100, y: 0 })
    press(graph, at.x, at.y)
    expect(graph.destroyed).toBe(true)
    expect(graph.selection.get()).toEqual({ nodes: [], edges: [] })
    expect(graph.store.state.hovered).toBeNull()
    expect(selected).not.toHaveBeenCalled()
  })

  it('sets no cursor after a pointerenter handler destroyed the graph', () => {
    const graph = mount()
    dom.flushFrames()
    graph.on('pointerenter', () => graph.destroy())
    graph.on('pointermove', () => {})
    const at = graph.view.toScreen({ x: -100, y: 0 })
    const canvas = graph.element.querySelector('canvas') as HTMLCanvasElement
    canvas.dispatchEvent(
      new PointerEvent('pointermove', { clientX: at.x, clientY: at.y, pointerId: 1 }),
    )
    expect(graph.destroyed).toBe(true)
    expect(canvas.style.cursor).toBe('')
    expect(dom.pendingFrames()).toBe(0)
  })

  it('stops calling the handlers of an event once one destroyed the graph', () => {
    const graph = mount()
    dom.flushFrames()
    const later = vi.fn()
    graph.on('selectionchange', () => graph.destroy())
    graph.on('selectionchange', later)
    graph.selection.set({ nodes: ['a'] })
    expect(graph.destroyed).toBe(true)
    expect(later).not.toHaveBeenCalled()
  })

  it('settles a layout run whose end destroyed the graph', async () => {
    let listener: LayoutListener | null = null
    const manual: Layout = {
      name: 'manual',
      options: {},
      start: (_, next) => {
        listener = next
        return { pin: () => {}, stop: () => {} }
      },
    }
    const graph = mount(defineGraph({ marks: [nodes<Item>(items, {})], layout: null }))
    dom.flushFrames()
    graph.on('positionchange', () => graph.destroy())
    const run = graph.layout.run(manual, { duration: 0 })
    const end = listener as LayoutListener | null
    end?.end(new Float32Array(16))
    expect(graph.destroyed).toBe(true)
    await expect(run).resolves.toBe(true)
  })
})
