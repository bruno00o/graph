import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphDefinition } from '../types'
import { pair as pairOf, ways as waysOf } from '../ways'
import { createGraphHost, type GraphInstance, type MountGraphOptions } from './mount-graph'

interface Item {
  readonly id: string
  readonly parent?: string
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [
  { id: 'g' },
  { id: 'a', parent: 'g' },
  { id: 'b', parent: 'g' },
  { id: 'c' },
  { id: 'e1' },
  { id: 'e2' },
]

const links: Link[] = [
  { id: 'ac', from: 'a', to: 'c' },
  { id: 'bc', from: 'b', to: 'c' },
  { id: 'ce1', from: 'c', to: 'e1' },
  { id: 'ce2', from: 'c', to: 'e2' },
]

function definition(): GraphDefinition {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(items, { parent: 'parent' }),
    ],
    transitions: { layout: 0 },
  })
}

let dom: FakeDom

function mount(options: Partial<MountGraphOptions> = {}): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definition(), ariaLabel: 'graphe', ...options },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  return graph
}

describe('ways on a mounted graph', () => {
  beforeEach(() => {
    dom = installDom()
  })
  afterEach(() => {
    dom.restore()
  })

  it('runs on the data, or on the graph as drawn with visible', () => {
    const graph = mount({ initialFolded: ['g'] })
    const onData = waysOf(graph, { exits: ['e1', 'e2'] })
    expect(onData.exits).toEqual(['e1', 'e2'])
    expect(onData.two).toEqual(['c'])
    expect(onData.one).toEqual([
      { key: 'a', through: 'c' },
      { key: 'b', through: 'c' },
    ])
    const drawn = waysOf(graph, { exits: ['e1', 'e2'], visible: true })
    expect(drawn.exits).toEqual(['e1', 'e2'])
    expect(drawn.two).toEqual(['c'])
    expect(drawn.one).toEqual([{ key: 'g', through: 'c' }])
    expect(drawn.none).toEqual([])
    expect(pairOf(graph, 'c', { exits: ['e1', 'e2'], visible: true })?.map((p) => p.nodes)).toEqual(
      [
        ['c', 'e1'],
        ['c', 'e2'],
      ],
    )
    expect(pairOf(graph, 'g', { exits: ['e1', 'e2'], visible: true })).toBeNull()
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(waysOf(graph, { exits: ['e1', 'e2'], visible: true }).one).toEqual([
      { key: 'a', through: 'c' },
      { key: 'b', through: 'c' },
    ])
    graph.destroy()
  })

  it('returns frozen empties and null after destroy', () => {
    const graph = mount()
    graph.destroy()
    const ways = waysOf(graph, { exits: ['e1'] })
    expect(ways).toEqual({
      exits: [],
      two: [],
      one: [],
      none: [],
      chains: [],
      weak: { nodes: [], edges: [] },
    })
    expect(Object.isFrozen(ways)).toBe(true)
    expect(Object.isFrozen(ways.weak)).toBe(true)
    expect(pairOf(graph, 'c', { exits: ['e1'] })).toBeNull()
  })
})
