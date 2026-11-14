import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, groups, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { LoadingSource } from '../testing/loading-source'
import type { GraphDefinition } from '../types'
import { createGraphHost } from './mount-graph'

interface Place {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly time?: number | undefined
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const places: Place[] = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 100, y: 0 },
  { id: 'c', x: 0, y: 100 },
]

const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
]

let dom: FakeDom

function mount(definition: GraphDefinition) {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(container, { definition, ariaLabel: 'graph' }, () => fakeRenderer())
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

describe('count without a frame', () => {
  it('follows a live source', () => {
    const source = new LoadingSource<Place>(null)
    const graph = mount(
      defineGraph({
        marks: [nodes(source, { x: 'x', y: 'y' }), edges(links, { source: 'from', target: 'to' })],
      }),
    )
    expect(graph.count().nodes).toBe(0)
    source.add({ id: 'a', x: 0, y: 0 })
    expect(graph.count().nodes).toBe(1)
    source.add({ id: 'b', x: 0, y: 0 })
    expect(graph.count()).toMatchObject({ nodes: 2, edges: 1, shown: { nodes: 2, edges: 1 } })
  })

  it('reads the new definition with a state that hides', () => {
    const base = { x: 'x', y: 'y' } as const
    const graph = mount(
      defineGraph({
        marks: [nodes(places, base), edges(links, { source: 'from', target: 'to' })],
        states: { off: { hide: true } },
      }),
    )
    graph.states.set('off', { nodes: ['a'] })
    expect(graph.count().shown.nodes).toBe(2)
    graph.update({
      definition: defineGraph({
        marks: [nodes(places, base), edges(links, { source: 'from', target: 'to' })],
        states: { off: {} },
      }),
    })
    expect(graph.count().shown.nodes).toBe(3)
    graph.update({
      definition: defineGraph({
        marks: [nodes(places, base), edges(links, { source: 'from', target: 'to' })],
        states: { off: { hide: true } },
      }),
    })
    expect(graph.count().shown.nodes).toBe(2)
  })

  it('reads zoom ranges after a definition change', () => {
    const graph = mount(defineGraph({ marks: [nodes(places, { x: 'x', y: 'y', minZoom: 4 })] }))
    graph.view.set({ x: 0, y: 0, zoom: 1 })
    expect(graph.count().shown.nodes).toBe(0)
    graph.update({ definition: defineGraph({ marks: [nodes(places, { x: 'x', y: 'y' })] }) })
    expect(graph.count().shown.nodes).toBe(3)
  })

  it('reads inside event handlers', () => {
    const graph = mount(
      defineGraph({
        marks: [
          nodes(
            places.map((place) => ({ ...place, time: 10 })),
            { x: 'x', y: 'y', time: 'time', layer: 'l' },
          ),
          edges(links, { source: 'from', target: 'to' }),
        ],
        states: { off: { hide: true } },
      }),
    )
    const seen = { layer: -1, time: -1 }
    graph.on('layerchange', () => {
      seen.layer = graph.count().shown.nodes
    })
    graph.on('timechange', () => {
      seen.time = graph.count().shown.nodes
    })
    graph.layers.hide(['l'])
    expect(seen.layer).toBe(0)
    graph.layers.show(['l'])
    expect(seen.layer).toBe(3)
    graph.time.set({ start: 0, end: 5 })
    expect(seen.time).toBe(0)
  })

  it('reads issues without a frame', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const source = new LoadingSource<Place>(null)
    const graph = mount(defineGraph({ marks: [nodes(source, { x: 'x', y: 'y' })] }))
    source.add({ id: 'a', x: 0, y: 0 })
    expect(graph.issues()).toEqual([])
    graph.update({
      definition: defineGraph({
        marks: [nodes(source, { x: 'x', y: 'y' }), edges(links, { source: 'from', target: 'to' })],
      }),
    })
    expect(graph.count().pending).toBe(2)
  })

  it('reads at once after the mount, with others hidden, and after a removal', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const definition = defineGraph({
      marks: [nodes(places, { x: 'x', y: 'y' }), edges(links, { source: 'from', target: 'to' })],
      states: { only: { others: { hide: true } } },
    })
    const graph = createGraphHost(container, { definition, ariaLabel: 'graph' }, () =>
      fakeRenderer(),
    )
    expect(graph.count().shown).toEqual({ nodes: 3, edges: 2 })
    graph.states.set('only', { nodes: ['a'] })
    expect(graph.count().shown).toEqual({ nodes: 1, edges: 0 })
    graph.states.set('only', { nodes: ['a', 'b'] })
    expect(graph.count().shown).toEqual({ nodes: 2, edges: 0 })
    graph.update({
      definition: defineGraph({
        marks: [
          nodes(places.slice(0, 2), { x: 'x', y: 'y' }),
          edges(links, { source: 'from', target: 'to' }),
        ],
        states: { only: { others: { hide: true } } },
      }),
    })
    expect(graph.count().shown).toEqual({ nodes: 2, edges: 0 })
    graph.states.clear()
    expect(graph.count()).toMatchObject({ nodes: 2, edges: 1, pending: 1 })
  })

  it('reads inside handlers fired by a flush', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const source = new LoadingSource<Place>(null)
    const graph = mount(
      defineGraph({
        marks: [nodes(source, { x: 'x', y: 'y' }), edges(links, { source: 'from', target: 'to' })],
      }),
    )
    const seen: number[] = []
    graph.on('issueschange', () => {
      seen.push(graph.count().nodes)
    })
    source.add({ id: 'a', x: 0, y: 0 })
    source.add({ id: 'a', x: 1, y: 1 })
    graph.count()
    expect(seen).toEqual([])
  })

  it('reads the folded groups inside foldchange', () => {
    const sorted = places.map((place, index) => ({ ...place, kind: index < 2 ? 'k' : 'm' }))
    const source = new LoadingSource<Place & { kind: string }>(null)
    const graph = mount(
      defineGraph({
        marks: [groups(source, { by: 'kind' }), nodes(source, { x: 'x', y: 'y' })],
      }),
    )
    const seen: number[] = []
    graph.on('foldchange', () => {
      seen.push(graph.count().shown.nodes)
    })
    source.add(...sorted)
    expect(graph.count().shown.nodes).toBe(2)
    expect(seen).toEqual([2])
  })
})
