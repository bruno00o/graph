import { createCollection, debounceStrategy, localOnlyCollectionOptions } from '@tanstack/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createShapeEditor, type ShapeEditor } from '../editor/editor'
import type { ShapeEdit } from '../editor/edits'
import { linkEditor } from '../editor/link'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { shapes } from '../shapes'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { Key, ShapeGeometry, ShapeMark } from '../types'
import { persistShapes } from './index'

interface Zone {
  readonly id: string
  readonly geometry: ShapeGeometry
  readonly tone: string
}

const start: Zone[] = [
  { id: 'box', tone: 'warm', geometry: { x: -250, y: -200, width: 100, height: 100 } },
  {
    id: 'tri',
    tone: 'cold',
    geometry: {
      rings: [
        [
          { x: 50, y: -200 },
          { x: 250, y: -200 },
          { x: 150, y: -50 },
        ],
      ],
    },
  },
]

let dom: FakeDom
let serial = 0

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

function zoneCollection() {
  return createCollection(
    localOnlyCollectionOptions({
      id: `zones-${serial++}`,
      getKey: (zone: Zone) => zone.id,
      initialData: start,
    }),
  )
}

type Zones = ReturnType<typeof zoneCollection>

function mount(collection: Zones): GraphInstance<'saving'> {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks: [shapes(collection, { name: 'zones' })],
        states: { saving: { opacity: 0.5 } },
        interaction: { keyboard: true },
      }),
      ariaLabel: 'graph',
      initialView: { x: 0, y: 0, zoom: 1 },
    },
    fakeRenderer,
  ) as unknown as GraphInstance<'saving'>
  dom.flushFrames()
  return graph
}

