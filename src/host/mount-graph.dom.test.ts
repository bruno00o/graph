import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import type { ReadonlyStore } from '@tanstack/store'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphDefinition } from '../types'
import type { ElementKeys, GraphEventName } from './events'
import {
  createGraphHost,
  type GraphInstance,
  type GraphState,
  type MountGraphOptions,
} from './mount-graph'

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
    states: { muted: { opacity: 0.2 } },
  })
}

let dom: FakeDom

function mount(
  graphDefinition = definition(),
  options: Partial<MountGraphOptions> = {},
): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: graphDefinition, ariaLabel: 'graphe', ...options },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

function canvasOf(graph: GraphInstance): HTMLCanvasElement {
  const canvas = graph.element.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  return canvas
}

function pointer(
  graph: GraphInstance,
  type: string,
  x: number,
  y: number,
  init: PointerEventInit = {},
) {
  canvasOf(graph).dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      button: 0,
      pointerId: 1,
      bubbles: true,
      ...init,
    }),
  )
}

function press(graph: GraphInstance, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  graph.element.dispatchEvent(event)
  dom.flushFrames()
  return event.defaultPrevented
}

function click(graph: GraphInstance, x: number, y: number, init: PointerEventInit = {}) {
  pointer(graph, 'pointerdown', x, y, init)
  pointer(graph, 'pointerup', x, y, init)
}

function screenOf(graph: GraphInstance, key: string) {
  const position = graph.positions.get(key)
  if (!position) throw new Error(`no position for ${key}`)
  return graph.view.toScreen(position)
}

function mutedOf(graph: GraphInstance) {
  const { muted } = graph.store.get().states
  return muted
}

