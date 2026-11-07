import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { exportPng, exportSvg } from '../export'
import { createLegend } from '../legend'
import { edges, nodes } from '../marks'
import { createMinimap } from '../minimap'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { createTimeline } from '../timeline'
import type { GraphDefinition, Layout } from '../types'
import {
  createGraphHost,
  type GraphInstance,
  type MountGraphOptions,
  mountGraph,
} from './mount-graph'
import type { Renderer } from './renderer'

const made = vi.hoisted(() => ({ renderers: 0 }))

vi.mock('../webgl/renderer', async () => {
  const { fakeRenderer: fake } = await import('../testing/dom')
  return {
    createWebglRenderer: () => {
      made.renderers++
      return fake()
    },
  }
})

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly group: string
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0, group: 'one' },
  { id: 'b', x: 100, y: 0, group: 'two' },
  { id: 'c', x: 0, y: 100, group: 'one' },
]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
]

function definition(placed = true): GraphDefinition<'muted'> {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(items, placed ? { x: 'x', y: 'y', color: 'group' } : { color: 'group' }),
    ],
    states: { muted: { opacity: 0.2 } },
  })
}

const endless: Layout = {
  name: 'endless',
  options: {},
  start: () => ({ pin: () => {}, stop: () => {} }),
}

let dom: FakeDom
let renders = 0

function counting(): Renderer {
  return {
    ...fakeRenderer(),
    render: () => {
      renders++
      return -1
    },
  }
}

function mount(
  options: Partial<MountGraphOptions<'muted'>> = {},
  graphDefinition = definition(),
): GraphInstance<'muted'> {
  const container = document.createElement('div')
  document.body.append(container)
  return createGraphHost(
    container,
    { definition: graphDefinition, ariaLabel: 'graphe', ...options },
    counting,
  )
}

function settle(): void {
  for (let round = 0; round < 3; round++) dom.flushFrames()
}

async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false
  promise.then(
    () => {
      done = true
    },
    () => {
      done = true
    },
  )
  for (let tick = 0; tick < 5; tick++) await Promise.resolve()
  return done
}

