import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { EdgeMergeOptions } from '../types'
import { createGraphHost } from './mount-graph'

interface Place {
  readonly id: string
  readonly parent: string | null
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly kind: string
}

const places: Place[] = [
  { id: 'g', parent: null, x: -100, y: 0 },
  { id: 'a', parent: 'g', x: -100, y: -20 },
  { id: 'c', parent: 'g', x: -100, y: 20 },
  { id: 'b', parent: null, x: 100, y: 0 },
  { id: 'd', parent: null, x: 100, y: 100 },
]
const links: Link[] = [
  { id: 'ab1', from: 'a', to: 'b', kind: 'x' },
  { id: 'ab2', from: 'a', to: 'b', kind: 'y' },
  { id: 'cb1', from: 'c', to: 'b', kind: 'x' },
  { id: 'bd1', from: 'b', to: 'd', kind: 'x' },
  { id: 'bd2', from: 'b', to: 'd', kind: 'y' },
]

let dom: FakeDom

function definitionOf(merge: EdgeMergeOptions<Link>) {
  return defineGraph({
    marks: [
      edges(links, {
        source: 'from',
        target: 'to',
        merge,
        aggregate: { label: (aggregate) => `${aggregate.value ?? 'all'}:${aggregate.count}` },
      }),
      nodes(places, { parent: 'parent', x: 'x', y: 'y' }),
    ],
    interaction: { select: 'multiple' },
  })
}

function mount(merge: EdgeMergeOptions<Link>, folded: string[] = []) {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definitionOf(merge), ariaLabel: 'graph', initialFolded: folded },
    () => fakeRenderer(),
  )
  graph.view.set({ x: 0, y: 0, zoom: 1 })
  dom.flushFrames()
  return graph
}

type Graph = ReturnType<typeof mount>

function click(graph: Graph, at: { x: number; y: number }) {
  for (const type of ['pointerdown', 'pointerup']) {
    graph.element.querySelector('canvas')?.dispatchEvent(
      new PointerEvent(type, {
        clientX: at.x,
        clientY: at.y,
        button: 0,
        pointerId: 1,
        bubbles: true,
      }),
    )
  }
  dom.flushFrames()
}

function middle(graph: Graph, from: string, to: string) {
  const a = graph.positions.get(from) ?? { x: 0, y: 0 }
  const b = graph.positions.get(to) ?? { x: 0, y: 0 }
  return graph.view.toScreen({ x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) })
}

describe('edges toward a folded group merged into one', () => {
  beforeEach(() => {
    dom = installDom()
  })

  afterEach(() => {
    dom.restore()
  })

  it('draws one line toward the folded group and one per value between plain nodes', () => {
    const graph = mount({ by: 'kind', foldedAsOne: true })
    expect(graph.count().shown.edges).toBe(5)
    graph.groups.fold(['g'])
    dom.flushFrames()
    expect(graph.count().shown.edges).toBe(3)
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(graph.count().shown.edges).toBe(5)
  })

  it('keeps one line per value toward the folded group without the option', () => {
    const graph = mount({ by: 'kind' })
    graph.groups.fold(['g'])
    dom.flushFrames()
    expect(graph.count().shown.edges).toBe(4)
  })

  it('starts folded and picks an aggregated edge without a value', () => {
    const graph = mount({ by: 'kind', foldedAsOne: true }, ['g'])
    const hit = graph.pick(middle(graph, 'g', 'b'))
    expect(hit?.kind).toBe('edge')
    if (hit?.kind !== 'edge') return
    expect(hit.aggregate?.count).toBe(3)
    expect(hit.aggregate?.value).toBeUndefined()
    expect(hit.aggregate?.keys).toEqual(['ab1', 'ab2', 'cb1'])
  })

  it('selects every member of the merged edge and keeps the selection when it unfolds', () => {
    const graph = mount({ by: 'kind', foldedAsOne: true }, ['g'])
    click(graph, middle(graph, 'g', 'b'))
    expect([...graph.selection.get().edges].sort()).toEqual(['ab1', 'ab2', 'cb1'])
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect([...graph.selection.get().edges].sort()).toEqual(['ab1', 'ab2', 'cb1'])
    expect(graph.count().shown.edges).toBe(5)
  })

  it('changes at runtime with the option', () => {
    const graph = mount({ by: 'kind' }, ['g'])
    expect(graph.count().shown.edges).toBe(4)
    graph.update({ definition: definitionOf({ by: 'kind', foldedAsOne: true }) })
    dom.flushFrames()
    expect(graph.count().shown.edges).toBe(3)
  })
})
