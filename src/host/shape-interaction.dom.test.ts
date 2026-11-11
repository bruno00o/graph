import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stateRow } from '../core/state-buffers'
import { defineGraph } from '../define-graph'
import { mountMapGraph } from '../map'
import { nodes } from '../marks'
import { shapes } from '../shapes'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
import type {
  GraphDefinition,
  Mark,
  ShapeGeometry,
  ShapeMark,
  StateKindStyles,
  StateStyle,
  TimeValue,
} from '../types'
import type { ElementKeys, GraphTarget } from './events'
import { takeSnapshot } from './export-source'
import type { GraphShapeCount } from './graph-instance'
import { createGraphHost, type GraphInstance, type MountGraphOptions } from './mount-graph'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Zone {
  readonly id: string
  readonly geometry: ShapeGeometry
  readonly rank?: number
  readonly zoom?: number
  readonly time?: TimeValue
}

const items: Item[] = [
  { id: 'a', x: -200, y: -150 },
  { id: 'b', x: 0, y: 0 },
]

const zones: Zone[] = [
  { id: 'left', geometry: { x: -300, y: -200, width: 200, height: 100 } },
  { id: 'ring', geometry: { center: { x: 250, y: 200 }, radius: 50, inner: 25 } },
  {
    id: 'line',
    geometry: {
      points: [
        { x: -300, y: 150 },
        { x: -100, y: 150 },
      ],
    },
  },
  { id: 'frame', geometry: { x: 0, y: 100, width: 100, height: 50 } },
  { id: 'ghost', geometry: { x: 100, y: -200, width: 200, height: 100 } },
]

type Styles = Readonly<Record<string, StateStyle | StateKindStyles>>

let dom: FakeDom

function zoneMarks(): Mark[] {
  const plain = zones.filter((zone) => zone.id !== 'frame' && zone.id !== 'ghost')
  return [
    shapes(plain),
    shapes(
      zones.filter((zone) => zone.id === 'frame'),
      { pick: 'stroke' },
    ),
    shapes(
      zones.filter((zone) => zone.id === 'ghost'),
      { pick: false },
    ),
  ]
}

function mount(
  marks: readonly Mark[] = zoneMarks(),
  states: Styles = {},
  options: Partial<MountGraphOptions> = {},
): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const definition = defineGraph({
    marks: [...marks, nodes(items, { x: 'x', y: 'y' })],
    states,
    interaction: { lasso: true },
  }) as GraphDefinition
  const graph = createGraphHost(
    container,
    { definition, ariaLabel: 'graph', initialView: { x: 0, y: 0, zoom: 1 }, ...options },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  return graph
}

function at(x: number, y: number) {
  return { x: x + 400, y: y + 300 }
}

function keyOf(target: GraphTarget | null): string | null {
  return target ? `${target.kind}:${String(target.key)}` : null
}

function pointer(graph: GraphInstance, type: string, x: number, y: number, init = {}): void {
  const point = at(x, y)
  graph.element.querySelector('canvas')?.dispatchEvent(
    new PointerEvent(type, {
      clientX: point.x,
      clientY: point.y,
      button: 0,
      pointerId: 1,
      bubbles: true,
      ...init,
    }),
  )
}

