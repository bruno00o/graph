import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { mountMapGraph } from '../map'
import { nodes } from '../marks'
import { shapes } from '../shapes'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
import type { ColorScale, Mark, ShapeGeometry } from '../types'
import { createLegend, mountLegend } from './index'

interface Zone {
  readonly id: string
  readonly geometry: ShapeGeometry
  readonly region: string
  readonly level: number
}

interface Item {
  readonly id: string
  readonly region: string
  readonly x: number
  readonly y: number
}

const square = (x: number): ShapeGeometry => ({ x, y: 0, width: 10, height: 10 })
const route = (x: number): ShapeGeometry => ({
  points: [
    [x, 0],
    [x + 10, 10],
  ],
})

const zones: Zone[] = [
  { id: 'z1', geometry: square(0), region: 'north', level: 1 },
  { id: 'z2', geometry: square(20), region: 'south', level: 3 },
  { id: 'z3', geometry: square(40), region: 'north', level: 5 },
]
const routes: Zone[] = [{ id: 'r1', geometry: route(0), region: 'south', level: 2 }]
const items: Item[] = [
  { id: 'a', region: 'north', x: 0, y: 0 },
  { id: 'b', region: 'east', x: 10, y: 0 },
]

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

let dom: FakeDom

function mount<M extends Mark>(marks: readonly M[], color?: ColorScale) {
  const container = document.createElement('div')
  document.body.append(container)
  const definition = defineGraph({
    marks,
    scales: color ? { color } : {},
    states: { match: {}, faded: { hide: true } },
  })
  const graph = createGraphHost(container, { definition, ariaLabel: 'graph' }, () => fakeRenderer())
  dom.flushFrames()
  return graph as unknown as GraphInstance<'match' | 'faded', M>
}