function record(graph: GraphInstance, names: readonly GraphEventName[]): string[] {
  const seen: string[] = []
  for (const name of names) graph.on(name, () => seen.push(name))
  return seen
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

describe('createGraphHost', () => {
  it('mounts an accessible element and fits the graph on the first frame', () => {
    const graph = mount()
    expect(graph.element.getAttribute('role')).toBe('application')
    expect(graph.element.tabIndex).toBe(0)
    expect(graph.element.getAttribute('aria-label')).toBe('graphe')
    const { view, width, height } = graph.store.get()
    expect([width, height]).toEqual([800, 600])
    expect(view.x).toBeCloseTo(0)
    expect(view.y).toBeCloseTo(50)
    expect(graph.store.get().positionsVersion).toBeGreaterThan(0)
  })

  it('draws a new frame when the renderer asks for one', () => {
    let invalidate = () => {}
    let renders = 0
    const container = document.createElement('div')
    document.body.append(container)
    createGraphHost(container, { definition: definition(), ariaLabel: 'graphe' }, (_, request) => {
      invalidate = request
      return {
        ...fakeRenderer(),
        render: () => {
          renders++
          return -1
        },
      }
    })
    dom.flushFrames()
    const before = renders
    invalidate()
    dom.flushFrames()
    expect(renders).toBe(before + 1)
  })

  it('exposes host state as a read-only TanStack store', () => {
    const graph = mount()
    expectTypeOf(graph.store).toEqualTypeOf<ReadonlyStore<GraphState>>()
    expect('setState' in graph.store).toBe(false)
    const seen: number[] = []
    const subscription = graph.store.subscribe((state) => seen.push(state.selection.nodes.length))
    graph.selection.set({ nodes: ['a', 'b'] })
    subscription.unsubscribe()
    graph.selection.clear()
    expect(seen).toEqual([2])
    expect(graph.store.state.selection.nodes).toEqual([])
  })

  it('selects on click, adds with a modifier and clears on empty space', () => {
    const graph = mount()
    const changes: string[][] = []
    graph.on('selectionchange', ({ nodes: selected }) => changes.push([...selected].map(String)))
    const a = screenOf(graph, 'a')
    const b = screenOf(graph, 'b')
    click(graph, a.x, a.y)
    click(graph, b.x, b.y, { shiftKey: true })
    expect(graph.selection.get().nodes).toEqual(['a', 'b'])
    click(graph, a.x, a.y, { metaKey: true })
    expect(graph.selection.get().nodes).toEqual(['b'])
    click(graph, 790, 10)
    expect(graph.selection.get()).toEqual({ nodes: [], edges: [] })
    expect(changes).toEqual([['a'], ['a', 'b'], ['b'], []])
  })

  it('adds the nodes inside a lasso drawn with Shift on empty space', () => {
    const graph = mount(defineGraph({ marks: definition().marks, interaction: { lasso: true } }))
    const a = screenOf(graph, 'a')
    const c = screenOf(graph, 'c')
    graph.selection.set({ nodes: ['a'] })
    const corners = [
      [a.x - 40, a.y - 40],
      [c.x + 40, a.y - 40],
      [c.x + 40, c.y + 40],
      [a.x - 40, c.y + 40],
    ] as const
    const [start] = corners
    pointer(graph, 'pointerdown', start[0], start[1], { shiftKey: true })
    expect(canvasOf(graph).style.cursor).toBe('crosshair')
    for (const [x, y] of corners.slice(1)) pointer(graph, 'pointermove', x, y, { shiftKey: true })
    expect(graph.element.querySelector('svg path')?.getAttribute('d')).toMatch(/^M.*Z$/)
    const view = graph.store.get().view
    pointer(graph, 'pointerup', start[0], start[1] + 1, { shiftKey: true })
    expect(graph.selection.get().nodes).toEqual(['a', 'c'])
    expect(graph.store.get().view).toEqual(view)
    expect(graph.element.querySelector('svg')).toBeNull()
  })

  it('pans on Shift and drag when the lasso is off', () => {
    const graph = mount()
    const view = graph.store.get().view
    pointer(graph, 'pointerdown', 790, 10, { shiftKey: true })
    pointer(graph, 'pointermove', 700, 60, { shiftKey: true })
    pointer(graph, 'pointerup', 700, 60, { shiftKey: true })
    expect(graph.store.get().view).not.toEqual(view)
    expect(graph.selection.get().nodes).toEqual([])
  })

  it('moves the focus with arrows, selects with Enter and clears with Escape', () => {
    const graph = mount()
    const focused: Array<string | null> = []
    graph.on('focuschange', ({ target }) => focused.push(target ? String(target.key) : null))
    expect(press(graph, 'ArrowRight')).toBe(true)
    expect(press(graph, 'ArrowLeft')).toBe(true)
    expect(press(graph, 'ArrowRight')).toBe(true)
    expect(focused).toEqual(['c', 'a', 'b'])
    expect(graph.store.get().focused?.key).toBe('b')
    expect(graph.element.querySelector('[aria-live]')?.textContent).toBe('b')
    press(graph, 'Enter')
    press(graph, 'ArrowLeft')
    press(graph, ' ', { shiftKey: true })
    expect(graph.selection.get().nodes).toEqual(['b', 'a'])
    expect(press(graph, 'Escape')).toBe(true)
    expect(graph.selection.get().nodes).toEqual([])
    expect(press(graph, 'Escape')).toBe(true)
    expect(graph.focus.get()).toBeNull()
    expect(press(graph, 'Escape')).toBe(false)
    expect(press(graph, 'ArrowRight', { metaKey: true })).toBe(false)
  })

  it('starts from the last selected node and zooms, pans and fits from the keyboard', () => {
    const graph = mount()
    graph.selection.set({ nodes: ['b'] })
    press(graph, 'ArrowDown')
    expect(graph.focus.get()?.key).toBe('b')
    const fitted = graph.store.get().view
    press(graph, '+')
    expect(graph.store.get().view.zoom).toBeCloseTo(fitted.zoom * 1.5)
    const zoomed = graph.store.get().view
    press(graph, 'ArrowRight', { shiftKey: true })
    expect(graph.store.get().view.x).toBeGreaterThan(zoomed.x)
    press(graph, '0')
    expect(graph.store.get().view.zoom).toBeCloseTo(fitted.zoom)
  })

  it('focuses programmatically, reveals the node and forgets removed nodes', () => {
    const graph = mount()
    graph.view.set({ x: 5000, y: 5000, zoom: 1 })
    dom.flushFrames()
    graph.focus.set({ kind: 'node', key: 'a' })
    dom.flushFrames()
    expect(graph.focus.get()?.key).toBe('a')
    expect(graph.store.get().view).toMatchObject({ x: -100, y: 0 })
    graph.focus.set({ kind: 'node', key: 'missing' })
    expect(graph.focus.get()?.key).toBe('a')
    const seen: Array<string | null> = []
    graph.on('focuschange', ({ target }) => seen.push(target ? String(target.key) : null))
    graph.update({ definition: definition(items.slice(1)) })
    dom.flushFrames()
    expect(graph.focus.get()).toBeNull()
    expect(seen).toEqual([null])
  })

  it('leaves the keyboard alone when it is turned off', () => {
    const graph = mount(
      defineGraph({ marks: definition().marks, interaction: { keyboard: false } }),
    )
    expect(graph.element.getAttribute('role')).toBe('img')
    expect(graph.element.hasAttribute('tabindex')).toBe(false)
    expect(press(graph, 'ArrowRight')).toBe(false)
    expect(graph.focus.get()).toBeNull()
  })

  it('reports the clicked target and picks edges', () => {
    const graph = mount()
    const targets: unknown[] = []
    graph.on('click', ({ target }) => targets.push(target && [target.kind, target.key]))
    const a = screenOf(graph, 'a')
    const b = screenOf(graph, 'b')
    click(graph, (a.x + b.x) / 2, (a.y + b.y) / 2)
    expect(targets).toEqual([['edge', 'ab']])
    expect(graph.selection.get().edges).toEqual(['ab'])
    expect(graph.pick(a)).toEqual({ kind: 'node', key: 'a', datum: items[0] })
  })

  it('keeps one element selected in single mode', () => {
    const graph = mount(defineGraph({ ...definition(), interaction: { select: 'single' } }))
    const a = screenOf(graph, 'a')
    const b = screenOf(graph, 'b')
    click(graph, a.x, a.y)
    click(graph, b.x, b.y, { shiftKey: true })
    expect(graph.selection.get().nodes).toEqual(['b'])
  })

  it('hovers elements and emits enter and leave', () => {
    const graph = mount()
    const seen = record(graph, ['pointerenter', 'pointerleave'])
    const a = screenOf(graph, 'a')
    pointer(graph, 'pointermove', a.x, a.y)
    expect(graph.store.get().hovered).toMatchObject({ kind: 'node', key: 'a' })
    expect(canvasOf(graph).style.cursor).toBe('pointer')
    pointer(graph, 'pointermove', 790, 10)
    expect(graph.store.get().hovered).toBeNull()
    expect(seen).toEqual(['pointerenter', 'pointerleave'])
  })

  it('drags the whole selection without clicking', () => {
    const graph = mount()
    const seen = record(graph, ['dragstart', 'drag', 'dragend', 'click'])
    graph.selection.set({ nodes: ['a', 'b'] })
    const a = screenOf(graph, 'a')
    const zoom = graph.view.get().zoom
    pointer(graph, 'pointerdown', a.x, a.y)
    pointer(graph, 'pointermove', a.x + 20, a.y + 10)
    pointer(graph, 'pointermove', a.x + 40, a.y + 20)
    pointer(graph, 'pointerup', a.x + 40, a.y + 20)
    expect(graph.positions.get('a')?.x).toBeCloseTo(-100 + 40 / zoom)
    expect(graph.positions.get('b')?.y).toBeCloseTo(20 / zoom)
    expect(graph.positions.get('c')).toEqual({ x: 0, y: 100 })
    expect(seen).toEqual(['dragstart', 'drag', 'drag', 'dragend'])
    expect(graph.selection.get().nodes).toEqual(['a', 'b'])
  })

  it('pans on empty space', () => {
    const graph = mount()
    const before = graph.view.get()
    pointer(graph, 'pointerdown', 790, 10)
    pointer(graph, 'pointermove', 770, 10)
    pointer(graph, 'pointerup', 770, 10)
    expect(graph.view.get().x).toBeCloseTo(before.x + 20 / before.zoom)
  })

  it('manages declared states and refuses unknown ones', () => {
    const graph = mount()
    graph.states.set('muted', { nodes: ['a'], edges: ['bc'] })
    expect(graph.states.has('muted', { kind: 'node', key: 'a' })).toBe(true)
    expect(mutedOf(graph)).toEqual({ nodes: ['a'], edges: ['bc'] })
    graph.states.add('muted', { nodes: ['c'] })
    graph.states.remove('muted', { nodes: ['a'] })
    expect(mutedOf(graph)?.nodes).toEqual(['c'])
    graph.states.clear()
    expect(mutedOf(graph)).toEqual({ nodes: [], edges: [] })
    expect(() => graph.states.set('missing', {})).toThrow('unknown state')
    expect(() => graph.states.set('selected', {})).toThrow('unknown state')
  })

  it('drops removed elements from the selection', () => {
    const graph = mount()
    graph.selection.set({ nodes: ['a', 'c'] })
    const seen = record(graph, ['selectionchange'])
    graph.update({ definition: definition(items.filter((item) => item.id !== 'a')) })
    dom.flushFrames()
    expect(graph.selection.get().nodes).toEqual(['c'])
    expect(seen).toEqual(['selectionchange'])
  })

  it('moves nodes and animates the view', () => {
    const graph = mount()
    graph.positions.set([['c', { x: 10, y: 20 }]])
    expect(graph.positions.get('c')).toEqual({ x: 10, y: 20 })
    const views: number[] = []
    graph.on('viewchange', ({ view }) => views.push(view.zoom))
    graph.view.set({ x: 0, y: 0, zoom: 2 }, { duration: 200 })
    dom.flushFrames()
    expect(graph.view.get()).toEqual({ x: 0, y: 0, zoom: 2 })
    expect(views.at(-1)).toBe(2)
  })

  it('follows x and y changes from the data', () => {
    const graph = mount()
    const moved = items.map((item) => (item.id === 'a' ? { ...item, x: -300 } : item))
    graph.update({ definition: definition(moved) })
    dom.flushFrames()
    expect(graph.positions.get('a')).toEqual({ x: -300, y: 0 })
    expect(graph.positions.get('b')).toEqual({ x: 100, y: 0 })
  })

  it('follows positions written to a TanStack DB collection', async () => {
    const collection = createCollection(
      localOnlyCollectionOptions({
        id: 'moving',
        getKey: (item: Item) => item.id,
        initialData: items,
      }),
    )
    const graph = mount(defineGraph({ marks: [nodes(collection, { x: 'x', y: 'y' })] }))
    await vi.waitFor(() => {
      dom.flushFrames()
      expect(graph.positions.get('a')).toEqual({ x: -100, y: 0 })
    })
    collection.update('a', (draft) => {
      draft.x = 250
    })
    await vi.waitFor(() => {
      dom.flushFrames()
      expect(graph.positions.get('a')).toEqual({ x: 250, y: 0 })
    })
  })

  it('keeps a dragged node under the pointer when its data moves', () => {
    const graph = mount()
    const a = screenOf(graph, 'a')
    pointer(graph, 'pointerdown', a.x, a.y)
    pointer(graph, 'pointermove', a.x + 40, a.y)
    const dragged = graph.positions.get('a')
    const moved = items.map((item) => (item.id === 'a' ? { ...item, x: 500 } : item))
    graph.update({ definition: definition(moved) })
    dom.flushFrames()
    expect(graph.positions.get('a')).toEqual(dragged)
    pointer(graph, 'pointerup', a.x + 40, a.y)
  })

  it('reads the neighborhood', () => {
    const graph = mount()
    expect(graph.neighbors('b').sort()).toEqual(['a', 'c'])
    expect(graph.edgesOf('b').sort()).toEqual(['ab', 'bc'])
    expect(graph.endpoints('bc')).toEqual({ source: 'b', target: 'c' })
  })

  it('removes everything on destroy', () => {
    const graph = mount()
    const container = graph.element.parentElement
    graph.destroy()
    expect(container?.querySelector('[data-graph]')).toBeNull()
  })
})

describe('controlled selection', () => {
  function controlled(selection: ElementKeys = { nodes: [], edges: [] }) {
    const requests: ElementKeys[] = []
    const graph = mount(definition(), {
      selection,
      onSelectionChange: (next) => requests.push(next),
    })
    return { graph, requests }
  }

  it('asks for the clicked selection without applying it', () => {
    const { graph, requests } = controlled()
    const seen = record(graph, ['selectionchange'])
    const a = screenOf(graph, 'a')
    const b = screenOf(graph, 'b')
    click(graph, a.x, a.y)
    expect(requests).toEqual([{ nodes: ['a'], edges: [] }])
    expect(graph.selection.get().nodes).toEqual([])
    graph.update({ selection: { nodes: ['a'] } })
    expect(graph.selection.get().nodes).toEqual(['a'])
    click(graph, b.x, b.y, { shiftKey: true })
    expect(requests.at(-1)).toEqual({ nodes: ['a', 'b'], edges: [] })
    expect(seen).toEqual(['selectionchange'])
  })

  it('routes selection calls through the request and skips no-ops', () => {
    const { graph, requests } = controlled({ nodes: ['b'], edges: [] })
    expect(graph.store.state.selection.nodes).toEqual(['b'])
    graph.selection.set({ nodes: ['b'] })
    graph.selection.set({ edges: ['ab'] })
    graph.selection.clear()
    expect(requests).toEqual([
      { nodes: [], edges: ['ab'] },
      { nodes: [], edges: [] },
    ])
    expect(graph.selection.get().nodes).toEqual(['b'])
  })

  it('reports elements that leave the data', () => {
    const { graph, requests } = controlled({ nodes: ['a', 'c'], edges: [] })
    graph.update({ definition: definition(items.filter((item) => item.id !== 'a')) })
    dom.flushFrames()
    expect(requests).toEqual([{ nodes: ['c'], edges: [] }])
  })
})

describe('container size', () => {
  it('warns once in development when the container has no height', () => {
    dom.restore()
    dom = installDom(800, 0)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mount()
    mount()
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[0]?.[0]).toContain('0 px')
    warn.mockRestore()
  })
})