function click(graph: GraphInstance, x: number, y: number, init = {}): void {
  pointer(graph, 'pointerdown', x, y, init)
  pointer(graph, 'pointerup', x, y, init)
  dom.flushFrames()
}

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('picking shapes', () => {
  it('picks nodes, then shapes, by fill and by stroke as the pick option says', () => {
    const graph = mount()
    const pick = (x: number, y: number) => keyOf(graph.pick(at(x, y)))
    expect(pick(-200, -150)).toBe('node:a')
    expect(pick(-280, -120)).toBe('shape:left')
    expect(pick(-100, -150)).toBe('shape:left')
    expect(pick(-97, -150)).toBe('shape:left')
    expect(pick(-94, -150)).toBeNull()
    expect(pick(250, 160)).toBe('shape:ring')
    expect(pick(250, 200)).toBeNull()
    expect(pick(-200, 152)).toBe('shape:line')
    expect(pick(-200, 158)).toBeNull()
    expect(pick(50, 125)).toBeNull()
    expect(pick(50, 101)).toBe('shape:frame')
    expect(pick(200, -150)).toBeNull()
    expect(graph.pick(at(-280, -120))).toEqual({
      kind: 'shape',
      key: 'left',
      datum: zones[0],
      mark: undefined,
    })
  })

  it('picks the shape drawn last, and a raised one first', () => {
    const graph = mount([
      shapes(
        [
          { id: 'under', geometry: { x: -50, y: -50, width: 100, height: 100 }, rank: 0 },
          { id: 'over', geometry: { x: 0, y: -50, width: 100, height: 100 }, rank: 1 },
        ],
        { order: 'rank' },
      ),
    ])
    expect(keyOf(graph.pick(at(25, 30)))).toBe('shape:over')
    graph.selection.set({ shapes: ['under'] })
    dom.flushFrames()
    expect(keyOf(graph.pick(at(25, 30)))).toBe('shape:under')
  })

  it('leaves out of picking the shapes with no fill, no stroke, or a pick of false', () => {
    const graph = mount([
      shapes([{ id: 'bare', geometry: { x: -50, y: -50, width: 100, height: 100 } }], {
        fill: null,
        stroke: null,
      }),
    ])
    expect(graph.pick(at(-50, 0))).toBeNull()
    expect(graph.pick(at(0, 30))).toBeNull()
  })
})

