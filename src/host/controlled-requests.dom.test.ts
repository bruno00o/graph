import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { Key } from '../types'
import type { ElementKeys } from './events'
import { createGraphHost, type GraphInstance, type MountGraphOptions } from './mount-graph'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly parent?: string
}

const grouped: Item[] = [
  { id: 'g', x: -150, y: 0 },
  { id: 'h', x: 150, y: 0 },
  { id: 'a', x: -200, y: 0, parent: 'g' },
  { id: 'b', x: -100, y: 0, parent: 'g' },
  { id: 'c', x: 100, y: 0, parent: 'h' },
  { id: 'd', x: 200, y: 0, parent: 'h' },
]
const upper: Item[] = [{ id: 'e', x: 0, y: 200 }]

const definition = defineGraph({
  marks: [
    nodes<Item>(grouped, { x: 'x', y: 'y', parent: 'parent', layer: 'lower' }),
    nodes<Item>(upper, { x: 'x', y: 'y', layer: 'upper' }),
  ],
  layout: null,
})

let dom: FakeDom

function mount(options: Partial<MountGraphOptions>): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition, ariaLabel: 'graphe', initialView: { x: 0, y: 0, zoom: 1 }, ...options },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

function click(graph: GraphInstance, key: string, shiftKey: boolean): void {
  const position = graph.positions.get(key)
  if (!position) throw new Error(`no position for ${key}`)
  const at = graph.view.toScreen(position)
  const canvas = graph.element.querySelector('canvas')
  for (const type of ['pointerdown', 'pointerup']) {
    canvas?.dispatchEvent(
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
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

describe('controlled requests', () => {
  it('builds each selection request on the one not answered yet', () => {
    const requests: ElementKeys[] = []
    const graph = mount({
      selection: {},
      onSelectionChange: ({ selection }) => requests.push(selection),
    })
    click(graph, 'e', true)
    click(graph, 'a', true)
    expect(requests.map((request) => request.nodes)).toEqual([['e'], ['e', 'a']])
    graph.update({ selection: requests[0] ?? {} })
    click(graph, 'b', true)
    expect(requests.at(-1)?.nodes).toEqual(['e', 'a', 'b'])
    graph.update({ selection: requests.at(-1) ?? {} })
    expect(graph.selection.get().nodes).toEqual(['e', 'a', 'b'])
  })

  it('starts again from the applied selection when the application answers otherwise', () => {
    const requests: ElementKeys[] = []
    const graph = mount({
      selection: {},
      onSelectionChange: ({ selection }) => requests.push(selection),
    })
    click(graph, 'e', true)
    graph.update({ selection: {} })
    click(graph, 'a', true)
    expect(requests.at(-1)?.nodes).toEqual(['a'])
    graph.update({ selection: { nodes: ['d'] } })
    click(graph, 'b', true)
    expect(requests.at(-1)?.nodes).toEqual(['d', 'b'])
  })

  it('builds each fold request on the one not answered yet', () => {
    const requests: (readonly Key[])[] = []
    const graph = mount({ folded: [], onFoldChange: ({ folded }) => requests.push(folded) })
    graph.groups.toggle('g')
    graph.groups.fold(['h'])
    expect(requests).toEqual([['g'], ['g', 'h']])
    graph.update({ folded: ['g', 'h'] })
    graph.groups.toggle('g')
    expect(requests.at(-1)).toEqual(['h'])
  })

  it('builds each layer request on the one not answered yet', () => {
    const requests: (readonly string[])[] = []
    const graph = mount({
      hiddenLayers: [],
      onLayerChange: ({ hidden }) => requests.push(hidden),
    })
    graph.layers.toggle('lower')
    graph.layers.hide(['upper'])
    graph.layers.toggle('lower')
    expect(requests).toEqual([['lower'], ['lower', 'upper'], ['upper']])
    graph.update({ hiddenLayers: ['lower'] })
    graph.layers.show(['upper'])
    expect(requests.at(-1)).toEqual([])
    graph.update({ hiddenLayers: ['upper'] })
    graph.layers.toggle('lower')
    expect(requests.at(-1)).toEqual(['lower'])
  })
})
