import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createLegend } from '../legend/index'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphLayerEvent } from './events'
import { internalsOf } from './internals'
import { createGraphHost, type MountGraphOptions } from './mount-graph'

interface Place {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly over?: readonly string[]
}

const places: Place[] = [
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
  { id: 'c', x: 0, y: 100 },
  { id: 'd', x: 0, y: -100 },
]
const extra: Place[] = [{ id: 'e', x: 200, y: 200 }]
const ground: Link[] = [
  { id: 'g1', from: 'a', to: 'b' },
  { id: 'g2', from: 'b', to: 'c' },
  { id: 'g3', from: 'c', to: 'd' },
  { id: 'g4', from: 'b', to: 'e' },
]
const middle: Link[] = [{ id: 'm1', from: 'a', to: 'c', over: ['g1', 'g2'] }]
const top: Link[] = [{ id: 't1', from: 'a', to: 'd', over: ['m1', 'g3'] }]

function define() {
  const link = { source: 'from', target: 'to', supportedBy: 'over' } as const
  return defineGraph({
    marks: [
      edges(ground, { ...link, name: 'ground', layer: 'ground' }),
      edges(middle, { ...link, name: 'middle', layer: 'middle' }),
      edges(top, { ...link, name: 'top', layer: 'top' }),
      nodes(places, { x: 'x', y: 'y' }),
      nodes(extra, { x: 'x', y: 'y', layer: 'extra' }),
    ],
    states: { carrier: { halo: true }, carried: { halo: true, raise: true } },
    support: { carriers: 'carrier', carried: 'carried' },
  })
}

type Graph = ReturnType<typeof mount>

let dom: FakeDom

function mount(options: Partial<MountGraphOptions<'carrier' | 'carried'>> = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: define(), ariaLabel: 'graph', ...options },
    () => fakeRenderer(),
  )
  graph.view.set({ x: 0, y: 0, zoom: 1 })
  dom.flushFrames()
  return graph
}

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

describe('layers', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('names the layers and hides, shows and toggles them', () => {
    const graph = mount()
    const events: GraphLayerEvent[] = []
    graph.on('layerchange', (event) => events.push(event))
    expect(graph.layers.names()).toEqual(['ground', 'middle', 'top', 'extra'])
    graph.layers.hide(['top', 'middle'])
    expect(graph.layers.hidden()).toEqual(['middle', 'top'])
    expect(graph.store.get().hiddenLayers).toEqual(['middle', 'top'])
    expect(graph.layers.isHidden('top')).toBe(true)
    graph.layers.toggle('top')
    graph.layers.hide(['middle'])
    graph.layers.show()
    graph.layers.hide()
    graph.layers.set(['ground'])
    expect(events.map((event) => event.hidden)).toEqual([
      ['middle', 'top'],
      ['middle'],
      [],
      ['ground', 'middle', 'top', 'extra'],
      ['ground'],
    ])
  })

  it('neither picks nor counts the elements of a hidden layer', () => {
    const graph = mount()
    expect(graph.pick(between(graph, 'a', 'c'))?.key).toBe('m1')
    graph.layers.hide(['middle'])
    dom.flushFrames()
    expect(graph.pick(between(graph, 'a', 'c'))).toBeNull()
    expect(graph.pick(between(graph, 'b', 'c'))?.key).toBe('g2')
    graph.layers.hide(['extra'])
    dom.flushFrames()
    expect(graph.pick(screenOf(graph, 'e'))).toBeNull()
    expect(graph.pick(between(graph, 'b', 'e'))).toBeNull()
    expect(graph.paths.shortest('a', 'c')?.edges).toEqual(['m1'])
    expect(graph.paths.shortest('a', 'c', { visible: true })?.edges).toEqual(['g1', 'g2'])
    expect(graph.paths.shortest('b', 'e', { visible: true })).toBeNull()
  })

  it('drops the focus of a node whose layer hides', () => {
    const graph = mount()
    graph.focus.set({ kind: 'node', key: 'e' })
    expect(graph.focus.get()?.key).toBe('e')
    graph.layers.hide(['extra'])
    expect(graph.focus.get()).toBeNull()
  })

  it('starts from the initial hidden layers and keeps names of layers to come', () => {
    const graph = mount({ initialHiddenLayers: ['top', 'later'] })
    expect(graph.layers.hidden()).toEqual(['top', 'later'])
    expect(graph.pick(between(graph, 'a', 'd'))).toBeNull()
  })

  it('sends requests to onLayerChange in controlled mode', () => {
    const requests: GraphLayerEvent[] = []
    const graph = mount({ hiddenLayers: [], onLayerChange: (event) => requests.push(event) })
    const changes: GraphLayerEvent[] = []
    graph.on('layerchange', (event) => changes.push(event))
    graph.layers.toggle('middle')
    expect(requests).toEqual([{ hidden: ['middle'] }])
    expect(graph.layers.hidden()).toEqual([])
    graph.update({ hiddenLayers: ['middle'] })
    expect(graph.layers.hidden()).toEqual(['middle'])
    expect(changes).toEqual([{ hidden: ['middle'] }])
    graph.layers.hide(['middle'])
    expect(requests).toHaveLength(1)
  })

  it('walks the support both ways and lights it from the selection', () => {
    const graph = mount()
    expect(graph.support.carriers('t1').edges).toEqual(['m1', 'g3', 'g1', 'g2'])
    expect(graph.support.carried('g1')).toEqual({
      edges: ['m1', 't1'],
      depths: [1, 2],
      nodes: ['a', 'c', 'd'],
    })
    graph.selection.set({ edges: ['m1'] })
    expect(graph.store.get().states.carrier).toEqual({
      nodes: ['a', 'b', 'c'],
      edges: ['g1', 'g2'],
    })
    expect(graph.store.get().states.carried).toEqual({ nodes: ['a', 'd'], edges: ['t1'] })
    expect(graph.states.has('carried', { kind: 'edge', key: 't1' })).toBe(true)
    graph.selection.clear()
    expect(graph.store.get().states.carrier).toEqual({ nodes: [], edges: [] })
    expect(graph.store.get().states.carried).toEqual({ nodes: [], edges: [] })
  })

  it('gives the layers a legend section that hides and shows them', () => {
    const graph = mount()
    const legend = createLegend(graph)
    expect(legend.store.state.layers.map((layer) => layer.id)).toEqual([
      'l:ground',
      'l:middle',
      'l:top',
      'l:extra',
    ])
    expect(legend.keys('l:middle')).toEqual({ nodes: [], edges: ['m1'] })
    expect(legend.keys('l:extra')).toEqual({ nodes: ['e'], edges: [] })
    legend.toggle('l:middle')
    expect(graph.layers.hidden()).toEqual(['middle'])
    expect(legend.store.state.off).toEqual(['l:middle'])
    expect(legend.store.state.layers[1]?.off).toBe(true)
    legend.reset()
    expect(graph.layers.hidden()).toEqual([])
    expect(legend.store.state.off).toEqual([])
    legend.destroy()
  })

  it('gives the hidden layers to the sight of the overview', () => {
    const graph = mount({ initialHiddenLayers: ['middle'] })
    const internals = internalsOf(graph, 'test')
    expect(internals.sight().layers?.edges[1]).toBe(1)
    graph.layers.show()
    expect(internals.sight().layers).toBeNull()
  })
})