describe('shape events and selection', () => {
  it('hovers, clicks and selects shapes, with a modifier to add, and clears on the background', () => {
    const graph = mount()
    const events: string[] = []
    graph.on('pointerenter', ({ target }) => events.push(`enter ${keyOf(target)}`))
    graph.on('pointerleave', ({ target }) => events.push(`leave ${keyOf(target)}`))
    graph.on('click', ({ target }) => events.push(`click ${keyOf(target)}`))
    const selections: ElementKeys[] = []
    graph.on('selectionchange', ({ selection }) => selections.push(selection))
    pointer(graph, 'pointermove', -280, -120)
    dom.flushFrames()
    expect(keyOf(graph.store.get().hovered)).toBe('shape:left')
    expect(graph.element.querySelector('canvas')?.style.cursor).toBe('pointer')
    click(graph, -280, -120)
    click(graph, -200, 151, { shiftKey: true })
    click(graph, -200, -150, { metaKey: true })
    expect(graph.selection.get()).toEqual({ nodes: ['a'], edges: [], shapes: ['left', 'line'] })
    click(graph, -280, -120, { ctrlKey: true })
    expect(graph.selection.get()).toEqual({ nodes: ['a'], edges: [], shapes: ['line'] })
    click(graph, 0, 250)
    expect(graph.selection.get()).toEqual({ nodes: [], edges: [], shapes: [] })
    expect(events).toContain('enter shape:left')
    expect(events).toContain('click shape:left')
    expect(events).toContain('leave shape:left')
    expect(selections[0]).toEqual({ nodes: [], edges: [], shapes: ['left'] })
  })

  it('clears selected shapes with Escape and never focuses a shape', () => {
    const graph = mount()
    click(graph, -280, -120)
    expect(graph.selection.get().shapes).toEqual(['left'])
    graph.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    dom.flushFrames()
    expect(graph.selection.get().shapes).toEqual([])
    graph.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    dom.flushFrames()
    expect(graph.store.get().focused?.kind).toBe('node')
  })

  it('pans when a shape is dragged, and does nothing on a double click', () => {
    const graph = mount()
    const view = graph.view.get()
    pointer(graph, 'pointerdown', -280, -120)
    pointer(graph, 'pointermove', -250, -100)
    pointer(graph, 'pointerup', -250, -100)
    dom.flushFrames()
    expect(graph.view.get()).not.toEqual(view)
    expect(graph.selection.get().shapes).toEqual([])
    const moved = graph.view.get()
    const point = at(-280, -120)
    graph.element
      .querySelector('canvas')
      ?.dispatchEvent(
        new MouseEvent('dblclick', { clientX: point.x, clientY: point.y, bubbles: true }),
      )
    dom.flushFrames()
    expect(graph.view.get()).toEqual(moved)
  })

  it('takes into a lasso the shapes wholly inside it, starting on a shape or on the background', () => {
    const graph = mount()
    const lasso = (corners: readonly (readonly [number, number])[]) => {
      const [start = [0, 0]] = corners
      pointer(graph, 'pointerdown', start[0], start[1], { shiftKey: true })
      for (const [x, y] of corners.slice(1)) {
        pointer(graph, 'pointermove', x, y, { shiftKey: true })
      }
      pointer(graph, 'pointerup', start[0], start[1] + 1, { shiftKey: true })
      dom.flushFrames()
    }
    lasso([
      [-320, -210],
      [-80, -210],
      [-80, 170],
      [-320, 170],
    ])
    expect(graph.selection.get()).toEqual({ nodes: ['a'], edges: [], shapes: ['left', 'line'] })
    graph.selection.clear()
    lasso([
      [-120, -110],
      [-90, -110],
      [-90, 170],
      [-320, 170],
      [-320, 130],
      [-120, 130],
    ])
    expect(graph.selection.get()).toEqual({ nodes: [], edges: [], shapes: ['line'] })
    graph.selection.clear()
    lasso([
      [-290, -190],
      [-120, -190],
      [-120, -110],
      [-290, -110],
    ])
    expect(graph.selection.get()).toEqual({ nodes: ['a'], edges: [], shapes: [] })
  })

  it('reads the item of a shape, and its membership in a state', () => {
    const graph = mount(zoneMarks(), { lit: { stroke: 'red' } })
    expect(graph.datumOf({ kind: 'shape', key: 'ring' })).toBe(zones[1])
    expect(graph.datumOf({ kind: 'shape', key: 'missing' })).toBeUndefined()
    graph.states.set('lit', { shapes: ['ring'], nodes: ['a'] })
    expect(graph.states.has('lit', { kind: 'shape', key: 'ring' })).toBe(true)
    expect(graph.states.has('lit', { kind: 'shape', key: 'left' })).toBe(false)
    expect(graph.states.get('lit')).toEqual({ nodes: ['a'], edges: [], shapes: ['ring'] })
    expect(graph.store.get().states['lit']).toEqual({ nodes: ['a'], edges: [], shapes: ['ring'] })
  })

  it('keeps shapes out of the keys of a graph without a shape mark', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({
          marks: [nodes(items, { x: 'x', y: 'y' })],
          states: { lit: { stroke: 'red' } },
        }),
        ariaLabel: 'graph',
      },
      () => fakeRenderer(),
    )
    dom.flushFrames()
    graph.selection.set({ nodes: ['a'], shapes: ['left'] })
    graph.states.set('lit', { shapes: ['left'] })
    expect(graph.selection.get()).toStrictEqual({ nodes: ['a'], edges: [] })
    expect(graph.store.get().states['lit']).toStrictEqual({ nodes: [], edges: [] })
    graph.selection.clear()
    expect(graph.selection.get()).toStrictEqual({ nodes: [], edges: [] })
  })

  it('adds and drops the shape keys when the definition gains or loses its shape mark', () => {
    const graph = mount()
    click(graph, -280, -120)
    const plain = defineGraph({ marks: [nodes(items, { x: 'x', y: 'y' })] })
    graph.update({ definition: plain as GraphDefinition })
    dom.flushFrames()
    expect(graph.selection.get()).toStrictEqual({ nodes: [], edges: [] })
    graph.update({
      definition: defineGraph({
        marks: [...zoneMarks(), nodes(items, { x: 'x', y: 'y' })],
      }) as GraphDefinition,
    })
    dom.flushFrames()
    expect(graph.selection.get()).toStrictEqual({ nodes: [], edges: [], shapes: [] })
  })

  it('asks for shape selections in controlled mode and applies the answer', () => {
    const changes: ElementKeys[] = []
    const graph = mount(
      zoneMarks(),
      {},
      {
        selection: { shapes: ['ring'] },
        onSelectionChange: ({ selection }) => changes.push(selection),
      },
    )
    expect(graph.selection.get()).toEqual({ nodes: [], edges: [], shapes: ['ring'] })
    click(graph, -280, -120)
    expect(changes).toEqual([{ nodes: [], edges: [], shapes: ['left'] }])
    expect(graph.selection.get().shapes).toEqual(['ring'])
    graph.update({ selection: { shapes: ['left'] } })
    expect(graph.selection.get().shapes).toEqual(['left'])
  })

  it('drops the hover of a shape that its layer hides', () => {
    const graph = mount([
      shapes(zones.slice(0, 1), { layer: 'ground' }) as ShapeMark<Zone, undefined, string>,
    ])
    pointer(graph, 'pointermove', -280, -120)
    dom.flushFrames()
    expect(keyOf(graph.store.get().hovered)).toBe('shape:left')
    graph.layers.hide(['ground'])
    dom.flushFrames()
    expect(graph.store.get().hovered).toBeNull()
    expect(graph.pick(at(-280, -120))).toBeNull()
    expect(graph.count().shown).toMatchObject({ shapes: 0 })
    graph.layers.show(['ground'])
    dom.flushFrames()
    expect(keyOf(graph.pick(at(-280, -120)))).toBe('shape:left')
  })
})

