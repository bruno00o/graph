import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geoToWorld } from '../core/geo'
import { defineGraph } from '../define-graph'
import { grid } from '../layouts'
import { mapSurface, mountMapGraph } from '../map'
import { edges, groups, nodes } from '../marks'
import { resolvedOf } from '../resolved-definition'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap, globeInput } from '../testing/map'
import type { Key, Point, SpreadOptions } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

interface Item {
  readonly id: string
  readonly x?: number
  readonly y?: number
  readonly zone?: string
  readonly units?: 'screen' | 'world'
}

interface Place {
  readonly id: string
  readonly lng?: number
  readonly lat?: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const stacked: Item[] = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 0, y: 0 },
  { id: 'c', x: 0, y: 0 },
  { id: 'd', x: 400, y: 0 },
]

interface Look {
  readonly spread?: boolean | SpreadOptions | null
  readonly units?: 'screen' | 'world'
  readonly layout?: boolean
  readonly zones?: boolean
}

function itemGraph(list: readonly Item[], look: Look = {}, links: readonly Link[] = []) {
  return defineGraph({
    marks: [
      nodes(list, { x: 'x', y: 'y', size: 10, units: look.units ?? 'screen' }),
      ...(look.zones
        ? [
            groups(
              list.filter((item) => item.zone !== undefined),
              { by: 'zone', name: 'zones', size: 30 },
            ),
          ]
        : []),
      edges(links, { source: 'from', target: 'to' }),
    ],
    spread: look.spread === undefined ? true : look.spread,
    layout: look.layout ? grid() : null,
    view: { autoFit: 'never' },
  })
}

let dom: FakeDom

beforeEach(() => {
  dom = installDom()
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

function mount(definition: ReturnType<typeof itemGraph>): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(container, { definition, ariaLabel: 'graph' }, () =>
    fakeRenderer(),
  ) as unknown as GraphInstance
  graph.view.set({ x: 0, y: 0, zoom: 1 })
  dom.flushFrames()
  return graph
}

function screenOf(graph: GraphInstance, key: Key): Point {
  const position = graph.positions.get(key)
  if (!position) throw new Error(`no position for ${String(key)}`)
  return graph.view.toScreen(position)
}

function gaps(graph: GraphInstance, keys: readonly Key[]): number[] {
  const points = keys.map((key) => screenOf(graph, key))
  const found: number[] = []
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) {
      const p = points[a] as Point
      const q = points[b] as Point
      found.push(Math.hypot(p.x - q.x, p.y - q.y))
    }
  }
  return found
}

function drag(target: EventTarget, from: Point, to: Point): void {
  const event = { clientX: from.x, clientY: from.y, button: 0, pointerId: 1, bubbles: true }
  target.dispatchEvent(new PointerEvent('pointerdown', event))
  target.dispatchEvent(
    new PointerEvent('pointermove', {
      ...event,
      clientX: (from.x + to.x) / 2,
      clientY: (from.y + to.y) / 2,
    }),
  )
  target.dispatchEvent(new PointerEvent('pointermove', { ...event, clientX: to.x, clientY: to.y }))
  target.dispatchEvent(new PointerEvent('pointerup', { ...event, clientX: to.x, clientY: to.y }))
}

function canvasOf(graph: GraphInstance): HTMLCanvasElement {
  return graph.element.querySelector('canvas') as HTMLCanvasElement
}

describe('the spread option', () => {
  it('resolves to null by default and to a gap of 4 with true', () => {
    const marks = [nodes(stacked, { x: 'x', y: 'y' })]
    expect(resolvedOf(defineGraph({ marks })).spread).toBeNull()
    expect(resolvedOf(defineGraph({ marks, spread: false })).spread).toBeNull()
    expect(resolvedOf(defineGraph({ marks, spread: true })).spread).toEqual({ gap: 4 })
    expect(resolvedOf(defineGraph({ marks, spread: { gap: 0 } })).spread).toEqual({ gap: 0 })
    expect(() => defineGraph({ marks, spread: { gap: -1 } })).toThrow(RangeError)
    expect(() => defineGraph({ marks, spread: { gap: Number.NaN } })).toThrow(RangeError)
    expect(() => defineGraph({ marks, spread: { gap: Number.POSITIVE_INFINITY } })).toThrow(
      RangeError,
    )
  })
})

