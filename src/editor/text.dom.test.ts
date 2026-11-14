import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { internalsOf } from '../host/internals'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { nodes } from '../marks'
import { shapes } from '../shapes'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphDefinition, ShapeGeometry } from '../types'
import { createShapeEditor, type ShapeEditorOptions } from './editor'
import { applyShapeEdits, type ShapeEdit } from './edits'
import { mountShapeEditor } from './view'

interface Note {
  readonly id: string
  readonly geometry: ShapeGeometry
  readonly text?: string
}

let dom: FakeDom
let notes: Note[]
let zones: Note[]

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

function definition(): GraphDefinition {
  return defineGraph({
    marks: [
      shapes(zones, { name: 'zones' }),
      shapes(notes, {
        name: 'notes',
        fill: 'transparent',
        label: { text: 'text', wrap: true, scale: 'world', size: 10 },
      }),
      nodes([{ id: 'n', x: 300, y: 250 }], { x: 'x', y: 'y' }),
    ],
    interaction: { select: 'multiple', keyboard: true },
  }) as GraphDefinition
}

function mount(): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definition(), ariaLabel: 'graph', initialView: { x: 0, y: 0, zoom: 1 } },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

function canvasOf(graph: GraphInstance): HTMLCanvasElement {
  const canvas = graph.element.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  return canvas
}

