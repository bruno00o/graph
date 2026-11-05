import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphDefinition } from '../types'
import type { GraphEventName } from './events'
import { createGraphHost, type GraphInstance } from './mount-graph'

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

function mount(graphDefinition = definition()): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: graphDefinition, ariaLabel: 'graphe' },
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
    expect(graph.element.getAttribute('role')).toBe('img')
    expect(graph.element.getAttribute('aria-label')).toBe('graphe')
    const { view, width, height } = graph.store.get()
    expect([width, height]).toEqual([800, 600])
    expect(view.x).toBeCloseTo(0)
    expect(view.y).toBeCloseTo(50)
    expect(graph.store.get().positionsVersion).toBeGreaterThan(0)
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
