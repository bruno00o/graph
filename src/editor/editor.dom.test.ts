import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { internalsOf } from '../host/internals'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { mountMapGraph } from '../map'
import { nodes } from '../marks'
import { shapes } from '../shapes'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
import type { GraphDefinition, Key, SelectMode, ShapeGeometry } from '../types'
import { createShapeEditor, type ShapeEditor } from './editor'
import { applyShapeEdits, type ShapeEdit } from './edits'
import { mountShapeEditor } from './view'

interface Zone {
  readonly id: string
  readonly geometry: ShapeGeometry
  readonly node?: string
}

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

const items: Item[] = [{ id: 'n', x: 200, y: 150 }]

function startZones(): Zone[] {
  return [
    { id: 'box', geometry: { x: -250, y: -200, width: 100, height: 100 } },
    {
      id: 'tri',
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
}

const pinned: Zone[] = [
  { id: 'pin', node: 'n', geometry: { x: -20, y: -20, width: 40, height: 40 } },
]

let dom: FakeDom
let zones: Zone[]

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

function definition(select: SelectMode = 'multiple'): GraphDefinition {
  return defineGraph({
    marks: [
      shapes(zones, { name: 'zones' }),
      shapes(pinned, { name: 'pinned', node: 'node' }),
      nodes<Item>(items, { x: 'x', y: 'y' }),
    ],
    interaction: { select, keyboard: true },
  }) as GraphDefinition
}

function mount(select: SelectMode = 'multiple'): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: definition(select), ariaLabel: 'graph', initialView: { x: 0, y: 0, zoom: 1 } },
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

function drag(
  graph: GraphInstance,
  from: readonly [number, number],
  to: readonly [number, number],
  init: PointerEventInit = {},
): void {
  pointer(graph, 'pointermove', from[0], from[1], init)
  pointer(graph, 'pointerdown', from[0], from[1], init)
  pointer(graph, 'pointermove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, init)
  pointer(graph, 'pointermove', to[0], to[1], init)
  pointer(graph, 'pointerup', to[0], to[1], init)
  dom.flushFrames()
}

function click(graph: GraphInstance, x: number, y: number, init: PointerEventInit = {}): void {
  pointer(graph, 'pointermove', x, y, init)
  pointer(graph, 'pointerdown', x, y, init)
  pointer(graph, 'pointerup', x, y, init)
  dom.flushFrames()
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

function editsOf(editor: ShapeEditor): ShapeEdit[][] {
  const batches: ShapeEdit[][] = []
  editor.on('edit', ({ edits }) => {
    batches.push([...edits])
  })
  return batches
}

function apply(graph: GraphInstance, edits: readonly ShapeEdit[]): void {
  zones = applyShapeEdits(zones, edits, { mark: 'zones' })
  graph.update({ definition: definition() })
  dom.flushFrames()
}

function geometryOf(key: Key): unknown {
  return zones.find((zone) => zone.id === key)?.geometry
}

function drafted(graph: GraphInstance, key: Key): boolean {
  const internals = internalsOf(graph, 'test')
  const record = internals.shape(key)
  return record !== null && internals.scene.shapes.draft[record.index] === 1
}

function previews(graph: GraphInstance): string[] {
  const layer = graph.element.querySelector('svg[data-shape-editor]')
  return [...(layer?.querySelectorAll('g > path') ?? [])].map(
    (path) => path.getAttribute('d') ?? '',
  )
}

function layerPath(graph: GraphInstance, index: number): string {
  const layer = graph.element.querySelector('svg[data-shape-editor]')
  return layer?.children[index]?.getAttribute('d') ?? ''
}

beforeEach(() => {
  dom = installDom()
  zones = startZones()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  dom.restore()
})

describe('createShapeEditor', () => {
  it('selects and moves a shape, then waits for its data', () => {
    const graph = mount()
    const editor = createShapeEditor(graph)
    mountShapeEditor(editor)
    const batches = editsOf(editor)
    const events: string[] = []
    for (const name of ['click', 'dragstart', 'viewchange'] as const) {
      graph.on(name, () => events.push(name))
    }
    pointer(graph, 'pointermove', -200, -150)
    expect(canvasOf(graph).style.cursor).toBe('move')
    pointer(graph, 'pointerdown', -200, -150)
    expect(graph.selection.get().shapes).toEqual(['box'])
    pointer(graph, 'pointermove', -190, -150)
    pointer(graph, 'pointermove', -170, -140)
    dom.flushFrames()
    expect(editor.store.state.gesture).toEqual({ type: 'move', keys: ['box'] })
    expect(drafted(graph, 'box')).toBe(true)
    expect(previews(graph)).toEqual(['M 180 110 L 280 110 L 280 210 L 180 210 Z'])
    pointer(graph, 'pointerup', -170, -140)
    dom.flushFrames()
    expect(batches).toEqual([
      [
        {
          type: 'change',
          key: 'box',
          mark: 'zones',
          datum: zones[0],
          geometry: { x: -220, y: -190, width: 100, height: 100 },
        },
      ],
    ])
    expect(events).toEqual([])
    expect(editor.store.state).toEqual({ selected: ['box'], gesture: null, pending: ['box'] })
    expect(drafted(graph, 'box')).toBe(true)
    apply(graph, batches[0] ?? [])
    expect(editor.store.state.pending).toEqual([])
    expect(drafted(graph, 'box')).toBe(false)
    expect(previews(graph)).toEqual([])
    expect(graph.pick({ x: 160, y: 105 })).toBeNull()
    expect(graph.pick({ x: 200, y: 150 })?.key).toBe('box')
    graph.destroy()
  })

  it('emits editlost when the data does not change within hold', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const graph = mount()
    const editor = createShapeEditor(graph, { hold: 500 })
    const lost: ShapeEdit[] = []
    editor.on('editlost', ({ edits }) => lost.push(...edits))
    drag(graph, [-200, -150], [-150, -150])
    expect(editor.store.state.pending).toEqual(['box'])
    vi.advanceTimersByTime(499)
    expect(lost).toEqual([])
    vi.advanceTimersByTime(1)
    expect(lost.map((edit) => edit.key)).toEqual(['box'])
    expect(editor.store.state.pending).toEqual([])
    dom.flushFrames()
    expect(drafted(graph, 'box')).toBe(false)
    graph.destroy()
  })

  it('clicks select, Shift adds and removes, a click on a selected shape keeps only it', () => {
    const graph = mount()
    const editor = createShapeEditor(graph)
    const clicks: Key[] = []
    graph.on('click', ({ target }) => {
      if (target) clicks.push(target.key)
    })
    click(graph, -200, -150)
    click(graph, 150, -150, { shiftKey: true })
    expect(editor.store.state.selected).toEqual(['box', 'tri'])
    click(graph, 150, -150, { shiftKey: true })
    expect(editor.store.state.selected).toEqual(['box'])
    click(graph, 150, -150, { shiftKey: true })
    click(graph, -200, -150)
    expect(editor.store.state.selected).toEqual(['box'])
    expect(clicks).toEqual(['box', 'tri', 'tri', 'tri', 'box'])
    click(graph, 0, 250)
    expect(editor.store.state.selected).toEqual([])
    graph.destroy()
  })

  it('moves every selected shape together', () => {
    const graph = mount()
    const editor = createShapeEditor(graph)
    const batches = editsOf(editor)
    click(graph, -200, -150)
    click(graph, 150, -150, { shiftKey: true })
    drag(graph, [150, -150], [160, -140])
    expect(batches[0]?.map((edit) => edit.key)).toEqual(['box', 'tri'])
    apply(graph, batches[0] ?? [])
    expect(geometryOf('box')).toEqual({ x: -240, y: -190, width: 100, height: 100 })
    expect(geometryOf('tri')).toEqual({
      rings: [
        [
          { x: 60, y: -190 },
          { x: 260, y: -190 },
          { x: 160, y: -40 },
        ],
      ],
    })
    graph.destroy()
  })

  it('moves, adds and removes points of a selected path', () => {
    const graph = mount()
    const editor = createShapeEditor(graph)
    mountShapeEditor(editor)
    const batches = editsOf(editor)
    click(graph, 150, -150)
    expect(layerPath(graph, 3)).toContain('M446 96h8v8h-8Z')
    drag(graph, [250, -200], [270, -210])
    expect(batches.at(-1)?.[0]).toMatchObject({
      geometry: {
        rings: [
          [
            { x: 50, y: -200 },
            { x: 270, y: -210 },
            { x: 150, y: -50 },
          ],
        ],
      },
    })
    apply(graph, batches.at(-1) ?? [])
    drag(graph, [100, -125], [80, -110])
    apply(graph, batches.at(-1) ?? [])
    expect(geometryOf('tri')).toEqual({
      rings: [
        [
          { x: 50, y: -200 },
          { x: 270, y: -210 },
          { x: 150, y: -50 },
          { x: 80, y: -110 },
        ],
      ],
    })
    click(graph, 80, -110, { altKey: true })
    apply(graph, batches.at(-1) ?? [])
    expect(geometryOf('tri')).toEqual({
      rings: [
        [
          { x: 50, y: -200 },
          { x: 270, y: -210 },
          { x: 150, y: -50 },
        ],
      ],
    })
    click(graph, 150, -50, { altKey: true })
    expect(batches).toHaveLength(3)
    graph.destroy()
  })

  it('resizes from a corner, keeping the ratio with Shift', () => {
    const graph = mount()
    const editor = createShapeEditor(graph)
    const batches = editsOf(editor)
    click(graph, -200, -150)
    expect(canvasOf(graph).style.cursor).toBe('move')
    pointer(graph, 'pointermove', -150, -100)
    expect(canvasOf(graph).style.cursor).toBe('nwse-resize')
    drag(graph, [-150, -100], [-100, -80])
    expect(batches.at(-1)?.[0]).toMatchObject({
      geometry: { x: -250, y: -200, width: 150, height: 120 },
    })
    apply(graph, batches.at(-1) ?? [])
    drag(graph, [-100, -80], [-25, -60], { shiftKey: true })
    expect(batches.at(-1)?.[0]).toMatchObject({
      geometry: { x: -250, y: -200, width: 225, height: 180 },
    })
    graph.destroy()
  })

  it('removes with Delete, moves with the arrows and cancels with Escape', () => {
    const graph = mount()
    const editor = createShapeEditor(graph)
    const batches = editsOf(editor)
    graph.element.focus()
    key(graph, 'ArrowRight')
    expect(graph.store.state.focused?.key).toBe('n')
    expect(batches).toEqual([])
    click(graph, -200, -150)
    expect(key(graph, 'ArrowRight', { shiftKey: true })).toBe(true)
    expect(batches.at(-1)?.[0]).toMatchObject({
      geometry: { x: -240, y: -200, width: 100, height: 100 },
    })
    apply(graph, batches.at(-1) ?? [])
    pointer(graph, 'pointermove', -200, -150)
    pointer(graph, 'pointerdown', -200, -150)
    pointer(graph, 'pointermove', -150, -150)
    expect(editor.store.state.gesture?.type).toBe('move')
    expect(key(graph, 'Escape')).toBe(true)
    expect(editor.store.state.gesture).toBeNull()
    pointer(graph, 'pointerup', -150, -150)
    dom.flushFrames()
    expect(batches).toHaveLength(1)
    expect(key(graph, 'Delete')).toBe(true)
    expect(batches.at(-1)).toEqual([{ type: 'remove', key: 'box', mark: 'zones', datum: zones[0] }])
    expect(editor.store.state.selected).toEqual([])
    expect(drafted(graph, 'box')).toBe(true)
    apply(graph, batches.at(-1) ?? [])
    expect(zones.map((zone) => zone.id)).toEqual(['tri'])
    expect(graph.selection.get().shapes).toEqual([])
    graph.destroy()
  })

  it('edits only the marks it is given, and leaves the rest to the graph', () => {
    const graph = mount()
    const editor = createShapeEditor(graph, { marks: ['pinned'] })
    const batches = editsOf(editor)
    const starts: string[] = []
    graph.on('viewchange', () => starts.push('view'))
    drag(graph, [-200, -150], [-150, -150])
    expect(batches).toEqual([])
    expect(starts).toContain('view')
    graph.view.set({ x: 0, y: 0, zoom: 1 })
    dom.flushFrames()
    drag(graph, [190, 140], [200, 150])
    expect(batches[0]?.[0]).toMatchObject({
      key: 'pin',
      mark: 'pinned',
      geometry: { x: -10, y: -10, width: 40, height: 40 },
    })
    graph.destroy()
  })

  it('moves without selecting when the graph does not select', () => {
    const graph = mount(false)
    const editor = createShapeEditor(graph)
    const batches = editsOf(editor)
    drag(graph, [-200, -150], [-190, -150])
    expect(graph.selection.get().shapes).toEqual([])
    expect(batches[0]?.[0]?.key).toBe('box')
    graph.destroy()
  })

  it('allows one editor per graph, and stops with its graph', () => {
    const graph = mount()
    const editor = createShapeEditor(graph)
    const view = mountShapeEditor(editor)
    expect(() => createShapeEditor(graph)).toThrow(/an editor already/)
    editor.destroy()
    view.destroy()
    const next = createShapeEditor(graph)
    const layer = mountShapeEditor(next)
    expect(layer.element.isConnected).toBe(true)
    graph.destroy()
    expect(layer.element.isConnected).toBe(false)
    expect(next.store.state.gesture).toBeNull()
    next.remove()
    next.cancel()
    next.update({ hold: 1 })
    next.destroy()
    expect(() => createShapeEditor(graph).destroy()).not.toThrow()
  })

  it('writes degrees back on a map, with the closing point', () => {
    const map = fakeMap()
    let areas = [
      {
        id: 'area',
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 0],
            ],
          ],
        },
      },
    ]
    const graph = mountMapGraph(map.map, {
      definition: defineGraph({ marks: [shapes(areas)] }) as GraphDefinition,
      ariaLabel: 'map',
    })
    map.render()
    dom.flushFrames()
    const editor = createShapeEditor(graph)
    const batches = editsOf(editor)
    const inside = graph.view.toScreen({ x: 256 + 5, y: 256 - 3 })
    expect(graph.pick(inside)?.key).toBe('area')
    const send = (type: string, dx: number) => {
      const init = { clientX: inside.x + dx, clientY: inside.y, pointerId: 1, button: 0 }
      map.canvas.dispatchEvent(new PointerEvent(type, { ...init, bubbles: true }))
    }
    send('pointermove', 0)
    send('pointerdown', 0)
    expect(map.fake.dragPan.enabled).toBe(false)
    send('pointermove', 10)
    send('pointermove', 20)
    send('pointerup', 20)
    dom.flushFrames()
    expect(map.fake.dragPan.enabled).toBe(true)
    const edit = batches[0]?.[0]
    expect(edit?.type).toBe('change')
    const ring = (edit?.type === 'change' ? edit.geometry : null) as unknown as {
      readonly coordinates: number[][][]
    }
    expect(ring.coordinates[0]).toHaveLength(4)
    expect(ring.coordinates[0]?.[3]).toEqual(ring.coordinates[0]?.[0])
    expect(ring.coordinates[0]?.[0]?.[0]).toBeGreaterThan(0)
    areas = applyShapeEdits(areas, batches[0] ?? [])
    expect(areas[0]?.geometry.type).toBe('Polygon')
    graph.destroy()
  })
})
