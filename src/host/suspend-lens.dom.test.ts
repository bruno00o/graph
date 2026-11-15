import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { createGraphHost, type GraphInstance } from './mount-graph'
import type { RenderFrame } from './renderer'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

const items: Item[] = [
  { id: 'a', x: -50, y: 0 },
  { id: 'b', x: 50, y: 0 },
]

let dom: FakeDom
let lenses: boolean[]

beforeEach(() => {
  dom = installDom()
  lenses = []
})

afterEach(() => {
  dom.restore()
})

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [nodes<Item>(items, { x: 'x', y: 'y' })],
        layout: null,
        interaction: { lens: true },
      }),
      ariaLabel: 'graph',
      initialView: { x: 0, y: 0, zoom: 1 },
    },
    () => ({
      ...fakeRenderer(),
      render: (frame: RenderFrame) => {
        lenses.push(frame.lens !== null && frame.lens !== undefined)
        return -1
      },
    }),
  )
  dom.flushFrames()
  return graph as GraphInstance
}

function hover(graph: GraphInstance, x: number, y: number): void {
  const canvas = graph.element.querySelector('canvas')
  canvas?.dispatchEvent(
    new PointerEvent('pointermove', {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      bubbles: true,
    }),
  )
}

describe('the lens of a suspended graph', () => {
  it('keeps a lens set at a point, draws it on the kept frame and shows it after resume', () => {
    const graph = mount()
    graph.lens.set({ at: { x: 400, y: 300 } })
    dom.flushFrames()
    const shown = graph.lens.get()
    expect(shown).not.toBeNull()
    lenses = []
    graph.suspend()
    expect(graph.lens.get()).toEqual(shown)
    expect(lenses).toEqual([true])
    graph.resume()
    dom.flushFrames()
    expect(graph.lens.get()).toEqual(shown)
    expect(lenses.at(-1)).toBe(true)
    graph.destroy()
  })

  it('takes away the lens that follows the pointer when the graph suspends', () => {
    const graph = mount()
    graph.lens.set({ at: 'pointer' })
    hover(graph, 300, 200)
    dom.flushFrames()
    expect(graph.lens.get()).not.toBeNull()
    graph.suspend()
    expect(graph.lens.get()).toBeNull()
    graph.destroy()
  })
})
