import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createLegend } from '../legend'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { createTimeline } from '../timeline'
import type { GraphDefinition, Layout, LayoutListener } from '../types'
import { createGraphHost, type GraphInstance, type MountGraphOptions } from './mount-graph'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly group: string
  readonly time: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0, group: 'one', time: 0 },
  { id: 'b', x: 100, y: 0, group: 'two', time: 1000 },
  { id: 'c', x: 0, y: 100, group: 'one', time: 2000 },
]
const links: Link[] = [{ id: 'ab', from: 'a', to: 'b' }]

function definition(): GraphDefinition<'muted'> {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(items, { x: 'x', y: 'y', color: 'group', time: 'time' }),
    ],
    states: { muted: { opacity: 0.2 } },
    layout: null,
  })
}

let dom: FakeDom
let reported: unknown[]

function mount(options: Partial<MountGraphOptions<'muted'>> = {}): GraphInstance<'muted'> {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definition(), ariaLabel: 'graph', ...options },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

function click(graph: GraphInstance<'muted'>, key: 'a' | 'b' | 'c'): void {
  const item = items.find((each) => each.id === key) as Item
  const at = graph.view.toScreen(item)
  const canvas = graph.element.querySelector('canvas') as HTMLCanvasElement
  for (const type of ['pointerdown', 'pointerup']) {
    canvas.dispatchEvent(
      new PointerEvent(type, { clientX: at.x, clientY: at.y, button: 0, pointerId: 1 }),
    )
  }
}

function failing(message: string): () => never {
  return () => {
    throw new Error(message)
  }
}

beforeEach(() => {
  dom = installDom()
  reported = []
  vi.stubGlobal('reportError', (error: unknown) => reported.push(error))
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('event handlers', () => {
  it('runs every handler and reports the error of one that throws', () => {
    const graph = mount()
    const seen: string[] = []
    graph.on('selectionchange', () => seen.push('first'))
    graph.on('selectionchange', failing('handler'))
    graph.on('selectionchange', () => seen.push('last'))
    expect(() => graph.selection.set({ nodes: ['a'] })).not.toThrow()
    expect(seen).toEqual(['first', 'last'])
    expect(reported).toEqual([new Error('handler')])
    graph.destroy()
  })

  it('keeps the default selection after a click handler that throws', () => {
    const graph = mount()
    graph.on('click', failing('click'))
    click(graph, 'a')
    expect(graph.selection.get()).toEqual({ nodes: ['a'], edges: [] })
    expect(graph.store.state.hovered?.key).toBe('a')
    expect(reported).toHaveLength(1)
    graph.destroy()
  })

  it('skips a handler removed by an earlier one of the same event', () => {
    const graph = mount()
    const later = vi.fn()
    let stop = () => {}
    graph.on('selectionchange', () => stop())
    stop = graph.on('selectionchange', later)
    graph.selection.set({ nodes: ['a'] })
    expect(later).not.toHaveBeenCalled()
    graph.destroy()
  })

  it('rethrows outside the emit when reportError is missing', () => {
    vi.stubGlobal('reportError', undefined)
    const later: (() => void)[] = []
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
      later.push(callback)
      return 0
    }) as unknown as typeof setTimeout)
    const graph = mount()
    graph.on('selectionchange', failing('late'))
    expect(() => graph.selection.set({ nodes: ['a'] })).not.toThrow()
    expect(graph.selection.get().nodes).toEqual(['a'])
    expect(later).toHaveLength(1)
    expect(() => later[0]?.()).toThrow('late')
    vi.restoreAllMocks()
    graph.destroy()
  })

  it('settles layout.run when a layoutend handler throws', async () => {
    let listener: LayoutListener | null = null
    const manual: Layout = {
      name: 'manual',
      options: {},
      start: (_, next) => {
        listener = next
        return { pin: () => {}, stop: () => {} }
      },
    }
    const graph = mount()
    graph.on('layoutend', failing('layoutend'))
    const run = graph.layout.run(manual, { duration: 0 })
    const end = listener as LayoutListener | null
    expect(() => end?.end(new Float32Array(16))).not.toThrow()
    await expect(run).resolves.toBe(true)
    expect(graph.store.state.layout.running).toBe(false)
    expect(reported).toEqual([new Error('layoutend')])
    graph.destroy()
  })
})

describe('store subscribers', () => {
  it('notifies every subscriber, draws and resolves drawn when one throws', async () => {
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
    let calls = 0
    graph.store.subscribe(failing('subscriber'))
    graph.store.subscribe({
      next: () => {
        calls++
      },
    })
    const drawn = graph.drawn()
    expect(() => dom.flushFrames()).not.toThrow()
    await expect(drawn).resolves.toBeUndefined()
    expect(render).toHaveBeenCalled()
    expect(calls).toBeGreaterThan(0)
    expect(reported.length).toBe(calls)
    graph.destroy()
  })

  it('isolates the subscribers of the legend and the timeline', () => {
    const graph = mount()
    const legend = createLegend(graph, { hidden: 'muted' })
    const timeline = createTimeline(graph)
    legend.store.subscribe(failing('legend'))
    timeline.store.subscribe(failing('timeline'))
    const category = legend.store.state.color
    const id = category?.type === 'categories' ? category.items[0]?.id : undefined
    if (!id) throw new Error('no category')
    expect(() => legend.toggle(id)).not.toThrow()
    expect(graph.states.get('muted').nodes).toEqual(['a', 'c'])
    expect(() => timeline.set({ start: 0, end: 1500 })).not.toThrow()
    expect(graph.time.get()).toEqual({ start: 0, end: 1500 })
    expect(timeline.store.state.window).toEqual({ start: 0, end: 1500 })
    expect(reported.map((error) => (error as Error).message)).toEqual(['legend', 'timeline'])
    legend.destroy()
    timeline.destroy()
    graph.destroy()
  })
})

describe('controlled callbacks', () => {
  it('reports a throwing onSelectionChange and goes on with the click', () => {
    const graph = mount({ selection: {}, onSelectionChange: failing('selection') })
    click(graph, 'b')
    expect(graph.store.state.hovered?.key).toBe('b')
    expect(reported).toEqual([new Error('selection')])
    graph.update({ onSelectionChange: failing('again') })
    click(graph, 'a')
    expect(reported).toEqual([new Error('selection'), new Error('again')])
    graph.destroy()
  })

  it('reports a throwing onViewChange and still sends the next request', () => {
    const requests: number[] = []
    let calls = 0
    const graph = mount({
      view: { x: 0, y: 0, zoom: 1 },
      onViewChange: ({ view }) => {
        calls++
        requests.push(view.x)
        if (calls === 1) throw new Error('view')
      },
    })
    graph.view.set({ x: 10, y: 0, zoom: 1 })
    dom.flushFrames()
    graph.view.set({ x: 20, y: 0, zoom: 1 })
    dom.flushFrames()
    expect(requests).toEqual([10, 20])
    expect(reported).toEqual([new Error('view')])
    graph.destroy()
  })
})
