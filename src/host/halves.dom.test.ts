import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { exportSvg } from '../export/index'
import { createLegend } from '../legend/index'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { EdgeMergeOptions, StateKindStyles, StateStyle } from '../types'
import { takeSnapshot } from './export-source'
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
  { id: 'ab1', from: 'a', to: 'b' },
  { id: 'ab2', from: 'a', to: 'b' },
  { id: 'ba1', from: 'b', to: 'a' },
  { id: 'ac', from: 'a', to: 'c' },
]

let dom: FakeDom

function mount(
  merge: EdgeMergeOptions<Link> = { directed: false, min: 1, halves: true },
  states: Readonly<Record<string, StateStyle | StateKindStyles>> = {},
) {
  const container = document.createElement('div')
  document.body.append(container)
  const definition = defineGraph({
    marks: [
      edges(links, {
        source: 'from',
        target: 'to',
        merge,
        aggregate: {
          ends: {
            source: { color: () => 'back' },
            target: { color: () => 'forth' },
          },
        },
      }),
      nodes(places, { x: 'x', y: 'y' }),
    ],
    interaction: { select: 'multiple' },
    states,
  })
  const graph = createGraphHost(container, { definition, ariaLabel: 'graph' }, () => fakeRenderer())
  graph.view.set({ x: 0, y: 0, zoom: 1 })
  dom.flushFrames()
  return graph
}

type Graph = ReturnType<typeof mount>

function along(graph: Graph, share: number) {
  const a = graph.view.toScreen(graph.positions.get('a') ?? { x: 0, y: 0 })
  const b = graph.view.toScreen(graph.positions.get('b') ?? { x: 0, y: 0 })
  return { x: Math.round(a.x + (b.x - a.x) * share), y: Math.round(a.y + (b.y - a.y) * share) }
}

function send(graph: Graph, type: string, at: { x: number; y: number }, shiftKey = false) {
  graph.element.querySelector('canvas')?.dispatchEvent(
    new PointerEvent(type, {
      clientX: at.x,
      clientY: at.y,
      button: 0,
      pointerId: 1,
      shiftKey,
      bubbles: true,
    }),
  )
}

function click(graph: Graph, share: number, shiftKey = false) {
  const at = along(graph, share)
  send(graph, 'pointerdown', at, shiftKey)
  send(graph, 'pointerup', at, shiftKey)
  dom.flushFrames()
}

function pair(graph: Graph) {
  const snapshot = takeSnapshot(graph)
  const index = snapshot.scene.edges.keys.indexOf('ab1')
  return { states: snapshot.states, index }
}

function halosOf(svg: string): string[] {
  return [...svg.matchAll(/<path d="([^"]+)" fill="none"[^>]*stroke-opacity/g)].map(
    (match) => match[1] ?? '',
  )
}

