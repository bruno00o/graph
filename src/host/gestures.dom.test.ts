import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphDefinition } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
  { id: 'c', x: 0, y: 100 },
]
const links: Link[] = [{ id: 'bc', from: 'b', to: 'c' }]

function definition(data: readonly Item[] = items, placed = false): GraphDefinition {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(data, placed ? { x: 'x', y: 'y' } : {}),
    ],
    layout: null,
    interaction: { lens: true },
  })
}

let dom: FakeDom

function mount(graphDefinition = definition()): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: graphDefinition, ariaLabel: 'graphe', initialView: { x: 0, y: 0, zoom: 1 } },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

function pointer(graph: GraphInstance, type: string, x: number, y: number): void {
  graph.element
    .querySelector('canvas')
    ?.dispatchEvent(
      new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true }),
    )
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

describe('pointer gestures', () => {
  it('ends the drag of a node that leaves and leaves the newcomer in its slot alone', () => {
    const graph = mount()
    graph.positions.set([['a', { x: -100, y: 0 }]])
    dom.flushFrames()
    const ends: string[] = []
    graph.on('dragend', ({ target }) => ends.push(String(target.key)))
    const start = graph.view.toScreen({ x: -100, y: 0 })
    pointer(graph, 'pointerdown', start.x, start.y)
    pointer(graph, 'pointermove', start.x + 20, start.y)
    expect(graph.positions.get('a')).toEqual({ x: -80, y: 0 })
    graph.update({ definition: definition(items.slice(1)) })
    dom.flushFrames()
    expect(ends).toEqual(['a'])
    graph.update({ definition: definition([...items.slice(1), { id: 'z', x: 0, y: 0 }]) })
    dom.flushFrames()
    const before = graph.positions.get('z')
    const view = graph.view.get()
    pointer(graph, 'pointermove', start.x + 60, start.y + 40)
    pointer(graph, 'pointerup', start.x + 60, start.y + 40)
    dom.flushFrames()
    expect(graph.positions.get('z')).toEqual(before)
    expect(graph.view.get()).toEqual(view)
    expect(ends).toEqual(['a'])
    graph.destroy()
  })

  it('keeps dragging the rest of the selection when one of its nodes leaves', () => {
    const graph = mount(definition(items, true))
    graph.selection.set({ nodes: ['a', 'b'] })
    const start = graph.view.toScreen({ x: -100, y: 0 })
    pointer(graph, 'pointerdown', start.x, start.y)
    pointer(graph, 'pointermove', start.x + 20, start.y)
    const others = items.filter((item) => item.id !== 'b')
    graph.update({ definition: definition(others, true) })
    dom.flushFrames()
    graph.update({ definition: definition([...others, { id: 'z', x: 0, y: 0 }], true) })
    dom.flushFrames()
    pointer(graph, 'pointermove', start.x + 50, start.y)
    pointer(graph, 'pointerup', start.x + 50, start.y)
    expect(graph.positions.get('a')).toEqual({ x: -50, y: 0 })
    expect(graph.positions.get('z')).toEqual({ x: 0, y: 0 })
    graph.destroy()
  })

  it('does not turn a lens drag into a pan when the lens is hidden mid-gesture', () => {
    const graph = mount(definition(items, true))
    graph.lens.set({ at: { x: 100, y: 100 }, radius: 50 })
    dom.flushFrames()
    pointer(graph, 'pointerdown', 100, 100)
    pointer(graph, 'pointermove', 120, 100)
    expect(graph.lens.get()?.at).toEqual({ x: 120, y: 100 })
    graph.lens.set(null)
    const view = graph.view.get()
    const selection = graph.selection.get()
    pointer(graph, 'pointermove', 220, 100)
    dom.flushFrames()
    pointer(graph, 'pointerup', 220, 100)
    expect(graph.view.get()).toEqual(view)
    expect(graph.selection.get()).toEqual(selection)
    graph.destroy()
  })
})