describe('shape states, zoom and time', () => {
  it('hides the members of a state with hide, everywhere', () => {
    const graph = mount(zoneMarks(), { gone: { hide: true } })
    expect(graph.count().shown).toMatchObject({ shapes: 5 })
    graph.states.set('gone', { shapes: ['left'] })
    dom.flushFrames()
    expect(graph.pick(at(-280, -120))).toBeNull()
    expect(graph.count().shown).toMatchObject({ shapes: 4 })
  })

  it('styles the shapes outside a state with others, from members of any kind', () => {
    const graph = mount(zoneMarks(), { lit: { others: { opacity: 0.2 } } })
    const others = () => takeSnapshot(graph).states.others('shapes')
    expect(others()).toBe(0)
    graph.states.set('lit', { nodes: ['a'] })
    dom.flushFrames()
    expect(others()).not.toBe(0)
    graph.states.set('lit', { shapes: ['ring'] })
    dom.flushFrames()
    expect(others()).not.toBe(0)
    graph.states.clear('lit')
    dom.flushFrames()
    expect(others()).toBe(0)
  })

  it('hides the shapes outside a state of nodes with others.hide, and styles shapes apart', () => {
    const graph = mount(zoneMarks(), {
      only: { others: { hide: true } },
      lit: { nodes: { stroke: '#ff0000' }, shapes: { stroke: '#00ff00', strokeWidth: 5 } },
    })
    graph.states.set('only', { nodes: ['b'] })
    dom.flushFrames()
    expect(graph.pick(at(-280, -120))).toBeNull()
    expect(graph.count().shown).toMatchObject({ shapes: 0, nodes: 1 })
    graph.states.set('only', { nodes: ['b'], shapes: ['left'] })
    dom.flushFrames()
    expect(keyOf(graph.pick(at(-280, -120)))).toBe('shape:left')
    const snapshot = takeSnapshot(graph)
    const bit = 4
    const palette = snapshot.scene.palette
    expect(snapshot.states.paint[stateRow('shapes', bit, true) * 4 + 1]).toBe(palette.id('#00ff00'))
    expect(snapshot.states.numbers[stateRow('shapes', bit, true) * 4 + 1]).toBe(5)
    expect(snapshot.states.paint[stateRow('nodes', bit, true) * 4 + 1]).toBe(palette.id('#ff0000'))
    expect(snapshot.states.paint[stateRow('shapes', 0, true) * 4 + 1]).not.toBe(0xffffffff)
    expect(snapshot.states.shapeRaise & 0b11).toBe(0b11)
  })

  it('shows and picks a shape only inside its zoom range and its time', () => {
    const graph = mount([
      shapes(
        [
          { id: 'near', geometry: { x: -50, y: -50, width: 100, height: 100 }, zoom: 2 },
          { id: 'then', geometry: { x: 200, y: -50, width: 100, height: 100 }, time: 10 },
        ],
        { minZoom: (zone) => zone.zoom ?? null, time: (zone) => zone.time ?? null },
      ),
    ])
    expect(graph.pick(at(-40, 0))).toBeNull()
    expect(graph.count().shown).toMatchObject({ shapes: 1 })
    graph.view.set({ x: 0, y: 0, zoom: 4 })
    dom.flushFrames()
    expect(keyOf(graph.pick({ x: 400 - 160, y: 300 }))).toBe('shape:near')
    expect(graph.count().shown).toMatchObject({ shapes: 2 })
    graph.view.set({ x: 0, y: 0, zoom: 1 })
    graph.time.set({ start: 0, end: 5 })
    dom.flushFrames()
    expect(graph.pick(at(250, 0))).toBeNull()
    graph.time.set({ start: 5, end: 20 })
    dom.flushFrames()
    expect(keyOf(graph.pick(at(250, 0)))).toBe('shape:then')
  })
})

