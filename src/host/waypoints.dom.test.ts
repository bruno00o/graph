import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { WaypointInput } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'
import type { RenderInput } from './renderer'

interface Item {
  readonly id: string
  readonly x?: number
  readonly y?: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly via?: readonly WaypointInput[]
}

const items: Item[] = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 400, y: 0 },
]

let dom: FakeDom
let input: RenderInput | null = null

function mount(links: readonly Link[]): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [
          edges<Link>(links, { source: 'from', target: 'to', waypoints: 'via', width: 2 }),
          nodes<Item>(items, { x: 'x', y: 'y', size: 10 }),
        ],
      }),
      ariaLabel: 'graphe',
      initialView: { x: 200, y: 100, zoom: 1 },
    },
    () => ({
      ...fakeRenderer(),
      sync: (next) => {
        input = next
      },
    }),
  )
  dom.flushFrames()
  return graph
}

function screenOf(graph: GraphInstance, x: number, y: number) {
  return graph.view.toScreen({ x, y })
}

beforeEach(() => {
  dom = installDom()
  input = null
})

afterEach(() => {
  dom.restore()
})

describe('waypoint edges in the host', () => {
  it('picks the edge along its waypoints and not along its chord', () => {
    const graph = mount([{ id: 'ab', from: 'a', to: 'b', via: [[200, 200]] }])
    expect(graph.pick(screenOf(graph, 100, 100))?.key).toBe('ab')
    expect(graph.pick(screenOf(graph, 200, 200))?.key).toBe('ab')
    expect(graph.pick(screenOf(graph, 200, 0))).toBeNull()
    expect(input?.bundles?.isFixed(0)).toBe(true)
  })

  it('keeps its ends on the nodes as they move', () => {
    const graph = mount([{ id: 'ab', from: 'a', to: 'b', via: [[200, 200]] }])
    graph.positions.set([['b', { x: 400, y: 400 }]])
    dom.flushFrames()
    expect(graph.pick(screenOf(graph, 300, 300))?.key).toBe('ab')
    expect(graph.pick(screenOf(graph, 300, 100))).toBeNull()
  })

  it('fits the view around the waypoints of the fitted edges', () => {
    const graph = mount([
      { id: 'ab', from: 'a', to: 'b', via: [[200, 900]] },
      { id: 'ba', from: 'b', to: 'a' },
    ])
    graph.view.fit({ edges: ['ab'], padding: 0, duration: 0 })
    dom.flushFrames()
    const height = 600
    const bottom = graph.view.toWorld({ x: 0, y: height })
    expect(bottom.y).toBeGreaterThanOrEqual(900 - 1e-6)
    graph.view.fit({ edges: ['ba'], padding: 0, duration: 0 })
    dom.flushFrames()
    expect(graph.view.toWorld({ x: 0, y: height }).y).toBeLessThan(900)
    graph.view.fit({ padding: 0, duration: 0 })
    dom.flushFrames()
    expect(graph.view.toWorld({ x: 0, y: height }).y).toBeGreaterThanOrEqual(900 - 1e-6)
  })

  it('sends no paths to the renderer without waypoints', () => {
    mount([{ id: 'ab', from: 'a', to: 'b' }])
    expect(input?.bundles?.any).toBe(false)
    expect(input?.bundles?.fixed).toBeNull()
  })
})