describe('halves of a merged edge', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('picks the direction of the half under the pointer', () => {
    const graph = mount()
    const forward = graph.pick(along(graph, 0.75))
    expect(forward).toMatchObject({ kind: 'edge', key: 'ab1', end: 'target', direction: 'forward' })
    const backward = graph.pick(along(graph, 0.25))
    expect(backward).toMatchObject({
      kind: 'edge',
      key: 'ba1',
      end: 'source',
      direction: 'backward',
    })
    expect(backward?.kind === 'edge' ? backward.aggregate?.count : 0).toBe(3)
    const lone = graph.pick(graph.view.toScreen({ x: -50, y: 50 }))
    expect(lone).toMatchObject({ kind: 'edge', key: 'ac' })
    expect(lone?.kind === 'edge' ? lone.direction : 'none').toBeUndefined()
  })

  it('selects the edges of one direction and adds the other with a modifier', () => {
    const graph = mount()
    click(graph, 0.75)
    expect(graph.selection.get().edges).toEqual(['ab1', 'ab2'])
    const { states, index } = pair(graph)
    expect(states.halfMask(index, 'target') & 1).toBe(1)
    expect(states.halfMask(index, 'source') & 1).toBe(0)
    expect((states.edgeMask[index] ?? 0) & 1).toBe(1)
    click(graph, 0.25, true)
    expect([...graph.selection.get().edges].sort()).toEqual(['ab1', 'ab2', 'ba1'])
    expect(states.halfMask(index, 'source') & 1).toBe(1)
    click(graph, 0.75, true)
    expect(graph.selection.get().edges).toEqual(['ba1'])
    expect(states.halfMask(index, 'target') & 1).toBe(0)
    click(graph, 0.75)
    expect(graph.selection.get().edges).toEqual(['ab1', 'ab2'])
  })

  it('hovers the half under the pointer and lists it raised', () => {
    const graph = mount()
    send(graph, 'pointermove', along(graph, 0.25))
    dom.flushFrames()
    expect(graph.store.state.hovered).toMatchObject({ key: 'ba1', direction: 'backward' })
    const { states, index } = pair(graph)
    expect(states.halfMask(index, 'source') & 2).toBe(2)
    expect(states.halfMask(index, 'target') & 2).toBe(0)
    expect(states.highlightedEdges).toContain(index)
    send(graph, 'pointermove', along(graph, 0.75))
    dom.flushFrames()
    expect(graph.store.state.hovered).toMatchObject({ key: 'ab1', direction: 'forward' })
    expect(states.halfMask(index, 'source') & 2).toBe(0)
    expect(states.halfMask(index, 'target') & 2).toBe(2)
  })

  it('hides a half whose edges are all hidden, and the half outside a state that hides others', () => {
    const graph = mount(undefined, {
      off: { hide: true },
      only: { edges: { others: { hide: true } } },
    })
    graph.states.set('off', { edges: ['ba1'] })
    dom.flushFrames()
    expect(graph.pick(along(graph, 0.25))).toBeNull()
    expect(graph.pick(along(graph, 0.75))).toMatchObject({ direction: 'forward' })
    graph.states.clear('off')
    graph.states.set('only', { edges: ['ab2'] })
    dom.flushFrames()
    expect(graph.pick(along(graph, 0.25))).toBeNull()
    expect(graph.pick(along(graph, 0.75))).toMatchObject({ direction: 'forward' })
  })

  it('keeps the whole edge without halves', () => {
    const graph = mount({ directed: false, min: 1 })
    const hit = graph.pick(along(graph, 0.25))
    expect(hit?.kind === 'edge' ? hit.direction : 'none').toBeUndefined()
    click(graph, 0.25)
    expect([...graph.selection.get().edges].sort()).toEqual(['ab1', 'ab2', 'ba1'])
    const { states, index } = pair(graph)
    expect(states.edgeHalved[index] ?? 0).toBe(0)
    expect(states.halvesCount).toBe(0)
  })

  it('stays whole once one direction is gone', () => {
    const graph = mount()
    graph.update({
      definition: defineGraph({
        marks: [
          edges(
            links.filter((link) => link.id !== 'ba1'),
            { source: 'from', target: 'to', merge: { directed: false, min: 1, halves: true } },
          ),
          nodes(places, { x: 'x', y: 'y' }),
        ],
        interaction: { select: 'multiple' },
      }),
    })
    dom.flushFrames()
    const hit = graph.pick(along(graph, 0.25))
    expect(hit?.kind === 'edge' ? hit.direction : 'none').toBeUndefined()
    expect(pair(graph).states.halvesCount).toBe(0)
  })

  it('lights the edges of one direction from the color of its end in the legend', () => {
    const graph = mount()
    const legend = createLegend(graph)
    expect(legend.keys('c:string:forth').edges).toEqual(['ab1', 'ab2', 'ac'])
    expect(legend.keys('c:string:back').edges).toEqual(['ba1', 'ac'])
  })

  it('exports each half with the states of its own edges', async () => {
    const graph = mount()
    click(graph, 0.75)
    const halves = halosOf(await exportSvg(graph))
    expect(halves).toHaveLength(3)
    const whole = mount({ directed: false, min: 1 })
    click(whole, 0.75)
    const wholeHalos = halosOf(await exportSvg(whole))
    expect(wholeHalos).toHaveLength(3)
    const startOf = (path: string) => Number(path.slice(1).split(' ')[0])
    expect(startOf(halves[0] ?? '')).toBeGreaterThan(startOf(wholeHalos[0] ?? '') + 100)
  })
})
