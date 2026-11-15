import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { shapes } from '../shapes'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphDefinition, ShapeGeometry } from '../types'
import { createShapeEditor } from './editor'
import { mountShapeEditor } from './view'

interface Zone {
  readonly id: string
  readonly geometry: ShapeGeometry
}

const zones: Zone[] = [{ id: 'box', geometry: { x: -250, y: -200, width: 100, height: 100 } }]

let dom: FakeDom

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [shapes(zones, { name: 'zones', layer: 'areas' })],
        interaction: { select: 'multiple', keyboard: true },
      }) as GraphDefinition,
      ariaLabel: 'graph',
      initialView: { x: 0, y: 0, zoom: 1 },
    },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

function pointer(graph: GraphInstance, type: string, x: number, y: number): void {
  graph.element.querySelector('canvas')?.dispatchEvent(
    new PointerEvent(type, {
      clientX: x + 400,
      clientY: y + 300,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      bubbles: true,
      cancelable: true,
    }),
  )
}

function click(graph: GraphInstance, x: number, y: number): void {
  pointer(graph, 'pointermove', x, y)
  pointer(graph, 'pointerdown', x, y)
  pointer(graph, 'pointerup', x, y)
  dom.flushFrames()
}

function layerPath(graph: GraphInstance, index: number): string {
  const layer = graph.element.querySelector('svg[data-shape-editor]')
  return layer?.children[index]?.getAttribute('d') ?? ''
}

function previews(graph: GraphInstance): string[] {
  const layer = graph.element.querySelector('svg[data-shape-editor]')
  return [...(layer?.querySelectorAll('g > path') ?? [])].map(
    (path) => path.getAttribute('d') ?? '',
  )
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

describe('the editor and a shape hidden by its layer', () => {
  it('draws no handles for a selected shape once its layer is hidden', () => {
    const graph = mount()
    const editor = createShapeEditor(graph)
    mountShapeEditor(editor)
    click(graph, -200, -150)
    expect(graph.selection.get().shapes).toEqual(['box'])
    expect(layerPath(graph, 3)).not.toBe('')
    graph.layers.hide(['areas'])
    dom.flushFrames()
    expect(graph.count().shown).toMatchObject({ shapes: 0 })
    expect(layerPath(graph, 3)).toBe('')
    graph.destroy()
  })

  it('draws no proposal for a shape waiting for its data once its layer is hidden', () => {
    const graph = mount()
    const editor = createShapeEditor(graph)
    mountShapeEditor(editor)
    click(graph, -200, -150)
    graph.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    )
    dom.flushFrames()
    expect(editor.store.state.pending).toEqual(['box'])
    expect(previews(graph).filter((d) => d !== '')).toHaveLength(1)
    graph.layers.hide(['areas'])
    dom.flushFrames()
    expect(previews(graph).filter((d) => d !== '')).toHaveLength(0)
    graph.destroy()
  })

  it('abandons a move whose shape is hidden during the gesture', () => {
    const graph = mount()
    const editor = createShapeEditor(graph)
    mountShapeEditor(editor)
    const edits: unknown[] = []
    editor.on('edit', (event) => {
      edits.push(...event.edits)
    })
    pointer(graph, 'pointermove', -200, -150)
    pointer(graph, 'pointerdown', -200, -150)
    pointer(graph, 'pointermove', -180, -150)
    pointer(graph, 'pointermove', -160, -150)
    dom.flushFrames()
    expect(editor.store.state.gesture?.keys).toEqual(['box'])
    graph.layers.hide(['areas'])
    dom.flushFrames()
    expect(editor.store.state.gesture).toBeNull()
    pointer(graph, 'pointerup', -160, -150)
    dom.flushFrames()
    expect(edits).toEqual([])
    expect(previews(graph).filter((d) => d !== '')).toHaveLength(0)
    graph.destroy()
  })

  it('leaves a hidden shape out of the selected shapes until it shows again', () => {
    const graph = mount()
    const editor = createShapeEditor(graph)
    mountShapeEditor(editor)
    click(graph, -200, -150)
    graph.layers.hide(['areas'])
    dom.flushFrames()
    expect(editor.store.state.selected).toEqual([])
    graph.layers.show(['areas'])
    dom.flushFrames()
    expect(editor.store.state.selected).toEqual(['box'])
    expect(layerPath(graph, 3)).not.toBe('')
    graph.destroy()
  })
})