function pointer(
  graph: GraphInstance<'saving'>,
  type: string,
  x: number,
  y: number,
  cancelled = false,
): void {
  const canvas = graph.element.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  canvas.dispatchEvent(
    new PointerEvent(cancelled ? 'pointercancel' : type, {
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

function press(graph: GraphInstance<'saving'>, x: number, y: number): void {
  pointer(graph, 'pointermove', x, y)
  pointer(graph, 'pointerdown', x, y)
}

function drag(
  graph: GraphInstance<'saving'>,
  from: readonly [number, number],
  to: readonly [number, number],
): void {
  press(graph, from[0], from[1])
  pointer(graph, 'pointermove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2)
  pointer(graph, 'pointermove', to[0], to[1])
  pointer(graph, 'pointerup', to[0], to[1])
  dom.flushFrames()
}

function key(graph: GraphInstance<'saving'>, name: string): void {
  graph.element.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
  )
  dom.flushFrames()
}

function lostKeys(editor: ShapeEditor): Key[] {
  const lost: Key[] = []
  editor.on('editlost', ({ edits }) => {
    for (const edit of edits) lost.push(edit.key)
  })
  return lost
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  vi.useRealTimers()
  dom.restore()
})

describe('persistShapes', () => {
  it('writes the outline of a moved shape, and the draft falls when the row comes back', () => {
    const collection = zoneCollection()
    const graph = mount(collection)
    const editor = createShapeEditor(graph)
    const stop = persistShapes(editor, { collection })
    const before = collection.get('box')
    drag(graph, [-200, -150], [-150, -150])
    expect(collection.get('box')).toMatchObject({
      id: 'box',
      tone: 'warm',
      geometry: { x: -200, y: -200, width: 100, height: 100 },
    })
    expect(before?.geometry).toEqual({ x: -250, y: -200, width: 100, height: 100 })
    expect(editor.store.state.pending).toEqual([])
    expect(graph.pick({ x: 210, y: 150 })?.key).toBe('box')
    stop()
    drag(graph, [-150, -150], [-100, -150])
    expect(collection.get('box')?.geometry).toEqual({ x: -200, y: -200, width: 100, height: 100 })
    graph.destroy()
  })

  it('sends only the changed fields to the mutation function', async () => {
    const collection = zoneCollection()
    const graph = mount(collection)
    const editor = createShapeEditor(graph)
    const mutationFn = vi.fn(async ({ transaction }) => {
      collection.utils.acceptMutations(transaction)
    })
    persistShapes(editor, { collection, mutationFn })
    drag(graph, [-200, -150], [-150, -150])
    await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1))
    const [{ transaction }] = mutationFn.mock.calls[0] ?? []
    expect(transaction.mutations).toHaveLength(1)
    expect(transaction.mutations[0]).toMatchObject({ type: 'update', key: 'box' })
    expect(transaction.mutations[0].changes).toEqual({
      geometry: { x: -200, y: -200, width: 100, height: 100 },
    })
    graph.destroy()
  })

  it('rolls back a failed write and emits editlost', async () => {
    const collection = zoneCollection()
    const graph = mount(collection)
    const editor = createShapeEditor(graph)
    const lost = lostKeys(editor)
    let refuse: () => void = () => {}
    const mutationFn = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          refuse = () => reject(new Error('refused'))
        }),
    )
    persistShapes(editor, { collection, mutationFn, pendingState: 'saving' })
    drag(graph, [-200, -150], [-150, -150])
    expect(collection.get('box')?.geometry).toMatchObject({ x: -200 })
    expect(graph.states.get('saving').shapes).toEqual(['box'])
    await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1))
    dom.flushFrames()
    expect(editor.store.state.pending).toEqual([])
    refuse()
    await vi.waitFor(() => expect(lost).toEqual(['box']))
    expect(collection.get('box')?.geometry).toMatchObject({ x: -250 })
    await vi.waitFor(() => expect(graph.states.get('saving').shapes).toEqual([]))
    dom.flushFrames()
    expect(graph.pick({ x: 160, y: 150 })?.key).toBe('box')
    graph.destroy()
  })

  it('drops the draft of an edit that the row already holds', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const collection = zoneCollection()
    const graph = mount(collection)
    const editor = createShapeEditor(graph, { hold: 500 })
    const lost = lostKeys(editor)
    persistShapes(editor, { collection })
    press(graph, -200, -150)
    pointer(graph, 'pointermove', -150, -150)
    pointer(graph, 'pointermove', -200, -150)
    pointer(graph, 'pointerup', -200, -150)
    dom.flushFrames()
    expect(editor.store.state.pending).toEqual([])
    vi.advanceTimersByTime(1000)
    expect(lost).toEqual([])
    graph.destroy()
  })

  it('removes rows', () => {
    const collection = zoneCollection()
    const graph = mount(collection)
    const editor = createShapeEditor(graph)
    persistShapes(editor, { collection })
    graph.selection.set({ shapes: ['tri'] })
    graph.element.focus()
    key(graph, 'Delete')
    expect(collection.has('tri')).toBe(false)
    expect(graph.count()).toMatchObject({ shapes: 1 })
    graph.destroy()
  })

  it('writes during the gesture with live, and puts the shape back on cancel', () => {
    const collection = zoneCollection()
    const graph = mount(collection)
    const editor = createShapeEditor(graph)
    persistShapes(editor, { collection, live: true })
    press(graph, -200, -150)
    pointer(graph, 'pointermove', -150, -150)
    expect(collection.get('box')?.geometry).toMatchObject({ x: -200 })
    dom.flushFrames()
    expect(editor.store.state.gesture?.type).toBe('move')
    graph.element.focus()
    key(graph, 'Escape')
    expect(editor.store.state.gesture).toBeNull()
    expect(collection.get('box')?.geometry).toEqual({ x: -250, y: -200, width: 100, height: 100 })
    graph.destroy()
  })

  it('puts a reshaped outline back when a live gesture is cancelled or the editor goes', () => {
    const collection = zoneCollection()
    const graph = mount(collection)
    const editor = createShapeEditor(graph)
    persistShapes(editor, { collection, live: 0 })
    const triangle = collection.get('tri')?.geometry
    graph.selection.set({ shapes: ['tri'] })
    dom.flushFrames()
    press(graph, 250, -200)
    pointer(graph, 'pointermove', 270, -210)
    expect(collection.get('tri')?.geometry).not.toEqual(triangle)
    pointer(graph, 'pointerup', 270, -210, true)
    expect(collection.get('tri')?.geometry).toEqual(triangle)
    press(graph, 250, -200)
    pointer(graph, 'pointermove', 270, -210)
    expect(collection.get('tri')?.geometry).not.toEqual(triangle)
    editor.destroy()
    expect(collection.get('tri')?.geometry).toEqual(triangle)
    graph.destroy()
  })

  it('merges live writes into the paced transaction and loses only the release', async () => {
    const collection = zoneCollection()
    const graph = mount(collection)
    const editor = createShapeEditor(graph)
    const lost: ShapeEdit[][] = []
    editor.on('editlost', ({ edits }) => lost.push([...edits]))
    const mutationFn = vi.fn(async () => {
      throw new Error('refused')
    })
    persistShapes(editor, {
      collection,
      mutationFn,
      live: 0,
      strategy: debounceStrategy({ wait: 20 }),
    })
    press(graph, -200, -150)
    pointer(graph, 'pointermove', -190, -150)
    pointer(graph, 'pointermove', -180, -150)
    pointer(graph, 'pointerup', -170, -150)
    expect(collection.get('box')?.geometry).toMatchObject({ x: -230 })
    await vi.waitFor(() => expect(lost).toHaveLength(1))
    expect(mutationFn).toHaveBeenCalledTimes(1)
    expect(lost[0]?.map((edit) => edit.key)).toEqual(['box'])
    expect(collection.get('box')?.geometry).toMatchObject({ x: -250 })
    graph.destroy()
  })

  it('paces live writes and writes the release at once', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const collection = zoneCollection()
    const graph = mount(collection)
    const editor = createShapeEditor(graph)
    const writes: unknown[] = []
    collection.subscribeChanges((changes) => {
      for (const change of changes) writes.push(change.value.geometry)
    })
    persistShapes(editor, { collection, live: 200 })
    press(graph, -200, -150)
    pointer(graph, 'pointermove', -190, -150)
    pointer(graph, 'pointermove', -180, -150)
    pointer(graph, 'pointermove', -170, -150)
    expect(writes).toHaveLength(1)
    vi.advanceTimersByTime(200)
    expect(writes).toHaveLength(2)
    pointer(graph, 'pointermove', -160, -150)
    pointer(graph, 'pointerup', -160, -150)
    expect(writes).toHaveLength(3)
    vi.advanceTimersByTime(1000)
    expect(writes).toHaveLength(3)
    expect(collection.get('box')?.geometry).toMatchObject({ x: -210 })
    graph.destroy()
  })

  it('keeps the gesture through a change from elsewhere, and the release wins', () => {
    const collection = zoneCollection()
    const graph = mount(collection)
    const editor = createShapeEditor(graph)
    persistShapes(editor, { collection })
    press(graph, -200, -150)
    pointer(graph, 'pointermove', -150, -150)
    collection.update('box', (draft) => {
      draft.geometry = { x: 0, y: 0, width: 10, height: 10 }
    })
    dom.flushFrames()
    expect(editor.store.state.gesture?.type).toBe('move')
    pointer(graph, 'pointermove', -140, -150)
    pointer(graph, 'pointerup', -140, -150)
    expect(collection.get('box')?.geometry).toEqual({ x: -190, y: -200, width: 100, height: 100 })
    graph.destroy()
  })

  it('ends the gesture when the row is removed elsewhere', () => {
    const collection = zoneCollection()
    const graph = mount(collection)
    const editor = createShapeEditor(graph)
    const edits: ShapeEdit[] = []
    editor.on('edit', (event) => edits.push(...event.edits))
    persistShapes(editor, { collection, live: true })
    press(graph, -200, -150)
    pointer(graph, 'pointermove', -150, -150)
    collection.delete('box')
    dom.flushFrames()
    expect(editor.store.state.gesture).toBeNull()
    pointer(graph, 'pointerup', -140, -150)
    expect(edits).toEqual([])
    expect(collection.has('box')).toBe(false)
    graph.destroy()
  })

  it('puts the other shapes of a live gesture back when one is removed elsewhere', () => {
    const collection = zoneCollection()
    const graph = mount(collection)
    const editor = createShapeEditor(graph)
    persistShapes(editor, { collection, live: 0 })
    graph.selection.set({ shapes: ['box', 'tri'] })
    dom.flushFrames()
    press(graph, -200, -150)
    pointer(graph, 'pointermove', -150, -150)
    expect(collection.get('tri')?.geometry).not.toEqual(start[1]?.geometry)
    collection.delete('box')
    dom.flushFrames()
    expect(editor.store.state.gesture).toBeNull()
    expect(collection.get('tri')?.geometry).toEqual(start[1]?.geometry)
    dom.flushFrames()
    expect(graph.count()).toMatchObject({ shapes: 1 })
    graph.destroy()
  })

  it('holds shapes in the pending state until their write is done', async () => {
    const collection = zoneCollection()
    const graph = mount(collection)
    const editor = createShapeEditor(graph)
    let accept: () => void = () => {}
    const mutationFn = vi.fn(
      ({ transaction }) =>
        new Promise<void>((resolve) => {
          accept = () => {
            collection.utils.acceptMutations(transaction)
            resolve()
          }
        }),
    )
    persistShapes(editor, { collection, mutationFn, pendingState: 'saving' })
    drag(graph, [-200, -150], [-150, -150])
    expect(graph.states.get('saving').shapes).toEqual(['box'])
    await vi.waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1))
    accept()
    await vi.waitFor(() => expect(graph.states.get('saving').shapes).toEqual([]))
    expect(collection.get('box')?.geometry).toMatchObject({ x: -200 })
    graph.destroy()
  })

  it('inserts new shapes with create, and keeps to its mark', () => {
    const collection = zoneCollection()
    const graph = mount(collection)
    const handlers = new Set<(event: { edits: readonly ShapeEdit[] }) => void>()
    const editor = {
      on: (_: string, handler: (event: { edits: readonly ShapeEdit[] }) => void) => {
        handlers.add(handler)
        return () => handlers.delete(handler)
      },
    } as unknown as ShapeEditor
    linkEditor(editor, {
      graph,
      watch: () => () => {},
      current: () => [],
      answer: () => {},
      lose: () => {},
    })
    persistShapes(editor, {
      collection,
      mark: 'zones',
      create: (edit) => ({ id: String(edit.key), tone: 'new', geometry: edit.geometry }),
    })
    const geometry = { x: 0, y: 0, width: 5, height: 5 }
    for (const handler of handlers) {
      handler({
        edits: [
          { type: 'add', key: 'other', mark: 'elsewhere', geometry },
          { type: 'add', key: 'new', mark: 'zones', geometry },
        ],
      })
    }
    expect(collection.get('new')).toMatchObject({ id: 'new', tone: 'new', geometry })
    expect(collection.has('other')).toBe(false)
    graph.destroy()
  })

  it('types the mark name from the marks of the editor', () => {
    const collection = zoneCollection()
    const typed = {} as ShapeEditor<ShapeMark<Zone, 'zones'>>
    const check = () => {
      persistShapes(typed, { collection, mark: 'zones' })
      // @ts-expect-error
      persistShapes(typed, { collection, mark: 'other' })
    }
    expect(check).toBeTypeOf('function')
  })

  it('refuses what it cannot use', () => {
    const collection = zoneCollection()
    const graph = mount(collection)
    const editor = createShapeEditor(graph)
    expect(() => persistShapes(editor, { collection, pendingState: 'other' })).toThrow(
      'pendingState "other"',
    )
    expect(() => persistShapes(editor, { collection, live: -1 })).toThrow(RangeError)
    expect(() => persistShapes({} as ShapeEditor, { collection })).toThrow(
      'persistShapes: needs an editor made by createShapeEditor',
    )
    graph.destroy()
  })
})