describe('spreading the nodes outside groups at one place', () => {
  it('leaves the nodes at one place stacked without the option', () => {
    const graph = mount(itemGraph(stacked, { spread: null }))
    for (const key of ['a', 'b', 'c']) expect(graph.positions.get(key)).toEqual({ x: 0, y: 0 })
    graph.destroy()
  })

  it('moves the nodes at one place apart on screen and keeps their gaps while zooming', () => {
    const graph = mount(itemGraph(stacked))
    for (const gap of gaps(graph, ['a', 'b', 'c'])) expect(gap).toBeCloseTo(14, 3)
    expect(graph.positions.get('d')).toEqual({ x: 400, y: 0 })
    for (const zoom of [3, 0.25, 7]) {
      graph.view.set({ x: 0, y: 0, zoom })
      dom.flushFrames()
      for (const gap of gaps(graph, ['a', 'b', 'c'])) expect(gap).toBeCloseTo(14, 3)
    }
    const middle = ['a', 'b', 'c'].map((key) => graph.positions.get(key) as Point)
    expect(middle.reduce((sum, point) => sum + point.x, 0) / 3).toBeCloseTo(0, 6)
    expect(middle.reduce((sum, point) => sum + point.y, 0) / 3).toBeCloseTo(0, 6)
    graph.destroy()
  })

  it('widens the space with gap and spreads in world units for nodes sized in world units', () => {
    const wide = mount(itemGraph(stacked, { spread: { gap: 10 } }))
    for (const gap of gaps(wide, ['a', 'b', 'c'])) expect(gap).toBeCloseTo(20, 3)
    wide.destroy()
    const world = mount(itemGraph(stacked, { units: 'world' }))
    const before = world.positions.snapshot()
    world.view.set({ x: 0, y: 0, zoom: 4 })
    dom.flushFrames()
    expect(world.positions.snapshot()).toEqual(before)
    for (const gap of gaps(world, ['a', 'b', 'c'])) expect(gap).toBeCloseTo(56, 3)
    world.destroy()
  })

  it('emits no position change and puts the nodes back when the option is removed', () => {
    const graph = mount(itemGraph(stacked))
    const changes: unknown[] = []
    graph.on('positionchange', (event) => changes.push(event))
    graph.view.set({ x: 0, y: 0, zoom: 4 })
    dom.flushFrames()
    graph.update({ definition: itemGraph(stacked, { spread: null }) })
    dom.flushFrames()
    for (const key of ['a', 'b', 'c']) expect(graph.positions.get(key)).toEqual({ x: 0, y: 0 })
    graph.update({ definition: itemGraph(stacked) })
    dom.flushFrames()
    for (const gap of gaps(graph, ['a', 'b', 'c'])) expect(gap).toBeCloseTo(14, 3)
    graph.update({ definition: itemGraph(stacked, { spread: { gap: 10 } }) })
    dom.flushFrames()
    for (const gap of gaps(graph, ['a', 'b', 'c'])) expect(gap).toBeCloseTo(20, 3)
    expect(changes).toEqual([])
    graph.destroy()
  })

  it('spreads a node that arrives at the place and closes the ranks when one leaves', () => {
    const graph = mount(itemGraph(stacked))
    graph.update({ definition: itemGraph([...stacked, { id: 'e', x: 0, y: 0 }]) })
    dom.flushFrames()
    expect(Math.min(...gaps(graph, ['a', 'b', 'c', 'e']))).toBeCloseTo(14, 3)
    graph.update({ definition: itemGraph(stacked.filter((item) => item.id !== 'b')) })
    dom.flushFrames()
    const [gap = 0] = gaps(graph, ['a', 'c'])
    expect(gap).toBeCloseTo(14, 3)
    graph.update({ definition: itemGraph(stacked.filter((item) => item.id === 'a')) })
    dom.flushFrames()
    expect(graph.positions.get('a')).toEqual({ x: 0, y: 0 })
    graph.destroy()
  })

  it('moves a node with its data and spreads it at its new place', () => {
    const graph = mount(itemGraph(stacked))
    const moved = stacked.map((item) => (item.id === 'c' ? { ...item, x: 400, y: 0 } : item))
    graph.update({ definition: itemGraph(moved) })
    dom.flushFrames()
    const [ab = 0] = gaps(graph, ['a', 'b'])
    expect(ab).toBeCloseTo(14, 3)
    const [cd = 0] = gaps(graph, ['c', 'd'])
    expect(cd).toBeCloseTo(14, 3)
    graph.destroy()
  })

  it('detaches a dragged node, keeps it where it is dropped and closes the ranks', () => {
    const graph = mount(itemGraph(stacked))
    const start = screenOf(graph, 'a')
    expect(graph.pick(start)?.key).toBe('a')
    drag(canvasOf(graph), start, { x: start.x + 100, y: start.y })
    dom.flushFrames()
    const dropped = graph.positions.get('a')
    expect(screenOf(graph, 'a').x).toBeCloseTo(start.x + 100, 3)
    const [gap = 0] = gaps(graph, ['b', 'c'])
    expect(gap).toBeCloseTo(14, 3)
    graph.view.set({ x: 0, y: 0, zoom: 3 })
    dom.flushFrames()
    expect(graph.positions.get('a')).toEqual(dropped)
    graph.update({
      definition: itemGraph(stacked.map((item) => (item.id === 'a' ? { ...item, y: 1 } : item))),
    })
    dom.flushFrames()
    graph.update({ definition: itemGraph(stacked) })
    dom.flushFrames()
    for (const gap of gaps(graph, ['a', 'b', 'c'])) expect(gap).toBeCloseTo(14, 3)
    graph.destroy()
  })

  it('detaches a node placed by positions.set and takes it back with positions.reset', () => {
    const graph = mount(itemGraph(stacked))
    graph.positions.set([['b', { x: 100, y: 100 }]])
    dom.flushFrames()
    expect(graph.positions.get('b')).toEqual({ x: 100, y: 100 })
    const [gap = 0] = gaps(graph, ['a', 'c'])
    expect(gap).toBeCloseTo(14, 3)
    graph.positions.reset(['b'], { duration: 0 })
    dom.flushFrames()
    for (const gap of gaps(graph, ['a', 'b', 'c'])) expect(gap).toBeCloseTo(14, 3)
    graph.destroy()
  })

  it('never lets a layout move a spread node', async () => {
    const graph = mount(itemGraph(stacked, { layout: true }))
    const before = graph.positions.snapshot()
    await graph.layout.run(grid(), { duration: 0 })
    dom.flushFrames()
    for (const key of ['a', 'b', 'c']) expect(graph.positions.get(key)).toEqual(before.get(key))
    graph.destroy()
  })

  it('leaves the members of groups to their container', () => {
    const list: Item[] = [
      { id: 'a', x: 0, y: 0, zone: 'z' },
      { id: 'b', x: 0, y: 0, zone: 'z' },
      { id: 'c', x: 0, y: 0 },
      { id: 'd', x: 0, y: 0 },
    ]
    const graph = mount(itemGraph(list, { zones: true }))
    const [gap = 0] = gaps(graph, ['c', 'd'])
    expect(gap).toBeCloseTo(14, 3)
    expect(graph.positions.get('a')).toEqual({ x: 0, y: 0 })
    graph.groups.unfold([graph.groups.keyOf('zones', 'z')])
    dom.flushFrames()
    const [members = 0] = gaps(graph, ['a', 'b'])
    expect(members).toBeCloseTo(14, 3)
    graph.destroy()
  })
})