describe('shapes pinned to nodes', () => {
  interface Pin {
    readonly id: string
    readonly geometry: ShapeGeometry
    readonly node: string
  }

  const pins: Pin[] = [
    { id: 'by-b', geometry: { x: -20, y: 30, width: 40, height: 20 }, node: 'b' },
    { id: 'by-c', geometry: { center: { x: 0, y: 0 }, radius: 30, inner: 20 }, node: 'c' },
  ]

  const pinMarks = (): Mark[] => [shapes(pins, { node: 'node' })]
  const countOf = (graph: GraphInstance) => graph.count() as GraphShapeCount

  it('picks a pinned shape where its node is drawn, and follows the node', () => {
    const graph = mount(pinMarks())
    const pick = (x: number, y: number) => keyOf(graph.pick(at(x, y)))
    expect(pick(0, 40)).toBe('shape:by-b')
    expect(pick(0, -40)).toBeNull()
    graph.positions.set([['b', { x: 100, y: -100 }]], { duration: 0 })
    dom.flushFrames()
    expect(pick(0, 40)).toBeNull()
    expect(pick(100, -60)).toBe('shape:by-b')
  })

  it('leaves a waiting shape out until its node arrives', () => {
    const graph = mount(pinMarks())
    expect(countOf(graph).pendingShapes).toBe(1)
    expect(countOf(graph).shown.shapes).toBe(1)
    graph.view.fit({ shapes: ['by-c'] })
    dom.flushFrames()
    expect(graph.view.get()).toEqual({ x: 0, y: 0, zoom: 1 })
    graph.update({
      definition: defineGraph({
        marks: [...pinMarks(), nodes([...items, { id: 'c', x: 300, y: 0 }], { x: 'x', y: 'y' })],
        interaction: { lasso: true },
      }) as GraphDefinition,
    })
    dom.flushFrames()
    expect(countOf(graph).pendingShapes).toBe(0)
    expect(countOf(graph).shown.shapes).toBe(2)
    expect(keyOf(graph.pick(at(300, 25)))).toBe('shape:by-c')
    expect(graph.pick(at(300, 12))).not.toEqual(expect.objectContaining({ kind: 'shape' }))
    graph.view.fit({ shapes: ['by-c'] })
    dom.flushFrames()
    expect(graph.view.get().x).toBeCloseTo(300)
    expect(graph.view.get().y).toBeCloseTo(0)
  })

  it('hides a pinned shape while its node is hidden', () => {
    const graph = mount(pinMarks(), { gone: { hide: true } })
    graph.states.set('gone', { nodes: ['b'] })
    dom.flushFrames()
    expect(graph.pick(at(0, 40))).toBeNull()
    expect(countOf(graph).shown.shapes).toBe(0)
    graph.states.set('gone', {})
    dom.flushFrames()
    expect(keyOf(graph.pick(at(0, 40)))).toBe('shape:by-b')
  })

  it('takes a pinned shape into a lasso where it is drawn', () => {
    const graph = mount(pinMarks())
    const corners = [
      [-30, 20],
      [30, 20],
      [30, 60],
      [-30, 60],
    ] as const
    pointer(graph, 'pointerdown', -30, 20, { shiftKey: true })
    for (const [x, y] of corners.slice(1)) pointer(graph, 'pointermove', x, y, { shiftKey: true })
    pointer(graph, 'pointerup', -30, 21, { shiftKey: true })
    dom.flushFrames()
    expect(graph.selection.get()).toEqual({ nodes: [], edges: [], shapes: ['by-b'] })
  })
})

describe('shapes on a map', () => {
  it('never picks a shape', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { map } = fakeMap()
    const graph = mountMapGraph(map, {
      definition: defineGraph({ marks: zoneMarks() }) as GraphDefinition,
      ariaLabel: 'map',
    })
    dom.flushFrames()
    expect(graph.pick(at(-280, -120))).toBeNull()
    graph.destroy()
  })
})