function pointer(graph: GraphInstance, type: string, x: number, y: number): void {
  canvasOf(graph).dispatchEvent(
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

function stroke(graph: GraphInstance, points: readonly (readonly [number, number])[]): void {
  const [first] = points
  if (!first) return
  pointer(graph, 'pointermove', first[0], first[1])
  pointer(graph, 'pointerdown', first[0], first[1])
  for (const [x, y] of points.slice(1)) pointer(graph, 'pointermove', x, y)
  const last = points[points.length - 1] ?? first
  pointer(graph, 'pointerup', last[0], last[1])
  dom.flushFrames()
}

function doubleClick(graph: GraphInstance, x: number, y: number): void {
  stroke(graph, [[x, y]])
  stroke(graph, [[x, y]])
  canvasOf(graph).dispatchEvent(
    new MouseEvent('dblclick', { clientX: x + 400, clientY: y + 300, bubbles: true }),
  )
  dom.flushFrames()
}

function key(target: Element, name: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  dom.flushFrames()
  return event.defaultPrevented
}

function type(input: HTMLTextAreaElement, text: string): void {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  dom.flushFrames()
}

function editorOf(graph: GraphInstance, options: ShapeEditorOptions = {}) {
  let count = 0
  const editor = createShapeEditor(graph, { newKey: () => `new${++count}`, ...options })
  const view = mountShapeEditor(editor, { placeholder: 'Write here' })
  const batches: ShapeEdit[][] = []
  editor.on('edit', ({ edits }) => {
    batches.push([...edits])
    notes = applyShapeEdits(notes, edits, { mark: 'notes' })
    zones = applyShapeEdits(zones, edits, { mark: 'zones' })
    graph.update({ definition: definition() })
  })
  return { editor, view, batches }
}

beforeEach(() => {
  dom = installDom()
  notes = [{ id: 'note', geometry: { x: -100, y: -100, width: 100, height: 50 }, text: 'hello' }]
  zones = [{ id: 'zone', geometry: { x: 100, y: 0, width: 100, height: 100 } }]
})

afterEach(() => {
  dom.restore()
})

describe('text in shapes', () => {
  it('draws a box with the text tool, opens its input, and adds the shape with its text', () => {
    const graph = mount()
    const { editor, view, batches } = editorOf(graph, { tool: 'text', textMark: 'notes' })
    stroke(graph, [
      [0, 0],
      [60, 10],
      [120, 40],
    ])
    expect(batches).toEqual([])
    expect(editor.store.state.text).toMatchObject({
      key: 'new1',
      added: true,
      text: '',
      x: 400,
      y: 300,
      width: 120,
      height: 40,
      fontSize: 10,
      fontWeight: 500,
      fontFamily: null,
      wrap: true,
    })
    expect(view.input.style.display).toBe('')
    expect(view.input.placeholder).toBe('Write here')
    expect(document.activeElement).toBe(view.input)
    expect(view.input.style.fontSize).toBe('10px')
    type(view.input, 'first\nsecond')
    expect(editor.store.state.text?.text).toBe('first\nsecond')
    expect(key(view.input, 'Escape')).toBe(true)
    expect(batches).toEqual([
      [
        {
          type: 'add',
          key: 'new1',
          mark: 'notes',
          geometry: { x: 0, y: 0, width: 120, height: 40 },
          tool: 'text',
          text: 'first\nsecond',
        },
      ],
    ])
    expect(notes.at(-1)).toEqual({
      id: 'new1',
      geometry: { x: 0, y: 0, width: 120, height: 40 },
      text: 'first\nsecond',
    })
    expect(editor.store.state.text).toBeNull()
    expect(view.input.style.display).toBe('none')
    expect(document.activeElement).toBe(graph.element)
    expect(graph.selection.get().shapes).toEqual(['new1'])
    graph.destroy()
  })

  it('proposes nothing for a box left empty', () => {
    const graph = mount()
    const { editor, batches } = editorOf(graph, { tool: 'text', textMark: 'notes' })
    stroke(graph, [
      [0, 0],
      [120, 40],
    ])
    editor.setText('   ')
    editor.endText()
    expect(batches).toEqual([])
    expect(editor.store.state.text).toBeNull()
    graph.destroy()
  })

  it('makes the box taller when the wrapped text does not fit', () => {
    const graph = mount()
    const { editor, batches } = editorOf(graph, { tool: 'text', textMark: 'notes' })
    stroke(graph, [
      [0, 0],
      [100, 20],
    ])
    editor.setText('aaaa bbbb cccc dddd eeee')
    expect(editor.store.state.text?.height).toBe(35)
    editor.endText()
    expect(last(batches)).toMatchObject({
      type: 'add',
      geometry: { x: 0, y: 0, width: 100, height: 35 },
    })
    graph.destroy()
  })

  it('edits the text of a labeled shape on a double click, and undoes it', () => {
    const graph = mount()
    const { editor, view, batches } = editorOf(graph)
    const doubles: unknown[] = []
    graph.on('doubleclick', (event) => doubles.push(event))
    doubleClick(graph, -50, -75)
    expect(doubles).toEqual([])
    expect(editor.store.state.text).toMatchObject({ key: 'note', added: false, text: 'hello' })
    expect(view.input.value).toBe('hello')
    type(view.input, 'hello world')
    key(view.input, 'Enter', { metaKey: true })
    expect(last(batches)).toEqual({
      type: 'change',
      key: 'note',
      mark: 'notes',
      datum: { id: 'note', geometry: { x: -100, y: -100, width: 100, height: 50 }, text: 'hello' },
      text: 'hello world',
    })
    expect(notes[0]?.text).toBe('hello world')
    editor.undo()
    expect(last(batches)).toMatchObject({ type: 'change', key: 'note', text: 'hello' })
    expect(notes[0]?.text).toBe('hello')
    editor.redo()
    expect(notes[0]?.text).toBe('hello world')
    graph.destroy()
  })

  it('opens the text of the selected shape with Enter, and leaves unlabeled shapes alone', () => {
    const graph = mount()
    const { editor, view } = editorOf(graph)
    graph.selection.set({ nodes: [], edges: [], shapes: ['zone'] })
    dom.flushFrames()
    graph.element.focus()
    expect(key(graph.element, 'Enter')).toBe(false)
    expect(editor.store.state.text).toBeNull()
    const doubles: unknown[] = []
    graph.on('doubleclick', (event) => doubles.push(event))
    doubleClick(graph, 150, 50)
    expect(doubles).toHaveLength(1)
    expect(editor.store.state.text).toBeNull()
    graph.selection.set({ nodes: [], edges: [], shapes: ['note'] })
    dom.flushFrames()
    graph.element.focus()
    expect(key(graph.element, 'Enter')).toBe(true)
    expect(editor.store.state.text?.key).toBe('note')
    expect(document.activeElement).toBe(view.input)
    graph.destroy()
  })

  it('ends the text on a press elsewhere, and drops it on cancel', () => {
    const graph = mount()
    const { editor, batches } = editorOf(graph)
    editor.editText('note')
    editor.setText('changed')
    pointer(graph, 'pointerdown', 300, 250)
    pointer(graph, 'pointerup', 300, 250)
    dom.flushFrames()
    expect(last(batches)).toMatchObject({ type: 'change', key: 'note', text: 'changed' })
    expect(graph.selection.get().nodes).toEqual([])
    editor.editText('note')
    editor.setText('dropped')
    editor.cancel()
    expect(editor.store.state.text).toBeNull()
    expect(batches).toHaveLength(1)
    graph.destroy()
  })

  it('hides the shape while its text is typed, and follows the view', () => {
    const graph = mount()
    const { editor } = editorOf(graph)
    editor.editText('note')
    dom.flushFrames()
    expect(editor.store.state.pending).toEqual([])
    expect(drafted(graph, 'note')).toBe(true)
    graph.view.set({ x: 0, y: 0, zoom: 2 })
    dom.flushFrames()
    expect(editor.store.state.text).toMatchObject({
      x: 200,
      y: 100,
      width: 200,
      height: 100,
      fontSize: 20,
    })
    editor.cancel()
    expect(drafted(graph, 'note')).toBe(false)
    graph.destroy()
  })
})

function last(batches: readonly ShapeEdit[][]): ShapeEdit | undefined {
  return batches.at(-1)?.[0]
}

function drafted(graph: GraphInstance, key: string): boolean {
  const internals = internalsOf(graph, 'test')
  const record = internals.shape(key)
  return record !== null && internals.scene.shapes.draft[record.index] === 1
}