describe('placing nodes without a position near the nodes placed by the data', () => {
  it('places a node next to its neighbor at the same distance on screen at any zoom', () => {
    const list: Item[] = [{ id: 'a', x: 5000, y: 5000 }, { id: 'b' }]
    const links = [{ id: 'ab', from: 'a', to: 'b' }]
    const near = (zoom: number) => {
      const container = document.createElement('div')
      document.body.append(container)
      const graph = createGraphHost(
        container,
        {
          definition: itemGraph(list, { spread: null }, links),
          ariaLabel: 'graph',
          view: { x: 5000, y: 5000, zoom },
        },
        () => fakeRenderer(),
      ) as unknown as GraphInstance
      dom.flushFrames()
      const [gap = 0] = gaps(graph, ['a', 'b'])
      graph.destroy()
      return gap
    }
    const close = near(1)
    expect(close).toBeGreaterThan(20)
    expect(close).toBeLessThan(60)
    expect(near(0.01)).toBeCloseTo(close, 3)
  })
})

describe('on a map', () => {
  const places: Place[] = [
    { id: 'p1', lng: 2.35, lat: 48.86 },
    { id: 'p2', lng: 2.35, lat: 48.86 },
    { id: 'p3', lng: 2.35, lat: 48.86 },
    { id: 'p4', lng: 13.4, lat: 52.52 },
    { id: 'q' },
  ]
  const links: Link[] = [{ id: 'p4q', from: 'p4', to: 'q' }]

  function placeGraph(spread: boolean) {
    return defineGraph({
      marks: [
        nodes(places, { longitude: 'lng', latitude: 'lat', size: 10 }),
        edges(links, { source: 'from', target: 'to' }),
      ],
      spread,
      transitions: { layout: 0 },
    })
  }

  it('spreads the nodes at one place and keeps their gaps through zoom', () => {
    const { map, render, camera } = fakeMap()
    const graph = mountMapGraph(map, { definition: placeGraph(true), ariaLabel: 'map' })
    render()
    const keys = ['p1', 'p2', 'p3']
    for (const zoom of [4, 6, 2.5, 11]) {
      camera.zoom = zoom
      render()
      for (const gap of gaps(graph as unknown as GraphInstance, keys)) {
        expect(gap).toBeCloseTo(14, 1)
      }
    }
    for (const key of keys) {
      const at = screenOf(graph as unknown as GraphInstance, key)
      expect(graph.pick(at)?.key).toBe(key)
    }
    graph.destroy()
  })

  it('keeps the gaps on the globe', () => {
    const { map, render, camera } = fakeMap()
    const graph = mountMapGraph(map, { definition: placeGraph(true), ariaLabel: 'map' })
    render(globeInput(camera.lng, camera.lat, camera.zoom))
    render(globeInput(camera.lng, camera.lat, camera.zoom))
    const apart = gaps(graph as unknown as GraphInstance, ['p1', 'p2', 'p3'])
    expect(Math.min(...apart)).toBeGreaterThan(12.5)
    expect(Math.min(...apart)).toBeLessThan(15.5)
    graph.destroy()
  })

  it('spreads on both surfaces when the graph moves onto the map and back', () => {
    const { map, render, camera } = fakeMap()
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      { definition: placeGraph(true), ariaLabel: 'graph' },
      () => fakeRenderer(),
    ) as unknown as GraphInstance
    const paris = geoToWorld({ longitude: 2.35, latitude: 48.86 })
    graph.view.set({ x: paris.x, y: paris.y, zoom: 4 })
    dom.flushFrames()
    const keys = ['p1', 'p2', 'p3']
    for (const gap of gaps(graph, keys)) expect(gap).toBeCloseTo(14, 3)
    graph.update({ surface: mapSurface(map) })
    camera.zoom = 6
    render()
    render()
    for (const gap of gaps(graph, keys)) expect(gap).toBeCloseTo(14, 1)
    graph.update({ surface: null })
    dom.flushFrames()
    for (const gap of gaps(graph, keys)) expect(gap).toBeCloseTo(14, 3)
    graph.destroy()
  })

  it('places a node without coordinates near its neighbor from the first data', () => {
    const { map, render } = fakeMap()
    const graph = mountMapGraph(map, { definition: placeGraph(false), ariaLabel: 'map' })
    render()
    const [gap = 0] = gaps(graph as unknown as GraphInstance, ['p4', 'q'])
    expect(gap).toBeGreaterThan(20)
    expect(gap).toBeLessThan(60)
    const { x, y } = geoToWorld({ longitude: 13.4, latitude: 52.52 })
    const q = graph.positions.get('q') as Point
    expect(Math.hypot(q.x - x, q.y - y)).toBeLessThan(5)
    graph.destroy()
  })
})