describe('legend of shapes', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('counts shapes under the categories they share with nodes', () => {
    const graph = mount([
      shapes(zones, { color: 'region', name: 'zones' }),
      nodes(items, { color: 'region', x: 'x', y: 'y' }),
    ])
    const legend = createLegend(graph)
    const color = legend.store.state.color
    const categories = color?.type === 'categories' ? color.items : []
    expect(categories.map((item) => [item.value, item.nodes, item.edges, item.shapes])).toEqual([
      ['north', 1, 0, 2],
      ['east', 1, 0, 0],
      ['south', 0, 0, 1],
    ])
    expect(legend.keys('c:string:north')).toEqual({ nodes: ['a'], edges: [], shapes: ['z1', 'z3'] })
  })

  it('leaves shape counts out of a graph without shapes', () => {
    const graph = mount([nodes(items, { color: 'region', x: 'x', y: 'y' })])
    const legend = createLegend(graph)
    const color = legend.store.state.color
    const first = color?.type === 'categories' ? color.items[0] : undefined
    expect(first && 'shapes' in first).toBe(false)
    expect(legend.keys('c:string:north')).toEqual({ nodes: ['a'], edges: [] })
  })

  it('reads a ramp over shape values', () => {
    const graph = mount([shapes(zones, { color: 'level' })], {
      type: 'sequential',
      range: ['white', 'black'],
    })
    const legend = createLegend(graph)
    expect(legend.store.state.color).toEqual({
      type: 'ramp',
      domain: [1, 5],
      stops: ['white', 'black'],
    })
  })

  it('reads the own scale of a shape mark apart', () => {
    const graph = mount([
      shapes(zones, {
        color: 'region',
        name: 'zones',
        scales: { color: { range: ['red', 'blue'] } },
      }),
      nodes(items, { color: 'region', x: 'x', y: 'y' }),
    ])
    const legend = createLegend(graph, { hidden: 'faded' })
    const state = legend.store.state
    const own = state.marks[0]
    expect(own?.id).toBe('s0')
    expect(own?.kind).toBe('shapes')
    expect(own?.mark).toBe('zones')
    const categories = own?.color?.type === 'categories' ? own.color.items : []
    expect(categories.map((item) => [item.id, item.color, item.shapes])).toEqual([
      ['c:s0:string:north', 'red', 2],
      ['c:s0:string:south', 'blue', 1],
    ])
    legend.toggle('c:s0:string:north')
    expect(graph.store.state.states.faded).toEqual({ nodes: [], edges: [], shapes: ['z1', 'z3'] })
    legend.reset()
    expect(graph.store.state.states.faded).toEqual({ nodes: [], edges: [], shapes: [] })
  })

  it('gives each shape mark its looks, and filters them', () => {
    const graph = mount([
      shapes(zones, { name: 'zones', fill: 'gold', stroke: 'black', dash: 'dashed' }),
      shapes(routes, { name: 'routes', color: 'region' }),
    ])
    const legend = createLegend(graph, { hidden: 'faded', highlight: 'match' })
    const looks = legend.store.state.looks
    expect(looks).toEqual([
      {
        id: 's:0:area:1',
        kind: 'shapes',
        mark: 'zones',
        geometry: 'area',
        dash: 'dashed',
        fill: 'gold',
        stroke: 'black',
        count: 3,
        off: false,
      },
      {
        id: 's:1:line:0',
        kind: 'shapes',
        mark: 'routes',
        geometry: 'line',
        dash: 'solid',
        fill: null,
        stroke: 'var(--graph-cat-1)',
        count: 1,
        off: false,
      },
    ])
    legend.hover('s:1:line:0')
    expect(graph.store.state.states.match).toEqual({ nodes: [], edges: [], shapes: ['r1'] })
    legend.only('s:1:line:0')
    expect(legend.store.state.off).toEqual(['s:0:area:1'])
    expect(graph.store.state.states.faded).toEqual({
      nodes: [],
      edges: [],
      shapes: ['z1', 'z2', 'z3'],
    })
    expect(graph.count().shown.shapes).toBe(1)
  })

  it('stands for varied colors with the default tokens', () => {
    const graph = mount([
      shapes(zones, { name: 'zones', color: 'region' }),
      shapes(routes, { name: 'routes', stroke: null }),
    ])
    const legend = createLegend(graph)
    const [area, line] = legend.store.state.looks
    expect(area?.kind === 'shapes' && [area.fill, area.stroke]).toEqual([
      'var(--graph-shape-fill)',
      'var(--graph-shape-stroke)',
    ])
    expect(line?.kind === 'shapes' && [line.fill, line.stroke]).toEqual([null, null])
  })

  it('hides arriving shapes of a switched off category', () => {
    const graph = mount([shapes(zones, { color: 'region' })])
    const legend = createLegend(graph, { hidden: 'faded' })
    legend.toggle('c:string:south')
    expect(graph.store.state.states.faded).toEqual({ nodes: [], edges: [], shapes: ['z2'] })
    graph.update({
      definition: defineGraph({
        marks: [
          shapes([...zones, { id: 'z4', geometry: square(60), region: 'south', level: 0 }], {
            color: 'region',
          }),
        ],
        states: { match: {}, faded: { hide: true } },
      }),
    })
    dom.flushFrames()
    expect(graph.store.state.states.faded.shapes).toEqual(['z2', 'z4'])
  })

  it('draws a swatch for each shape look', () => {
    const graph = mount([
      shapes(zones, { name: 'zones', fill: 'gold', dash: 'dotted' }),
      shapes(routes, { name: 'routes', stroke: 'navy' }),
    ])
    const view = mountLegend(createLegend(graph))
    const buttons = [...view.element.querySelectorAll('[data-item^="s:"]')]
    expect(buttons.map((button) => [button.getAttribute('data-item'), button.textContent])).toEqual(
      [
        ['s:0:area:2', 'zones'],
        ['s:1:line:0', 'routes'],
      ],
    )
    const swatch = buttons[0]?.querySelector('span span') as HTMLElement | null
    expect(swatch?.style.background).toBe('gold')
    expect(swatch?.style.border).toContain('dotted')
  })

  it('reads and filters shapes on a map', () => {
    const { map, render } = fakeMap()
    const places = [
      {
        id: 'p1',
        region: 'north',
        geometry: { center: { longitude: 2, latitude: 48 }, radius: 10_000 },
      },
      {
        id: 'p2',
        region: 'south',
        geometry: { center: { longitude: 13, latitude: 52 }, radius: 10_000 },
      },
    ]
    const graph = mountMapGraph(map, {
      definition: defineGraph({
        marks: [shapes(places, { color: 'region' })],
        states: { faded: { hide: true } },
      }),
      ariaLabel: 'map',
    })
    render()
    const legend = createLegend(graph, { hidden: 'faded' })
    const color = legend.store.state.color
    const categories = color?.type === 'categories' ? color.items : []
    expect(categories.map((item) => [item.value, item.shapes])).toEqual([
      ['north', 1],
      ['south', 1],
    ])
    legend.toggle('c:string:north')
    render()
    expect(graph.store.state.states.faded.shapes).toEqual(['p1'])
    expect(graph.count().shown.shapes).toBe(1)
    legend.destroy()
    graph.destroy()
  })
})
