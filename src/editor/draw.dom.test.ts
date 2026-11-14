import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { mountMapGraph } from '../map'
import { nodes } from '../marks'
import { shapes } from '../shapes'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
import type { GraphDefinition, ShapeGeometry } from '../types'
import { createShapeEditor, type ShapeEditorOptions } from './editor'
import { applyShapeEdits, type ShapeEdit } from './edits'
import { mountShapeEditor } from './view'

interface Zone {
  readonly id: string
  readonly geometry: ShapeGeometry
  readonly order?: number
  readonly tag?: string
}

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly parent?: string
}

let dom: FakeDom
let zones: Zone[]
let items: Item[]
let background = false

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

function definition(): GraphDefinition {
  return defineGraph({
    marks: [
      shapes(zones, { name: 'zones', order: 'order' }),
      nodes<Item>(items, { x: 'x', y: 'y', parent: 'parent' }),
    ],
    interaction: { select: 'multiple', keyboard: true },
    background: background ? { grid: 'lines', spacing: 10, adaptive: false } : null,
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

function pointer(
  graph: GraphInstance,
  type: string,
  x: number,
  y: number,
  init: PointerEventInit = {},
): void {
  canvasOf(graph).dispatchEvent(
    new PointerEvent(type, {
      clientX: x + 400,
      clientY: y + 300,
      button: 0,
      pointerId: 1,
      pointerType: 'mouse',
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  )
}

function stroke(
  graph: GraphInstance,
  points: readonly (readonly [number, number])[],
  init: PointerEventInit = {},
): void {
  const [first] = points
  if (!first) return
  pointer(graph, 'pointermove', first[0], first[1], init)
  pointer(graph, 'pointerdown', first[0], first[1], init)
  for (const [x, y] of points.slice(1)) pointer(graph, 'pointermove', x, y, init)
  const last = points[points.length - 1] ?? first
  pointer(graph, 'pointerup', last[0], last[1], init)
  dom.flushFrames()
}

function click(graph: GraphInstance, x: number, y: number, init: PointerEventInit = {}): void {
  stroke(graph, [[x, y]], init)
}

function key(graph: GraphInstance, name: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  graph.element.dispatchEvent(event)
  dom.flushFrames()
  return event.defaultPrevented
}

function editorOf(graph: GraphInstance, options: ShapeEditorOptions = {}) {
  let count = 0
  const editor = createShapeEditor(graph, { newKey: () => `new${++count}`, ...options })
  mountShapeEditor(editor)
  const batches: ShapeEdit[][] = []
  editor.on('edit', ({ edits }) => {
    batches.push([...edits])
  })
  return { editor, batches }
}

function apply(graph: GraphInstance, edits: readonly ShapeEdit[]): void {
  zones = applyShapeEdits(zones, edits, { mark: 'zones' })
  graph.update({ definition: definition() })
  dom.flushFrames()
}

function last(batches: readonly ShapeEdit[][]): ShapeEdit | undefined {
  return batches.at(-1)?.[0]
}

function sketch(graph: GraphInstance): string {
  const layer = graph.element.querySelector('svg[data-shape-editor]')
  return layer?.lastElementChild?.getAttribute('d') ?? ''
}

function selected(graph: GraphInstance): readonly unknown[] {
  return (graph.selection.get() as { readonly shapes?: readonly unknown[] }).shapes ?? []
}

beforeEach(() => {
  dom = installDom()
  zones = [{ id: 'box', geometry: { x: -250, y: -200, width: 100, height: 100 }, tag: 'kept' }]
  items = [{ id: 'n', x: 200, y: 150 }]
  background = false
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  dom.restore()
})

describe('drawing tools', () => {
  it('draws a rectangle by dragging, selects it and waits for its data', () => {
    const graph = mount()
    const { editor, batches } = editorOf(graph, { tool: 'rectangle' })
    expect(editor.store.state.tool).toBe('rectangle')
    pointer(graph, 'pointermove', 0, 0)
    expect(canvasOf(graph).style.cursor).toBe('crosshair')
    stroke(graph, [
      [0, 0],
      [50, 20],
      [100, 50],
    ])
    expect(batches).toEqual([
      [
        {
          type: 'add',
          key: 'new1',
          mark: 'zones',
          geometry: { x: 0, y: 0, width: 100, height: 50 },
          tool: 'rectangle',
        },
      ],
    ])
    expect(editor.store.state.pending).toEqual(['new1'])
    expect(editor.store.state.drawing).toBeNull()
    expect(selected(graph)).toEqual(['new1'])
    const layer = graph.element.querySelector('svg[data-shape-editor] g')
    expect(layer?.childElementCount).toBe(1)
    apply(graph, batches[0] ?? [])
    expect(editor.store.state.pending).toEqual([])
    expect(editor.store.state.selected).toEqual(['new1'])
    expect(graph.pick({ x: 450, y: 325 })?.key).toBe('new1')
    graph.destroy()
  })

  it('draws a rectangle with two clicks, a square with Shift, and snaps to a grid', () => {
    const graph = mount()
    const { editor, batches } = editorOf(graph, { tool: 'rectangle', snap: { grid: 10 } })
    click(graph, 3, 2)
    expect(editor.store.state.drawing).toEqual({ tool: 'rectangle', points: 1 })
    expect(batches).toEqual([])
    pointer(graph, 'pointermove', 60, 30)
    dom.flushFrames()
    expect(sketch(graph)).toContain('M 400 300 L 460 300 L 460 330')
    click(graph, 62, 31, { shiftKey: true })
    expect(last(batches)).toMatchObject({ geometry: { x: 0, y: 0, width: 60, height: 60 } })
    graph.destroy()
  })

  it('draws a circle from its center, by drag or by two clicks', () => {
    const graph = mount()
    const { editor, batches } = editorOf(graph, { tool: 'circle' })
    stroke(graph, [
      [0, 0],
      [30, 0],
      [30, 40],
    ])
    expect(last(batches)).toMatchObject({ geometry: { center: { x: 0, y: 0 }, radius: 50 } })
    click(graph, 100, 100)
    click(graph, 100, 120)
    expect(last(batches)).toMatchObject({ geometry: { center: { x: 100, y: 100 }, radius: 20 } })
    expect(editor.store.state.drawing).toBeNull()
    graph.destroy()
  })

  it('draws a polygon point by point and ends it with Enter, a double click or its first point', () => {
    items = [
      { id: 'g', x: 0, y: 0 },
      { id: 'c', x: 0, y: 0, parent: 'g' },
    ]
    const graph = mount()
    const { editor, batches } = editorOf(graph, { tool: 'polygon' })
    const doubles: unknown[] = []
    graph.on('doubleclick', (event) => doubles.push(event))
    click(graph, 0, 0)
    click(graph, 100, 0)
    expect(editor.store.state.drawing).toEqual({ tool: 'polygon', points: 2 })
    expect(key(graph, 'Enter')).toBe(false)
    click(graph, 100, 100)
    expect(key(graph, 'Enter')).toBe(true)
    expect(last(batches)).toMatchObject({
      type: 'add',
      tool: 'polygon',
      geometry: {
        rings: [
          [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
          ],
        ],
      },
    })
    click(graph, 0, 0)
    click(graph, 50, 0)
    click(graph, 50, 50)
    click(graph, 0, 50)
    click(graph, 0, 50)
    canvasOf(graph).dispatchEvent(
      new MouseEvent('dblclick', { clientX: 400, clientY: 350, bubbles: true }),
    )
    expect(doubles).toEqual([])
    expect(graph.groups.folded()).toEqual([])
    expect(batches).toHaveLength(2)
    expect(
      (last(batches) as unknown as { geometry: { rings: unknown[][] } }).geometry.rings[0],
    ).toHaveLength(4)
    click(graph, 200, 0)
    click(graph, 300, 0)
    click(graph, 300, 100)
    click(graph, 201, 1)
    expect(batches).toHaveLength(3)
    expect(
      (last(batches) as unknown as { geometry: { rings: unknown[][] } }).geometry.rings[0],
    ).toHaveLength(3)
    graph.destroy()
  })

  it('takes back points with Backspace and cancels with Escape', () => {
    const graph = mount()
    const { editor, batches } = editorOf(graph, { tool: 'polygon' })
    click(graph, 0, 0)
    click(graph, 100, 0)
    expect(key(graph, 'Backspace')).toBe(true)
    expect(editor.store.state.drawing).toEqual({ tool: 'polygon', points: 1 })
    expect(key(graph, 'z', { metaKey: true })).toBe(true)
    expect(editor.store.state.drawing).toBeNull()
    click(graph, 0, 0)
    click(graph, 100, 0)
    expect(key(graph, 'Escape')).toBe(true)
    expect(editor.store.state.drawing).toBeNull()
    expect(sketch(graph)).toBe('')
    expect(batches).toEqual([])
    graph.destroy()
  })

  it('draws a line by dragging, or point by point with angles held by Shift', () => {
    const graph = mount()
    const { batches } = editorOf(graph, { tool: 'line' })
    stroke(graph, [
      [0, 0],
      [40, 10],
      [80, 0],
    ])
    expect(last(batches)).toMatchObject({
      type: 'add',
      tool: 'line',
      geometry: {
        points: [
          { x: 0, y: 0 },
          { x: 80, y: 0 },
        ],
      },
    })
    click(graph, 0, 100)
    click(graph, 100, 103, { shiftKey: true })
    key(graph, 'Enter')
    const line = last(batches) as unknown as { geometry: { points: { x: number; y: number }[] } }
    expect(line.geometry.points[1]?.y).toBeCloseTo(100, 9)
    expect(line.geometry.points[1]?.x).toBeCloseTo(Math.hypot(100, 3), 9)
    graph.destroy()
  })

  it('draws freehand, simplified, closed when its ends meet', () => {
    const graph = mount()
    const { batches } = editorOf(graph, { tool: 'freehand' })
    const circle: [number, number][] = []
    for (let step = 0; step <= 200; step++) {
      const turn = (step / 200) * 2 * Math.PI
      circle.push([Math.cos(turn) * 100, Math.sin(turn) * 100])
    }
    stroke(graph, circle)
    const closed = last(batches) as unknown as {
      tool: string
      geometry: { rings: { x: number }[][] }
    }
    expect(closed.tool).toBe('freehand')
    const ring = closed.geometry.rings[0] ?? []
    expect(ring.length).toBeGreaterThan(10)
    expect(ring.length).toBeLessThan(150)
    const line: [number, number][] = []
    for (let x = 0; x <= 200; x += 1) line.push([x, x < 100 ? 0 : 0.2])
    stroke(graph, line)
    const open = last(batches) as unknown as { geometry: { points: { x: number; y: number }[] } }
    expect(open.geometry.points).toHaveLength(2)
    expect(open.geometry.points[1]?.x).toBe(200)
    expect(open.geometry.points[1]?.y).toBeCloseTo(0.2, 9)
    expect(batches).toHaveLength(2)
    click(graph, 10, 10)
    expect(batches).toHaveLength(2)
    graph.destroy()
  })

  it('leaves the press to the graph with Space held or another button', () => {
    const graph = mount()
    const { batches } = editorOf(graph, { tool: 'rectangle' })
    const view = graph.view.get()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
    stroke(graph, [
      [0, 0],
      [50, 50],
    ])
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' }))
    expect(graph.view.get()).not.toEqual(view)
    stroke(
      graph,
      [
        [0, 0],
        [50, 50],
      ],
      { button: 2 },
    )
    expect(batches).toEqual([])
    graph.destroy()
  })

  it('snaps to the background grid shown at the zoom', () => {
    background = true
    const graph = mount()
    const { editor, batches } = editorOf(graph, { tool: 'rectangle', snap: { grid: 'background' } })
    stroke(graph, [
      [4, 6],
      [33, 52],
    ])
    expect(last(batches)).toMatchObject({ geometry: { x: 0, y: 10, width: 30, height: 40 } })
    apply(graph, batches.at(-1) ?? [])
    editor.setTool('select')
    stroke(graph, [
      [-200, -150],
      [-190, -150],
      [-163, -133],
    ])
    expect(last(batches)).toMatchObject({
      key: 'box',
      geometry: { x: -210, y: -180, width: 100, height: 100 },
    })
    graph.destroy()
  })

  it('warns once when the background grid it snaps to is missing, and again after it was there', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mount()
    const { editor } = editorOf(graph, { snap: { grid: 'background' } })
    const warned = () => warn.mock.calls.filter(([text]) => String(text).includes('snap.grid'))
    expect(warned()).toHaveLength(1)
    expect(String(warned()[0]?.[0])).toContain('no background grid')
    dom.flushFrames()
    editor.update({ snap: { grid: 'background', angle: 30 } })
    graph.update({ definition: definition() })
    dom.flushFrames()
    expect(warned()).toHaveLength(1)
    background = true
    graph.update({ definition: definition() })
    dom.flushFrames()
    expect(warned()).toHaveLength(1)
    background = false
    graph.update({ definition: definition() })
    dom.flushFrames()
    expect(warned()).toHaveLength(2)
    graph.destroy()
  })

  it('warns when the snap option or the definition starts to need the background', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mount()
    const { editor } = editorOf(graph, { snap: { grid: 10 } })
    const warned = () => warn.mock.calls.filter(([text]) => String(text).includes('snap.grid'))
    editor.update({ snap: { grid: 'background' } })
    expect(warned()).toHaveLength(1)
    editor.update({ snap: { grid: 5 } })
    editor.update({ snap: {} })
    expect(warned()).toHaveLength(1)
    editor.update({ snap: { grid: 'background' } })
    expect(warned()).toHaveLength(2)
    graph.destroy()
  })

  it('stays quiet with a background grid, a spacing, or no snap, and in production', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    background = true
    const grid = mount()
    editorOf(grid, { snap: { grid: 'background' } })
    const plain = mount()
    plain.element.remove()
    grid.destroy()
    plain.destroy()
    const spaced = mount()
    editorOf(spaced, { snap: { grid: 20 } })
    spaced.destroy()
    background = false
    const none = mount()
    editorOf(none)
    none.destroy()
    expect(warn.mock.calls.filter(([text]) => String(text).includes('snap.grid'))).toEqual([])
    vi.resetModules()
    vi.doMock('../dev', () => ({ dev: false }))
    const host = await import('../host/mount-graph')
    const { createShapeEditor: production } = await import('./editor')
    const { defineGraph: define } = await import('../define-graph')
    const container = document.createElement('div')
    document.body.append(container)
    const graph = host.createGraphHost(
      container,
      { definition: define({ marks: [] }) as GraphDefinition, ariaLabel: 'graph' },
      fakeRenderer,
    )
    production(graph, { snap: { grid: 'background' } })
    dom.flushFrames()
    expect(warn.mock.calls.filter(([text]) => String(text).includes('snap.grid'))).toEqual([])
    graph.destroy()
    vi.doUnmock('../dev')
  })

  it('warns on a map, which has no background grid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const map = fakeMap()
    const graph = mountMapGraph(map.map, {
      definition: defineGraph({
        marks: [shapes([] as Zone[], { name: 'zones' })],
        background: { grid: 'lines' },
      }) as GraphDefinition,
      ariaLabel: 'map',
    })
    map.render()
    dom.flushFrames()
    editorOf(graph, { snap: { grid: 'background' } })
    const warned = warn.mock.calls.filter(([text]) => String(text).includes('snap.grid'))
    expect(warned).toHaveLength(1)
    expect(String(warned[0]?.[0])).toContain('on a map')
    graph.destroy()
  })

  it('sends drawn shapes to the mark it is given, the first editable one by default', () => {
    const graph = mount()
    const { editor, batches } = editorOf(graph, { tool: 'circle', marks: ['other', 'zones'] })
    click(graph, 0, 0)
    click(graph, 10, 0)
    expect(last(batches)?.mark).toBe('other')
    editor.update({ newMark: 'zones' })
    click(graph, 0, 0)
    click(graph, 10, 0)
    expect(last(batches)?.mark).toBe('zones')
    graph.destroy()
  })

  it('throws on an unknown tool or a bad option', () => {
    const graph = mount()
    expect(() => createShapeEditor(graph, { history: -1 })).toThrow(RangeError)
    expect(() => createShapeEditor(graph, { snap: { grid: -1 } })).toThrow(RangeError)
    expect(() => createShapeEditor(graph, { tool: 'brush' as 'line' })).toThrow(TypeError)
    const editor = createShapeEditor(graph)
    expect(() => editor.setTool('brush' as 'line')).toThrow(TypeError)
    editor.setTool('line')
    expect(editor.store.state.tool).toBe('line')
    editor.update({ hold: 5 })
    expect(editor.store.state.tool).toBe('line')
    editor.update({ tool: 'polygon' })
    expect(editor.store.state.tool).toBe('polygon')
    graph.destroy()
  })

  it('writes GeoJSON and places in degrees on a map', () => {
    const map = fakeMap()
    const graph = mountMapGraph(map.map, {
      definition: defineGraph({
        marks: [shapes([] as Zone[], { name: 'zones' })],
      }) as GraphDefinition,
      ariaLabel: 'map',
    })
    map.render()
    dom.flushFrames()
    const { editor, batches } = editorOf(graph, { tool: 'rectangle' })
    const a = graph.view.toScreen({ x: 256, y: 256 })
    const b = graph.view.toScreen({ x: 260, y: 252 })
    const send = (type: string, point: { x: number; y: number }) => {
      const init = { clientX: point.x, clientY: point.y, pointerId: 1, button: 0 }
      map.canvas.dispatchEvent(new PointerEvent(type, { ...init, bubbles: true }))
    }
    send('pointermove', a)
    send('pointerdown', a)
    expect(map.fake.dragPan.enabled).toBe(false)
    send('pointermove', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    send('pointermove', b)
    send('pointerup', b)
    dom.flushFrames()
    const polygon = last(batches) as unknown as {
      geometry: { type: string; coordinates: number[][][] }
    }
    expect(polygon.geometry.type).toBe('Polygon')
    const ring = polygon.geometry.coordinates[0] ?? []
    expect(ring).toHaveLength(5)
    expect(ring[4]).toEqual(ring[0])
    expect(ring[0]?.[0]).toBeCloseTo(0, 6)
    expect(ring[0]?.[1]).toBeCloseTo(0, 6)
    editor.setTool('circle')
    send('pointermove', a)
    send('pointerdown', a)
    send('pointerup', a)
    send('pointermove', b)
    send('pointerdown', b)
    send('pointerup', b)
    dom.flushFrames()
    const circle = last(batches) as unknown as {
      geometry: { center: { longitude: number; latitude: number }; radius: number }
    }
    expect(circle.geometry.center.longitude).toBeCloseTo(0, 6)
    expect(circle.geometry.radius).toBeGreaterThan(400_000)
    expect(circle.geometry.radius).toBeLessThan(500_000)
    graph.destroy()
  })
})

describe('duplicate, order, undo and redo', () => {
  it('duplicates the selection 16 pixels away, with its fields, and selects the copies', () => {
    const graph = mount()
    const { editor, batches } = editorOf(graph)
    click(graph, -200, -150)
    expect(key(graph, 'd', { metaKey: true })).toBe(true)
    expect(batches[0]).toEqual([
      {
        type: 'add',
        key: 'new1',
        mark: 'zones',
        geometry: { x: -234, y: -184, width: 100, height: 100 },
        datum: zones[0],
      },
    ])
    expect(selected(graph)).toEqual(['new1'])
    apply(graph, batches[0] ?? [])
    expect(zones[1]).toEqual({
      id: 'new1',
      geometry: { x: -234, y: -184, width: 100, height: 100 },
      tag: 'kept',
    })
    expect(editor.store.state.selected).toEqual(['new1'])
    graph.destroy()
  })

  it('raises and lowers shapes by their order field', () => {
    zones = [
      { id: 'a', geometry: { x: 0, y: 0, width: 10, height: 10 }, order: 2 },
      { id: 'b', geometry: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'c', geometry: { x: 0, y: 0, width: 10, height: 10 }, order: 5 },
    ]
    const graph = mount()
    const { editor, batches } = editorOf(graph)
    editor.raise(['b'])
    expect(batches[0]).toEqual([
      { type: 'change', key: 'b', mark: 'zones', datum: zones[1], order: 6 },
    ])
    apply(graph, batches[0] ?? [])
    expect(zones[1]).toMatchObject({ id: 'b', order: 6 })
    editor.raise(['b'])
    expect(batches).toHaveLength(1)
    editor.lower(['c', 'b'])
    expect(batches[1]?.map((edit) => [edit.key, edit.type === 'change' && edit.order])).toEqual([
      ['c', 0],
      ['b', 1],
    ])
    graph.destroy()
  })

  it('undoes and redoes its own edits, and skips the ones changed since', () => {
    const graph = mount()
    const { editor, batches } = editorOf(graph)
    stroke(graph, [
      [-200, -150],
      [-180, -150],
      [-170, -150],
    ])
    apply(graph, batches[0] ?? [])
    expect(editor.store.state.canUndo).toBe(true)
    expect(key(graph, 'z', { ctrlKey: true })).toBe(true)
    expect(last(batches)).toMatchObject({
      type: 'change',
      key: 'box',
      geometry: { x: -250, y: -200, width: 100, height: 100 },
    })
    apply(graph, batches.at(-1) ?? [])
    expect(editor.store.state).toMatchObject({ canUndo: false, canRedo: true })
    expect(key(graph, 'z', { ctrlKey: true, shiftKey: true })).toBe(true)
    expect(last(batches)).toMatchObject({ geometry: { x: -220, y: -200 } })
    apply(graph, batches.at(-1) ?? [])
    expect(editor.store.state).toMatchObject({ canUndo: true, canRedo: false })
    zones = zones.map((zone) => ({ ...zone, geometry: { x: 0, y: 0, width: 5, height: 5 } }))
    graph.update({ definition: definition() })
    dom.flushFrames()
    expect(editor.store.state.canUndo).toBe(false)
    const count = batches.length
    editor.undo()
    expect(batches).toHaveLength(count)
    graph.destroy()
  })

  it('undoes a removal with the key and the item, and a drawing with a removal', () => {
    const graph = mount()
    const { editor, batches } = editorOf(graph)
    click(graph, -200, -150)
    key(graph, 'Delete')
    apply(graph, batches[0] ?? [])
    expect(zones).toEqual([])
    editor.undo()
    expect(last(batches)).toEqual({
      type: 'add',
      key: 'box',
      mark: 'zones',
      geometry: { x: -250, y: -200, width: 100, height: 100 },
      datum: { id: 'box', geometry: { x: -250, y: -200, width: 100, height: 100 }, tag: 'kept' },
    })
    apply(graph, batches.at(-1) ?? [])
    expect(zones).toEqual([
      { id: 'box', geometry: { x: -250, y: -200, width: 100, height: 100 }, tag: 'kept' },
    ])
    editor.setTool('rectangle')
    stroke(graph, [
      [0, 0],
      [20, 20],
    ])
    apply(graph, batches.at(-1) ?? [])
    editor.undo()
    expect(last(batches)).toMatchObject({ type: 'remove', key: 'new1' })
    apply(graph, batches.at(-1) ?? [])
    expect(zones.map((zone) => zone.id)).toEqual(['box'])
    graph.destroy()
  })

  it('keeps no history with history 0, and caps it', () => {
    const graph = mount()
    const { editor, batches } = editorOf(graph, { history: 0 })
    click(graph, -200, -150)
    key(graph, 'ArrowRight')
    apply(graph, batches[0] ?? [])
    expect(editor.store.state.canUndo).toBe(false)
    expect(key(graph, 'z', { metaKey: true })).toBe(false)
    editor.update({ history: 2 })
    for (let step = 0; step < 4; step++) {
      key(graph, 'ArrowRight')
      apply(graph, batches.at(-1) ?? [])
    }
    editor.undo()
    apply(graph, batches.at(-1) ?? [])
    editor.undo()
    apply(graph, batches.at(-1) ?? [])
    expect(editor.store.state.canUndo).toBe(false)
    expect(zones[0]?.geometry).toMatchObject({ x: -247 })
    graph.destroy()
  })
})
