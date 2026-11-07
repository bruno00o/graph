import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphIssue } from '../core/issues'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphDefinition } from '../types'
import { createGraphHost } from './mount-graph'

interface Place {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly group?: string | undefined
  readonly time?: number | undefined
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly over?: readonly string[] | undefined
}

const places: Place[] = [
  { id: 'a', x: -100, y: 0, group: 'g' },
  { id: 'b', x: 100, y: 0, group: 'g' },
  { id: 'c', x: 0, y: 100 },
  { id: 'g', x: 0, y: -100 },
]

const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
  { id: 'cd', from: 'c', to: 'd' },
]

function define(items: readonly Place[] = places, lines: readonly Link[] = links) {
  return defineGraph({
    marks: [
      edges(lines, { source: 'from', target: 'to', supportedBy: 'over' }),
      nodes(items, { x: 'x', y: 'y', parent: 'group', label: 'id' }),
    ],
    states: { off: { hide: true } },
  })
}

let dom: FakeDom

function mount(definition: GraphDefinition = define()) {
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

describe('issues', () => {
  it('lists the problems present, and drops them once fixed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mount()
    expect(graph.issues()).toEqual([])
    const changes: (readonly GraphIssue[])[] = []
    graph.on('issueschange', ({ issues }) => changes.push(issues))
    graph.update({
      definition: define(
        [...places, { id: 'a', x: 5, y: 5 }, { id: 'h', x: 0, y: 0, group: 'z' }],
        [...links, { id: 'ab', from: 'b', to: 'a' }, { id: 'up', from: 'a', to: 'c', over: ['x'] }],
      ),
    })
    const issues = graph.issues()
    expect(issues).toEqual([
      { type: 'duplicate-key', kind: 'nodes', key: 'a' },
      { type: 'duplicate-key', kind: 'edges', key: 'ab' },
      { type: 'missing-parent', kind: 'nodes', key: 'h', parent: 'z' },
      { type: 'missing-carrier', kind: 'edges', key: 'up', carrier: 'x' },
    ])
    expect(changes).toEqual([issues])
    expect(graph.issues()).toBe(issues)
    graph.update({ definition: define([...places, { id: 'a', x: 6, y: 6 }]) })
    expect(graph.issues()).toEqual([{ type: 'duplicate-key', kind: 'nodes', key: 'a' }])
    expect(graph.issues()[0]).toBe(issues[0])
    expect(changes).toHaveLength(2)
    graph.update({ definition: define([...places, { id: 'a', x: 7, y: 7 }]) })
    dom.flushFrames()
    expect(changes).toHaveLength(2)
    graph.update({ definition: define() })
    dom.flushFrames()
    expect(graph.issues()).toEqual([])
    expect(changes.at(-1)).toEqual([])
    expect(changes).toHaveLength(3)
  })

  it('warns once per flush in development, by type', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mount()
    const copies = ['a', 'b', 'c'].map((id) => ({ id, x: 0, y: 0 }))
    graph.update({
      definition: define([...places, ...copies, { id: 'h', x: 0, y: 0, group: 'z' }]),
    })
    dom.flushFrames()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toBe(
      'graph: 4 new data issues (3 duplicate-key, 1 missing-parent); graph.issues() lists them',
    )
    graph.update({ definition: define([...places, ...copies]) })
    dom.flushFrames()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('keeps a cycle until it is broken', () => {
    const graph = mount(
      define([
        { id: 'a', x: 0, y: 0, group: 'b' },
        { id: 'b', x: 0, y: 0, group: 'a' },
      ]),
    )
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(graph.issues()).toEqual([{ type: 'parent-cycle', kind: 'nodes', key: 'a', parent: 'b' }])
    graph.update({
      definition: define([
        { id: 'a', x: 0, y: 0, group: 'b' },
        { id: 'b', x: 0, y: 0 },
      ]),
    })
    expect(graph.issues()).toEqual([])
  })
})

describe('count', () => {
  it('counts the data, the waiting edges and what is drawn', () => {
    const graph = mount()
    const count = graph.count()
    expect(count).toEqual({ nodes: 4, edges: 2, pending: 1, shown: { nodes: 4, edges: 2 } })
    expect(graph.count()).toBe(count)
    graph.view.set({ x: 10, y: 0, zoom: 2 })
    expect(graph.count()).toBe(count)
    graph.groups.fold(['g'])
    expect(graph.count()).toEqual({
      nodes: 4,
      edges: 2,
      pending: 1,
      shown: { nodes: 2, edges: 1 },
    })
    graph.groups.unfold()
    graph.states.set('off', { nodes: ['c'] })
    expect(graph.count().shown).toEqual({ nodes: 3, edges: 1 })
    graph.states.set('off', { edges: ['ab'] })
    expect(graph.count().shown).toEqual({ nodes: 4, edges: 1 })
    graph.states.clear()
    graph.update({ definition: define(places, [...links, { id: 'gd', from: 'g', to: 'd' }]) })
    expect(graph.count()).toEqual({ nodes: 4, edges: 2, pending: 2, shown: { nodes: 4, edges: 2 } })
  })

  it('honors zoom ranges, the time window and hidden layers', () => {
    const timed: Place[] = [
      { id: 'a', x: 0, y: 0, time: 10 },
      { id: 'b', x: 10, y: 0, time: 20 },
      { id: 'c', x: 0, y: 10 },
    ]
    const graph = mount(
      defineGraph({
        marks: [
          edges(links, { source: 'from', target: 'to', layer: 'lines' }),
          nodes(timed, {
            x: 'x',
            y: 'y',
            time: 'time',
            minZoom: (place) => (place.id === 'c' ? 4 : 0),
          }),
        ],
      }),
    )
    graph.view.set({ x: 0, y: 0, zoom: 1 })
    expect(graph.count().shown).toEqual({ nodes: 2, edges: 1 })
    graph.view.set({ x: 0, y: 0, zoom: 8 })
    expect(graph.count().shown).toEqual({ nodes: 3, edges: 2 })
    graph.time.set({ start: 0, end: 15 })
    expect(graph.count().shown).toEqual({ nodes: 2, edges: 0 })
    graph.time.set(null)
    graph.layers.hide(['lines'])
    expect(graph.count().shown).toEqual({ nodes: 3, edges: 0 })
  })
})

describe('positions.snapshot', () => {
  it('reads every node, where glides end unless asked otherwise', () => {
    const graph = mount()
    graph.view.set({ x: 0, y: 0, zoom: 1 })
    const snapshot = graph.positions.snapshot()
    expect([...snapshot.keys()].sort()).toEqual(['a', 'b', 'c', 'g'])
    expect(snapshot.get('c')).toEqual({ x: 0, y: 100 })
    graph.positions.set([['c', { x: 300, y: 100 }]], { duration: 500 })
    expect(graph.positions.snapshot().get('c')).toEqual({ x: 300, y: 100 })
    expect(graph.positions.snapshot({ settled: false }).get('c')).toEqual({ x: 0, y: 100 })
    dom.flushFrames()
    graph.groups.fold(['g'])
    graph.positions.set(snapshot)
    expect(graph.positions.get('c')).toEqual({ x: 0, y: 100 })
    expect(graph.positions.snapshot().get('a')).toEqual(snapshot.get('a'))
  })
})
