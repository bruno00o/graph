import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { exportFrame } from '../export/frame'
import { createLegend } from '../legend/index'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { takeSnapshot } from './export-source'
import { internalsOf } from './internals'
import { createGraphHost } from './mount-graph'

interface Place {
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

const places: Place[] = [
  { id: 'a', x: -100, y: 0, group: 'left' },
  { id: 'b', x: 100, y: 0, group: 'right' },
  { id: 'c', x: 0, y: 100, group: 'left' },
]
const links: Link[] = [
  { id: 'ab1', from: 'a', to: 'b' },
  { id: 'ab2', from: 'a', to: 'b' },
  { id: 'ac', from: 'a', to: 'c' },
  { id: 'bc', from: 'b', to: 'c' },
]

function define(merge = false) {
  return defineGraph({
    marks: [
      edges(links, { source: 'from', target: 'to', merge, name: 'links' }),
      nodes(places, { x: 'x', y: 'y', color: 'group', label: 'id', name: 'places' }),
    ],
    states: { off: { hide: true }, dim: { opacity: 0.2 } },
  })
}

let dom: FakeDom

function mount(merge = false) {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(container, { definition: define(merge), ariaLabel: 'graph' }, () =>
    fakeRenderer(),
  )
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

describe('hiding states', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('removes a node and its edges while it keeps its position and selection', () => {
    const graph = mount()
    graph.selection.set({ nodes: ['b'] })
    const before = graph.positions.get('b')
    expect(graph.pick(screenOf(graph, 'b'))?.key).toBe('b')
    graph.states.set('off', { nodes: ['b'] })
    dom.flushFrames()
    expect(graph.pick(screenOf(graph, 'b'))).toBeNull()
    expect(graph.pick(between(graph, 'b', 'c'))).toBeNull()
    expect(graph.pick(between(graph, 'a', 'c'))?.key).toBe('ac')
    expect(graph.positions.get('b')).toEqual(before)
    expect(graph.store.state.selection.nodes).toEqual(['b'])
    expect(graph.paths.shortest('a', 'b')?.nodes).toEqual(['a', 'b'])
    expect(graph.paths.shortest('a', 'b', { visible: true })).toBeNull()
    graph.states.clear('off')
    dom.flushFrames()
    expect(graph.pick(screenOf(graph, 'b'))?.key).toBe('b')
  })

  it('leaves the other states drawing in place', () => {
    const graph = mount()
    graph.states.set('dim', { nodes: ['b'] })
    dom.flushFrames()
    expect(graph.pick(screenOf(graph, 'b'))?.key).toBe('b')
    expect(internalsOf(graph, 'test').sight().hide).toBeNull()
  })

  it('hides an edge alone and drops the hover and focus of hidden elements', () => {
    const graph = mount()
    graph.states.set('off', { edges: ['ac'] })
    dom.flushFrames()
    expect(graph.pick(between(graph, 'a', 'c'))).toBeNull()
    expect(graph.pick(screenOf(graph, 'c'))?.key).toBe('c')
    graph.focus.set({ kind: 'node', key: 'c' })
    expect(graph.focus.get()?.key).toBe('c')
    graph.states.set('off', { nodes: ['c'] })
    dom.flushFrames()
    expect(graph.focus.get()).toBeNull()
  })

  it('hides an aggregated edge once every merged edge is hidden', () => {
    const graph = mount(true)
    const merged = graph.pick(between(graph, 'a', 'b'))
    expect(merged?.kind === 'edge' ? merged.aggregate?.count : 0).toBe(2)
    graph.states.set('off', { edges: ['ab1'] })
    dom.flushFrames()
    expect(graph.pick(between(graph, 'a', 'b'))?.kind).toBe('edge')
    graph.states.set('off', { edges: ['ab1', 'ab2'] })
    dom.flushFrames()
    expect(graph.pick(between(graph, 'a', 'b'))).toBeNull()
  })

  it('leaves hidden elements out of the frame of exports', () => {
    const graph = mount()
    const width = () => {
      const snapshot = takeSnapshot(graph)
      const source = {
        nodes: snapshot.scene.nodes,
        edges: snapshot.scene.edges,
        positions: snapshot.positions,
        view: snapshot.view,
        width: snapshot.width,
        height: snapshot.height,
        hide: snapshot.states.hide,
      }
      return exportFrame(source, { region: 'graph', zoom: 1, padding: 0 }).width
    }
    const whole = width()
    graph.states.set('off', { nodes: ['b'] })
    dom.flushFrames()
    expect(width()).toBeLessThan(whole - 50)
  })

  it('keeps the items a legend switches off listed when its state hides', () => {
    const graph = mount()
    const legend = createLegend(graph, { hidden: 'off' })
    const right = 'c:string:right'
    legend.toggle(right)
    dom.flushFrames()
    vi.runAllTimers()
    expect(graph.pick(screenOf(graph, 'b'))).toBeNull()
    const state = legend.store.state
    const items = state.color?.type === 'categories' ? state.color.items : []
    expect(items.map((item) => [item.value, item.off])).toEqual([
      ['left', false],
      ['right', true],
    ])
    expect(internalsOf(graph, 'test').sight('off').hide).toBeNull()
    legend.destroy()
  })
})