beforeEach(() => {
  dom = installDom()
  renders = 0
  made.renderers = 0
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('signal and destroyed', () => {
  it('aborts the signal on destroy, once the graph is gone', () => {
    const graph = mount()
    expect(graph.destroyed).toBe(false)
    expect(graph.signal.aborted).toBe(false)
    const seen: boolean[] = []
    graph.signal.addEventListener('abort', () => {
      seen.push(graph.destroyed, graph.element.isConnected)
    })
    graph.destroy()
    graph.destroy()
    expect(seen).toEqual([true, false])
    expect(graph.destroyed).toBe(true)
    expect(graph.signal.reason).toBeInstanceOf(DOMException)
    expect(graph.signal.reason.name).toBe('AbortError')
  })

  it('is destroyed when the signal of the mount aborts, with its reason', async () => {
    const controller = new AbortController()
    const graph = mount({ signal: controller.signal }, definition(false))
    settle()
    const run = graph.layout.run(endless)
    const reason = new Error('done')
    controller.abort(reason)
    expect(graph.destroyed).toBe(true)
    expect(graph.element.isConnected).toBe(false)
    expect(graph.signal.reason).toBe(reason)
    await expect(run).resolves.toBe(false)
  })

  it('stops listening to the signal of the mount once destroyed', () => {
    const controller = new AbortController()
    const add = vi.spyOn(controller.signal, 'addEventListener')
    const graph = mount({ signal: controller.signal })
    const options = add.mock.calls[0]?.[2] as AddEventListenerOptions
    expect(options.signal).toBe(graph.signal)
    graph.destroy()
    controller.abort()
    expect(graph.signal.reason).not.toBe(controller.signal.reason)
  })
})

describe('on with a signal', () => {
  it('unsubscribes when the signal aborts', () => {
    const graph = mount()
    settle()
    const controller = new AbortController()
    const seen: number[] = []
    graph.on('viewchange', ({ view }) => seen.push(view.zoom), { signal: controller.signal })
    graph.view.set({ x: 0, y: 0, zoom: 2 })
    controller.abort()
    graph.view.set({ x: 0, y: 0, zoom: 3 })
    expect(seen).toEqual([2])
  })

  it('subscribes nothing with an aborted signal, or once the graph is destroyed', () => {
    const graph = mount()
    settle()
    const seen: number[] = []
    const stop = graph.on('viewchange', ({ view }) => seen.push(view.zoom), {
      signal: AbortSignal.abort(),
    })
    graph.view.set({ x: 0, y: 0, zoom: 2 })
    stop()
    expect(seen).toEqual([])
    graph.destroy()
    const after = graph.on('viewchange', () => seen.push(0))
    expect(after).toBeTypeOf('function')
    after()
    expect(seen).toEqual([])
  })

  it('unsubscribes with the returned function too', () => {
    const graph = mount()
    settle()
    const controller = new AbortController()
    const seen: number[] = []
    const stop = graph.on('viewchange', ({ view }) => seen.push(view.zoom), {
      signal: controller.signal,
    })
    stop()
    graph.view.set({ x: 0, y: 0, zoom: 2 })
    controller.abort()
    expect(seen).toEqual([])
  })

  it('takes the graph signal to end with the graph', () => {
    const graph = mount()
    settle()
    const seen: string[] = []
    graph.on('layoutend', () => seen.push('end'), { signal: graph.signal })
    graph.destroy()
    expect(seen).toEqual([])
  })
})

describe('drawn', () => {
  it('resolves after the first frame', async () => {
    const graph = mount()
    expect(dom.pendingFrames()).toBe(1)
    const first = graph.drawn()
    expect(dom.pendingFrames()).toBe(1)
    expect(await settled(first)).toBe(false)
    dom.flushFrames()
    expect(renders).toBeGreaterThan(0)
    expect(await settled(first)).toBe(true)
  })

  it('waits for the frame already scheduled', async () => {
    const graph = mount()
    settle()
    const before = renders
    graph.selection.set({ nodes: ['a'] })
    expect(dom.pendingFrames()).toBe(1)
    const next = graph.drawn()
    expect(dom.pendingFrames()).toBe(1)
    dom.flushFrames()
    expect(await settled(next)).toBe(true)
    expect(renders).toBe(before + 1)
  })

  it('resolves on the next animation frame without drawing when nothing is due', async () => {
    const graph = mount()
    settle()
    expect(dom.pendingFrames()).toBe(0)
    const before = renders
    const calm = graph.drawn()
    const again = graph.drawn()
    expect(dom.pendingFrames()).toBe(1)
    expect(await settled(calm)).toBe(false)
    dom.flushFrames()
    expect(await settled(calm)).toBe(true)
    expect(await settled(again)).toBe(true)
    expect(renders).toBe(before)
    expect(dom.pendingFrames()).toBe(0)
  })

  it('waits for the frame scheduled before the animation frame comes', async () => {
    const graph = mount()
    settle()
    const before = renders
    const next = graph.drawn()
    graph.selection.set({ nodes: ['b'] })
    dom.flushFrames()
    expect(await settled(next)).toBe(true)
    expect(renders).toBe(before + 1)
  })

  it('rejects with the reason of the signal once destroyed', async () => {
    const graph = mount()
    const pending = graph.drawn()
    graph.destroy()
    await expect(pending).rejects.toBe(graph.signal.reason)
    await expect(graph.drawn()).rejects.toBe(graph.signal.reason)
  })

  it('waits for a restored context after a loss', async () => {
    const graph = mount()
    settle()
    const canvas = graph.element.querySelector('canvas')
    canvas?.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    const restored = graph.drawn()
    dom.flushFrames()
    expect(await settled(restored)).toBe(false)
    canvas?.dispatchEvent(new Event('webglcontextrestored'))
    settle()
    expect(await settled(restored)).toBe(true)
  })
})

describe('after destroy', () => {
  it('answers reads from the last state and runs no action', async () => {
    const graph = mount({ initialFolded: [] })
    settle()
    graph.selection.set({ nodes: ['a'] })
    graph.states.set('muted', { nodes: ['b'] })
    graph.view.set({ x: 10, y: 0, zoom: 2 })
    settle()
    const state = graph.store.state
    const notified = vi.fn()
    graph.store.subscribe(notified)
    graph.destroy()

    expect(graph.view.get()).toEqual({ x: 10, y: 0, zoom: 2 })
    expect(graph.view.toScreen({ x: 10, y: 0 })).toEqual({ x: 400, y: 300 })
    expect(graph.view.toWorld({ x: 400, y: 300 })).toEqual({ x: 10, y: 0 })
    expect(graph.selection.get()).toEqual({ nodes: ['a'], edges: [] })
    expect(graph.states.get('muted')).toEqual({ nodes: ['b'], edges: [] })
    expect(graph.states.has('muted', { kind: 'node', key: 'b' })).toBe(true)
    expect(graph.focus.get()).toBeNull()
    expect(graph.groups.folded()).toEqual([])
    expect(graph.layers.hidden()).toEqual([])
    expect(graph.time.get()).toBeNull()
    expect(graph.lens.get()).toBeNull()
    expect(graph.groups.keyOf('kind', 'x')).toBeTypeOf('string')

    expect(graph.pick({ x: 400, y: 300 })).toBeNull()
    expect(graph.neighbors('b')).toEqual([])
    expect(graph.edgesOf('b')).toEqual([])
    expect(graph.endpoints('ab')).toBeUndefined()
    expect(graph.datumOf({ kind: 'node', key: 'a' })).toBeUndefined()
    expect(graph.positions.get('a')).toBeUndefined()
    expect(graph.groups.parent('a')).toBeUndefined()
    expect(graph.groups.children('a')).toEqual([])
    expect(graph.layers.names()).toEqual([])
    expect(graph.paths.shortest('a', 'c')).toBeNull()
    expect(graph.paths.reach('a')).toEqual({ nodes: [], costs: [], edges: [] })
    expect(graph.support.carriers('ab')).toEqual({ edges: [], depths: [], nodes: [] })

    graph.view.set({ x: 0, y: 0, zoom: 1 })
    graph.view.fit()
    graph.view.zoomBy(2)
    graph.selection.set({ nodes: ['c'] })
    graph.selection.clear()
    graph.focus.set({ kind: 'node', key: 'a' })
    graph.states.add('muted', { nodes: ['c'] })
    graph.states.clear()
    graph.positions.set([['a', { x: 0, y: 0 }]])
    graph.groups.fold()
    graph.layers.hide()
    graph.time.set({ start: 0, end: 1 })
    graph.lens.set({ at: { x: 1, y: 1 } })
    graph.update({ ariaLabel: 'autre', definition: definition() })
    graph.layout.stop()
    const anchor = document.createElement('div')
    graph.anchors.set(anchor, { node: 'a' })()
    graph.anchors.remove(anchor)
    expect(anchor.isConnected).toBe(false)
    expect(graph.store.state).toBe(state)
    expect(notified).not.toHaveBeenCalled()
    expect(graph.element.getAttribute('aria-label')).toBe('graphe')
    expect(dom.pendingFrames()).toBe(0)

    await expect(graph.layout.run(endless)).resolves.toBe(false)
    await expect(graph.bundling.run()).resolves.toBe(false)
    await expect(graph.routing.run()).resolves.toBe(false)
    await expect(exportPng(graph)).rejects.toThrow('graph: cannot export a destroyed graph')
    await expect(exportSvg(graph)).rejects.toThrow('graph: cannot export a destroyed graph')
  })

  it('lets a minimap, a legend and a timeline be created, still', () => {
    const graph = mount()
    settle()
    graph.destroy()
    const minimap = createMinimap(graph)
    const legend = createLegend(graph)
    const timeline = createTimeline(graph)
    settle()
    expect(dom.pendingFrames()).toBe(0)
    minimap.destroy()
    legend.destroy()
    timeline.destroy()
  })
})

describe('mount with an aborted signal', () => {
  it('mounts nothing and returns a destroyed graph', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const container = document.createElement('div')
    document.body.append(container)
    const reason = new Error('gone')
    const graph = mountGraph(container, {
      definition: definition(),
      ariaLabel: 'graphe',
      initialView: { x: 5, y: 6, zoom: 2 },
      selection: { nodes: new Set(['b']) },
      onSelectionChange: () => {},
      signal: AbortSignal.abort(reason),
    })
    expect(container.childElementCount).toBe(0)
    expect(made.renderers).toBe(0)
    expect(dom.pendingFrames()).toBe(0)
    expect(warn).toHaveBeenCalledOnce()
    expect(graph.destroyed).toBe(true)
    expect(graph.signal.reason).toBe(reason)
    expect(graph.element.getAttribute('aria-label')).toBe('graphe')
    expect(graph.view.get()).toEqual({ x: 5, y: 6, zoom: 2 })
    expect(graph.states.get('muted')).toEqual({ nodes: [], edges: [] })
    expect(graph.neighbors('a')).toEqual([])
    graph.selection.set({ nodes: ['a'] })
    expect(graph.selection.get()).toEqual({ nodes: ['b'], edges: [] })
    graph.destroy()
    await expect(graph.drawn()).rejects.toBe(reason)
    await expect(graph.layout.run(endless)).resolves.toBe(false)
    await expect(exportPng(graph)).rejects.toThrow('graph: cannot export a destroyed graph')
  })

  it('lets the minimap, the legend and the timeline follow it, empty', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const container = document.createElement('div')
    document.body.append(container)
    const graph = mountGraph(container, {
      definition: definition(),
      ariaLabel: 'graphe',
      signal: AbortSignal.abort(),
    })
    const minimap = createMinimap(graph)
    const legend = createLegend(graph)
    const timeline = createTimeline(graph)
    settle()
    expect(legend.store.state.color).toBeNull()
    expect(timeline.store.state.extent).toBeNull()
    minimap.destroy()
    legend.destroy()
    timeline.destroy()
  })
})
