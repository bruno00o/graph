import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { mapSurface } from '../map'
import { shapes } from '../shapes'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { type FakeMap, fakeMap } from '../testing/map'
import type { GraphDefinition, Point, ShapeGeometry } from '../types'
import { createShapeEditor } from './editor'
import type { ShapeEdit } from './edits'
import { mountShapeEditor } from './view'

interface Zone {
  readonly id: string
  readonly geometry: ShapeGeometry
}

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

let dom: FakeDom
let zones: Zone[]

function definition(): GraphDefinition {
  return defineGraph({
    marks: [shapes(zones, { name: 'zones', label: 'id' })],
    interaction: { select: 'multiple' },
  }) as GraphDefinition
}

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definition(), ariaLabel: 'graph', initialView: { x: 0, y: 0, zoom: 1 } },
    fakeRenderer,
  ) as unknown as GraphInstance
  dom.flushFrames()
  return graph
}

function sender(graph: GraphInstance, map: FakeMap) {
  return (type: string, world: Point) => {
    const onMap = graph.store.state.surface === 'map'
    const target = onMap ? map.canvas : graph.element.querySelector('canvas')
    const point = graph.view.toScreen(world)
    target?.dispatchEvent(
      new PointerEvent(type, {
        clientX: point.x,
        clientY: point.y,
        pointerId: 1,
        button: 0,
        pointerType: 'mouse',
        bubbles: true,
        cancelable: true,
      }),
    )
    dom.flushFrames()
  }
}

function editorOf(graph: GraphInstance) {
  let count = 0
  const editor = createShapeEditor(graph, { newKey: () => `new${++count}` })
  mountShapeEditor(editor)
  const batches: ShapeEdit[][] = []
  editor.on('edit', ({ edits }) => {
    batches.push([...edits])
  })
  return { editor, batches }
}

beforeEach(() => {
  dom = installDom()
  zones = [{ id: 'box', geometry: { x: 255, y: 255, width: 2, height: 2 } }]
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
  document.body.innerHTML = ''
})

describe('the shape editor when the graph moves to a map and back', () => {
  it('draws in degrees on the map and in world units on the canvas', () => {
    const fake = fakeMap()
    const graph = mount()
    const send = sender(graph, fake)
    const { editor, batches } = editorOf(graph)
    editor.setTool('rectangle')
    const draw = (from: Point, to: Point) => {
      send('pointermove', from)
      send('pointerdown', from)
      send('pointermove', { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 })
      send('pointermove', to)
      send('pointerup', to)
    }
    draw({ x: 0, y: 0 }, { x: 100, y: 50 })
    expect(batches.at(-1)?.[0]).toMatchObject({ geometry: { x: 0, y: 0, width: 100, height: 50 } })
    graph.update({ surface: mapSurface(fake.map) })
    fake.render()
    draw({ x: 256, y: 256 }, { x: 260, y: 252 })
    const onMap = batches.at(-1)?.[0] as unknown as { geometry: { type: string } }
    expect(onMap.geometry.type).toBe('Polygon')
    graph.update({ surface: null })
    dom.flushFrames()
    draw({ x: 10, y: 10 }, { x: 30, y: 20 })
    expect(batches.at(-1)?.[0]).toMatchObject({ geometry: { x: 10, y: 10, width: 20, height: 10 } })
    expect(editor.store.state.pending).toEqual(['new1', 'new2', 'new3'])
    graph.destroy()
  })

  it('drops a gesture or a drawing in progress, and keeps the pending edits', () => {
    const fake = fakeMap()
    const graph = mount()
    const send = sender(graph, fake)
    const { editor, batches } = editorOf(graph)
    const lost: unknown[] = []
    editor.on('editlost', (event) => lost.push(event))
    graph.update({ surface: mapSurface(fake.map) })
    fake.render()
    graph.selection.set({ shapes: ['box'] })
    dom.flushFrames()
    send('pointermove', { x: 256, y: 256 })
    send('pointerdown', { x: 256, y: 256 })
    send('pointermove', { x: 256.4, y: 256 })
    send('pointermove', { x: 256.8, y: 256 })
    expect(editor.store.state.gesture?.type).toBe('move')
    graph.update({ surface: null })
    dom.flushFrames()
    expect(editor.store.state.gesture).toBeNull()
    expect(batches).toEqual([])
    editor.setTool('polygon')
    send('pointermove', { x: 0, y: 0 })
    send('pointerdown', { x: 0, y: 0 })
    send('pointerup', { x: 0, y: 0 })
    send('pointermove', { x: 40, y: 0 })
    send('pointerdown', { x: 40, y: 0 })
    send('pointerup', { x: 40, y: 0 })
    expect(editor.store.state.drawing).toEqual({ tool: 'polygon', points: 2 })
    editor.setTool('circle')
    send('pointermove', { x: 0, y: 0 })
    send('pointerdown', { x: 0, y: 0 })
    send('pointerup', { x: 0, y: 0 })
    send('pointermove', { x: 10, y: 0 })
    send('pointerdown', { x: 10, y: 0 })
    send('pointerup', { x: 10, y: 0 })
    expect(editor.store.state.pending).toEqual(['new1'])
    editor.setTool('polygon')
    send('pointermove', { x: 0, y: 0 })
    send('pointerdown', { x: 0, y: 0 })
    send('pointerup', { x: 0, y: 0 })
    expect(editor.store.state.drawing?.points).toBe(1)
    graph.update({ surface: mapSurface(fake.map) })
    fake.render()
    expect(editor.store.state.drawing).toBeNull()
    expect(editor.store.state.pending).toEqual(['new1'])
    expect(lost).toEqual([])
    graph.destroy()
  })

  it('proposes the text being typed at the switch', () => {
    const fake = fakeMap()
    const graph = mount()
    const { editor, batches } = editorOf(graph)
    graph.selection.set({ shapes: ['box'] })
    dom.flushFrames()
    editor.editText('box')
    expect(editor.store.state.text?.key).toBe('box')
    editor.setText('Hello')
    graph.update({ surface: mapSurface(fake.map) })
    fake.render()
    expect(editor.store.state.text).toBeNull()
    expect(batches.at(-1)?.[0]).toMatchObject({ type: 'change', key: 'box', text: 'Hello' })
    graph.destroy()
  })

  it('follows a release of the surface and the removal of the map, and goes with the graph', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const first = fakeMap()
    const graph = mount()
    const { editor } = editorOf(graph)
    editor.setTool('polygon')
    const surface = mapSurface(first.map)
    graph.update({ surface })
    first.render()
    const send = sender(graph, first)
    send('pointermove', { x: 256, y: 256 })
    send('pointerdown', { x: 256, y: 256 })
    send('pointerup', { x: 256, y: 256 })
    expect(editor.store.state.drawing?.points).toBe(1)
    surface.release()
    expect(editor.store.state.drawing).toBeNull()
    const second = fakeMap()
    graph.update({ surface: mapSurface(second.map) })
    second.render()
    second.map.remove()
    expect(graph.store.state.surface).toBe('canvas')
    expect(editor.store.state.tool).toBe('polygon')
    graph.update({ surface })
    graph.destroy()
    expect(graph.element.querySelector('svg[data-shape-editor]')).toBeNull()
  })
})
