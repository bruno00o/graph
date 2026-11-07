import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stateRow } from '../core/state-buffers'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { StateKindStyles, StateStyle } from '../types'
import { takeSnapshot } from './export-source'
import { internalsOf } from './internals'
import { createGraphHost } from './mount-graph'

interface Place {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const places: Place[] = [
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
  { id: 'c', x: 0, y: 100 },
]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'ac', from: 'a', to: 'c' },
  { id: 'bc', from: 'b', to: 'c' },
]

type Styles = Readonly<Record<string, StateStyle | StateKindStyles>>

let dom: FakeDom

function mount(states: Styles) {
  const container = document.createElement('div')
  document.body.append(container)
  const definition = defineGraph({
    marks: [
      edges(links, { source: 'from', target: 'to' }),
      nodes(places, { x: 'x', y: 'y', label: 'id' }),
    ],
    states,
  })
  const graph = createGraphHost(container, { definition, ariaLabel: 'graph' }, () => fakeRenderer())
  graph.view.set({ x: 0, y: 0, zoom: 1 })
  dom.flushFrames()
  return graph
}

type Graph = ReturnType<typeof mount>

function screenOf(graph: Graph, key: string) {
  const position = graph.positions.get(key)
  if (!position) throw new Error(`no position for ${key}`)
  return graph.view.toScreen(position)
}

function between(graph: Graph, from: string, to: string) {
  const a = screenOf(graph, from)
  const b = screenOf(graph, to)
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function hover(graph: Graph, key: string) {
  const at = screenOf(graph, key)
  graph.element.querySelector('canvas')?.dispatchEvent(
    new PointerEvent('pointermove', {
      clientX: at.x,
      clientY: at.y,
      pointerId: 1,
      bubbles: true,
    }),
  )
  dom.flushFrames()
}

describe('the others of a state', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('hides the elements outside a state only while it has members', () => {
    const graph = mount({ only: { others: { hide: true } } })
    expect(graph.pick(screenOf(graph, 'c'))?.key).toBe('c')
    graph.states.set('only', { nodes: ['a', 'b'] })
    dom.flushFrames()
    expect(graph.pick(screenOf(graph, 'a'))?.key).toBe('a')
    expect(graph.pick(screenOf(graph, 'c'))).toBeNull()
    expect(graph.pick(between(graph, 'a', 'c'))).toBeNull()
    expect(graph.pick(between(graph, 'a', 'b'))).toBeNull()
    graph.states.clear('only')
    dom.flushFrames()
    expect(graph.pick(screenOf(graph, 'c'))?.key).toBe('c')
    expect(internalsOf(graph, 'test').sight().hide).toBeNull()
  })

  it('lets a state of edges hide the nodes outside it', () => {
    const graph = mount({ route: { others: { hide: true } } })
    graph.states.set('route', { edges: ['ab'] })
    dom.flushFrames()
    expect(graph.pick(screenOf(graph, 'c'))).toBeNull()
    expect(graph.pick(screenOf(graph, 'a'))).toBeNull()
    expect(internalsOf(graph, 'test').sight('route').hide).toBeNull()
  })

  it('dims the others of a hovered element without writing their masks', () => {
    const graph = mount({ hovered: { others: { opacity: 0.3 } } })
    const states = takeSnapshot(graph).states
    states.nodeDirty.take()
    states.edgeDirty.take()
    const version = states.tableVersion
    hover(graph, 'c')
    expect(graph.store.state.hovered?.key).toBe('c')
    expect(states.others('nodes')).toBe(0b10)
    expect(states.others('edges')).toBe(0b10)
    expect(states.tableVersion).toBeGreaterThan(version)
    expect(states.nodeDirty.take()).toEqual([2, 2])
    expect(states.edgeDirty.take()).toBeNull()
    const row = stateRow('nodes', 1, false) * 4
    expect(states.numbers[row]).toBeCloseTo(0.3, 5)
    expect(states.paint[stateRow('nodes', 1, true) * 4 + 1]).not.toBe(0xffffffff)
  })

  it('styles nodes and edges apart and merges the default of a built-in state', () => {
    const graph = mount({
      path: { nodes: { fill: '#ff0000' }, edges: { stroke: '#00ff00', strokeWidth: 3 } },
      selected: { edges: { stroke: '#0000ff' } },
    })
    const { states, scene } = takeSnapshot(graph)
    const bit = 3
    expect(states.paint[stateRow('nodes', bit, true) * 4]).toBe(scene.palette.id('#ff0000'))
    expect(states.paint[stateRow('nodes', bit, true) * 4 + 1]).toBe(0xffffffff)
    expect(states.paint[stateRow('edges', bit, true) * 4 + 1]).toBe(scene.palette.id('#00ff00'))
    expect(states.numbers[stateRow('edges', bit, true) * 4 + 1]).toBe(3)
    expect(states.paint[stateRow('edges', 0, true) * 4 + 1]).toBe(scene.palette.id('#0000ff'))
    expect(states.paint[stateRow('nodes', 0, true) * 4 + 1]).not.toBe(scene.palette.id('#0000ff'))
    expect(states.nodeRaise & 1).toBe(1)
    expect(states.edgeRaise & 1).toBe(1)
  })

  it('gives the others of each kind their own look', () => {
    const graph = mount({
      near: { nodes: { others: { opacity: 0.2 } }, edges: { others: { opacity: 0.5 } } },
    })
    const { states } = takeSnapshot(graph)
    expect(states.numbers[stateRow('nodes', 3, false) * 4]).toBeCloseTo(0.2, 5)
    expect(states.numbers[stateRow('edges', 3, false) * 4]).toBeCloseTo(0.5, 5)
  })

  it('reads the members of a state', () => {
    const graph = mount({ near: { opacity: 0.5 } })
    expect(graph.states.get('near')).toEqual({ nodes: [], edges: [] })
    graph.states.set('near', { nodes: ['a'], edges: ['ab'] })
    expect(graph.states.get('near')).toEqual({ nodes: ['a'], edges: ['ab'] })
    expect(Object.values(graph.store.state.states)).toContain(graph.states.get('near'))
    expect(() => graph.states.get('selected' as 'near')).toThrow()
  })

  it('lists the members whose label shows always', () => {
    const graph = mount({ tagged: { label: 'always' } })
    graph.states.set('tagged', { nodes: ['b'], edges: ['bc'] })
    dom.flushFrames()
    const { states } = takeSnapshot(graph)
    expect(states.alwaysNodes).toEqual([1])
    expect(states.alwaysEdges).toEqual([2])
    graph.states.clear('tagged')
    dom.flushFrames()
    expect(states.alwaysNodes).toEqual([])
  })
})
