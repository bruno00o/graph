import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PickIndex } from '../core/pick-index'
import { defineGraph } from '../define-graph'
import { grid } from '../layouts'
import { mountMapGraph } from '../map'
import { groups, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap, globeInput } from '../testing/map'
import type { Key, Point } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'
import { perFrameLimit } from './spread'

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

interface Item {
  readonly id: string
  readonly zone: string
  readonly x: number
  readonly y: number
  readonly size?: number
  readonly units?: 'screen' | 'world'
}

interface Place {
  readonly id: string
  readonly area: string
  readonly lng: number
  readonly lat: number
}

interface Look {
  readonly units?: 'screen' | 'world'
  readonly spread?: boolean
  readonly gap?: number
  readonly layout?: boolean
  readonly hide?: boolean
}

const stacked: Item[] = [
  { id: 'a', zone: 'z', x: 0, y: 0 },
  { id: 'b', zone: 'z', x: 0, y: 0 },
  { id: 'c', zone: 'z', x: 0, y: 0 },
  { id: 'd', zone: 'z', x: 400, y: 0 },
]

const places: Place[] = [
  { id: 'p1', area: 'west', lng: 2.35, lat: 48.86 },
  { id: 'p2', area: 'west', lng: 2.35, lat: 48.86 },
  { id: 'p3', area: 'west', lng: 2.35, lat: 48.86 },
  { id: 'p4', area: 'west', lng: 2.35, lat: 48.86 },
  { id: 'p5', area: 'east', lng: 13.4, lat: 52.52 },
]

const reduced = { matches: false }

function itemGraph(list: readonly Item[], look: Look = {}) {
  return defineGraph({
    marks: [
      nodes(list, {
        x: 'x',
        y: 'y',
        name: 'items',
        size: (item) => item.size ?? 10,
        units: look.units ?? 'screen',
      }),
      groups(list, {
        by: 'zone',
        name: 'zones',
        size: 30,
        container: { spread: look.spread, gap: look.gap },
      }),
    ],
    layout: look.layout ? grid() : null,
    states: { gone: { hide: true } },
    view: { autoFit: 'never' },
  })
}

function placeGraph(list: readonly Place[]) {
  return defineGraph({
    marks: [
      nodes(list, { longitude: 'lng', latitude: 'lat', name: 'places', size: 10 }),
      groups(list, { by: 'area', name: 'areas', size: 30 }),
    ],
    layout: null,
    transitions: { layout: 0 },
  })
}

let dom: FakeDom

beforeEach(() => {
  dom = installDom()
  reduced.matches = false
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return reduced.matches
    },
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

function unfold(graph: GraphInstance, name: string, value: string): Key {
  const key = graph.groups.keyOf(name, value)
  graph.groups.unfold([key])
  dom.flushFrames()
  return key
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

describe('spreading the members of an unfolded group', () => {
  it('moves the members at one place apart on screen and keeps their gaps while zooming', () => {
    const graph = mount(itemGraph(stacked))
    expect(graph.positions.get('a')).toEqual({ x: 0, y: 0 })
    unfold(graph, 'zones', 'z')
    const apart = gaps(graph, ['a', 'b', 'c'])
    for (const gap of apart) expect(gap).toBeCloseTo(14, 3)
    expect(screenOf(graph, 'a').y).toBeLessThan(screenOf(graph, 'b').y)
    expect(graph.positions.get('d')).toEqual({ x: 400, y: 0 })
    for (const zoom of [3, 0.25, 7]) {
      graph.view.set({ x: 0, y: 0, zoom })
      dom.flushFrames()
      for (const gap of gaps(graph, ['a', 'b', 'c'])) expect(gap).toBeCloseTo(14, 3)
    }
    graph.destroy()
  })

  it('writes no position while the view pans without zooming', () => {
    const graph = mount(itemGraph(stacked))
    unfold(graph, 'zones', 'z')
    const version = graph.store.state.positionsVersion
    for (let step = 1; step <= 20; step++) {
      graph.view.set({ x: step * 7, y: -step * 3, zoom: 1 })
      dom.flushFrames()
    }
    expect(graph.store.state.positionsVersion).toBe(version)
    for (const gap of gaps(graph, ['a', 'b', 'c'])) expect(gap).toBeCloseTo(14, 3)
    graph.destroy()
  })

  it('spreads only the members at one place in a crowd too wide for the view', () => {
    const crowd: Item[] = []
    for (let place = 0; place < 200; place++) {
      for (let member = 0; member < 2; member++) {
        const x = (place % 20) * 2
        crowd.push({
          id: `c${place}-${member}`,
          zone: 'z',
          x,
          y: Math.floor(place / 20) * 2,
          size: 30,
        })
      }
    }
    const graph = mount(itemGraph(crowd))
    unfold(graph, 'zones', 'z')
    for (const place of [0, 57, 199]) {
      const home = { x: (place % 20) * 2, y: Math.floor(place / 20) * 2 }
      const pair = [`c${place}-0`, `c${place}-1`]
      expect(gaps(graph, pair)[0]).toBeCloseTo(34, 3)
      for (const key of pair) {
        const at = graph.positions.get(key) as Point
        expect(Math.hypot(at.x - home.x, at.y - home.y)).toBeCloseTo(17, 3)
      }
    }
    graph.view.set({ x: 0, y: 0, zoom: 0.25 })
    dom.flushFrames()
    expect(gaps(graph, ['c0-0', 'c0-1'])[0]).toBeCloseTo(34, 3)
    expect(gaps(graph, ['c0-0', 'c1-0'])[0]).toBeLessThan(1)
    dom.resize(4000, 4000)
    dom.flushFrames()
    expect(gaps(graph, ['c0-0', 'c1-0'])[0]).toBeGreaterThan(33)
    graph.destroy()
  })

  it('updates the pick index for hover at most every 150 ms while a zoom moves the members', () => {
    reduced.matches = true
    let clock = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const graph = mount(itemGraph(stacked))
    unfold(graph, 'zones', 'z')
    const send = (type: string, x: number) =>
      canvasOf(graph).dispatchEvent(
        new PointerEvent(type, {
          clientX: x,
          clientY: 300,
          button: 0,
          pointerId: 1,
          bubbles: true,
        }),
      )
    const move = (x: number) => send('pointermove', x)
    move(400)
    const refresh = vi.spyOn(PickIndex.prototype, 'refresh')
    const build = vi.spyOn(PickIndex.prototype, 'build')
    const calls = () => refresh.mock.calls.length + build.mock.calls.length
    const version = graph.store.state.positionsVersion
    for (let step = 1; step <= 5; step++) {
      clock += 20
      graph.view.set({ x: 0, y: 0, zoom: 1 + step * 0.03 })
      dom.flushFrames()
      move(400 + step)
    }
    expect(graph.store.state.positionsVersion).not.toBe(version)
    expect(calls()).toBe(0)
    clock += 150
    graph.view.set({ x: 0, y: 0, zoom: 1.2 })
    dom.flushFrames()
    move(410)
    const moved = calls()
    expect(moved).toBeGreaterThan(0)
    clock += 20
    graph.view.set({ x: 0, y: 0, zoom: 1.3 })
    dom.flushFrames()
    send('pointerdown', 410)
    send('pointerup', 410)
    expect(calls()).toBeGreaterThan(moved)
    graph.destroy()
  })

  it('picks each spread member at its center and frames them in the container', () => {
    const graph = mount(itemGraph(stacked))
    const zone = unfold(graph, 'zones', 'z')
    for (const key of ['a', 'b', 'c']) expect(graph.pick(screenOf(graph, key))?.key).toBe(key)
    const center = screenOf(graph, zone)
    const box = graph.pick({ x: center.x, y: center.y })
    expect(box?.key).not.toBe('a')
    graph.destroy()
  })

  it('glides the members out from their place over the layout transition', () => {
    const graph = mount(itemGraph(stacked))
    const key = graph.groups.keyOf('zones', 'z')
    graph.groups.unfold([key])
    expect(graph.positions.get('a')).toEqual({ x: 0, y: 0 })
    expect(graph.positions.snapshot().get('a')?.y).toBeLessThan(0)
    dom.flushFrames()
    expect(graph.positions.get('a')?.y).toBeLessThan(0)
    graph.destroy()
  })

  it('places the members at once with reduced motion', () => {
    reduced.matches = true
    const graph = mount(itemGraph(stacked))
    graph.groups.unfold([graph.groups.keyOf('zones', 'z')])
    expect(graph.positions.get('a')?.y).toBeLessThan(0)
    graph.destroy()
  })

  it('puts the members back on their place at once when the group folds', () => {
    const graph = mount(itemGraph(stacked))
    const zone = unfold(graph, 'zones', 'z')
    graph.groups.fold([zone])
    expect(graph.positions.get('a')).toEqual({ x: 0, y: 0 })
    expect(graph.positions.get('b')).toEqual({ x: 0, y: 0 })
    graph.groups.unfold([zone])
    dom.flushFrames()
    for (const gap of gaps(graph, ['a', 'b', 'c'])) expect(gap).toBeCloseTo(14, 3)
    graph.destroy()
  })

  it('emits no position change while spreading', () => {
    const graph = mount(itemGraph(stacked))
    const changes: unknown[] = []
    graph.on('positionchange', (event) => changes.push(event))
    const zone = unfold(graph, 'zones', 'z')
    graph.view.set({ x: 0, y: 0, zoom: 4 })
    dom.flushFrames()
    graph.update({
      definition: itemGraph(stacked.map((item) => (item.id === 'a' ? { ...item, x: 1 } : item))),
    })
    dom.flushFrames()
    graph.groups.fold([zone])
    dom.flushFrames()
    expect(changes).toEqual([])
    graph.destroy()
  })

  it('moves a spread member with its data and places the pack around the new place', () => {
    const graph = mount(itemGraph(stacked))
    unfold(graph, 'zones', 'z')
    const moved = stacked.map((item) => (item.id === 'c' ? { ...item, x: 200, y: 0 } : item))
    graph.update({ definition: itemGraph(moved) })
    dom.flushFrames()
    expect(graph.positions.get('c')).toEqual({ x: 200, y: 0 })
    const [gap = 0] = gaps(graph, ['a', 'b'])
    expect(gap).toBeCloseTo(14, 3)
    expect(graph.positions.get('a')?.x).toBeCloseTo(0, 3)
    graph.destroy()
  })

  it('detaches a dragged member, keeps it where it is dropped and closes the ranks', () => {
    const graph = mount(itemGraph(stacked))
    unfold(graph, 'zones', 'z')
    const start = screenOf(graph, 'a')
    drag(canvasOf(graph), start, { x: start.x + 100, y: start.y })
    dom.flushFrames()
    const dropped = graph.positions.get('a')
    expect(screenOf(graph, 'a').x).toBeCloseTo(start.x + 100, 3)
    const [gap = 0] = gaps(graph, ['b', 'c'])
    expect(gap).toBeCloseTo(14, 3)
    expect(screenOf(graph, 'b').y).toBeLessThan(screenOf(graph, 'c').y)
    graph.view.set({ x: 0, y: 0, zoom: 3 })
    dom.flushFrames()
    expect(graph.positions.get('a')).toEqual(dropped)
    graph.update({
      definition: itemGraph(stacked.map((item) => (item.id === 'a' ? { ...item, y: 1 } : item))),
    })
    dom.flushFrames()
    for (const gap of gaps(graph, ['a', 'b', 'c'])) expect(gap).toBeGreaterThan(13.9)
    graph.destroy()
  })

  it('detaches a member placed by positions.set', () => {
    const graph = mount(itemGraph(stacked))
    unfold(graph, 'zones', 'z')
    graph.positions.set([['b', { x: 100, y: 100 }]])
    dom.flushFrames()
    expect(graph.positions.get('b')).toEqual({ x: 100, y: 100 })
    const [gap = 0] = gaps(graph, ['a', 'c'])
    expect(gap).toBeCloseTo(14, 3)
    graph.destroy()
  })

  it('carries the spread members along with a dragged container', () => {
    const graph = mount(itemGraph(stacked))
    const zone = unfold(graph, 'zones', 'z')
    const before = screenOf(graph, 'a')
    const box = screenOf(graph, zone)
    const from = { x: box.x + 30, y: box.y }
    expect(graph.pick(from)?.key).toBe(zone)
    drag(canvasOf(graph), from, { x: from.x, y: from.y + 50 })
    dom.flushFrames()
    expect(screenOf(graph, 'a').y).toBeCloseTo(before.y + 50, 3)
    for (const gap of gaps(graph, ['a', 'b', 'c'])) expect(gap).toBeCloseTo(14, 3)
    graph.view.set({ x: 0, y: 0, zoom: 2 })
    dom.flushFrames()
    for (const gap of gaps(graph, ['a', 'b', 'c'])) expect(gap).toBeCloseTo(14, 3)
    graph.destroy()
  })

  it('leaves the members in place with spread: false and widens the gap with gap', () => {
    const still = mount(itemGraph(stacked, { spread: false }))
    unfold(still, 'zones', 'z')
    expect(still.positions.get('b')).toEqual({ x: 0, y: 0 })
    still.destroy()
    const wide = mount(itemGraph(stacked, { gap: 10 }))
    unfold(wide, 'zones', 'z')
    for (const gap of gaps(wide, ['a', 'b', 'c'])) expect(gap).toBeCloseTo(20, 3)
    wide.update({ definition: itemGraph(stacked, { spread: false }) })
    dom.flushFrames()
    expect(wide.positions.get('b')).toEqual({ x: 0, y: 0 })
    wide.destroy()
  })

  it('keeps the places of the others when a member is hidden', () => {
    const graph = mount(itemGraph(stacked))
    unfold(graph, 'zones', 'z')
    const before = graph.positions.get('b')
    graph.states.set('gone', { nodes: ['a'] })
    dom.flushFrames()
    expect(graph.positions.get('b')).toEqual(before)
    graph.destroy()
  })

  it('spreads a member that arrives at the place', () => {
    const graph = mount(itemGraph(stacked))
    unfold(graph, 'zones', 'z')
    const more = [...stacked, { id: 'e', zone: 'z', x: 0, y: 0 }]
    graph.update({ definition: itemGraph(more) })
    dom.flushFrames()
    const apart = gaps(graph, ['a', 'b', 'c', 'e'])
    expect(Math.min(...apart)).toBeCloseTo(14, 3)
    graph.destroy()
  })

  it('spreads members sized in world units in world units, without writing while zooming', () => {
    const graph = mount(itemGraph(stacked, { units: 'world' }))
    unfold(graph, 'zones', 'z')
    const a = graph.positions.get('a') as Point
    const b = graph.positions.get('b') as Point
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(14, 3)
    const version = graph.store.state.positionsVersion
    for (const zoom of [2, 0.5, 5]) {
      graph.view.set({ x: 0, y: 0, zoom })
      dom.flushFrames()
    }
    expect(graph.store.state.positionsVersion).toBe(version)
    expect(graph.positions.get('a')).toEqual(a)
    graph.destroy()
  })

  it('spreads in steps of a quarter octave beyond the per-frame limit', () => {
    const crowd: Item[] = []
    for (let place = 0; crowd.length <= perFrameLimit; place++) {
      for (let member = 0; member < 4; member++) {
        const x = (place % 100) * 1000
        crowd.push({ id: `m${crowd.length}`, zone: 'z', x, y: Math.floor(place / 100) * 1000 })
      }
    }
    const graph = mount(itemGraph(crowd))
    unfold(graph, 'zones', 'z')
    for (const gap of gaps(graph, ['m0', 'm1', 'm2', 'm3'])) expect(gap).toBeGreaterThan(14 * 0.999)
    const version = graph.store.state.positionsVersion
    graph.view.set({ x: 0, y: 0, zoom: 1.05 })
    dom.flushFrames()
    expect(graph.store.state.positionsVersion).toBe(version)
    graph.view.set({ x: 0, y: 0, zoom: 4 })
    dom.flushFrames()
    expect(graph.store.state.positionsVersion).not.toBe(version)
    for (const gap of gaps(graph, ['m0', 'm1', 'm2', 'm3'])) expect(gap).toBeGreaterThan(14 * 0.999)
    graph.view.set({ x: 0, y: 0, zoom: 4.3 })
    dom.flushFrames()
    const wider = gaps(graph, ['m0', 'm1'])[0] ?? 0
    expect(wider).toBeCloseTo((14 * 4.3) / 4, 3)
    graph.destroy()
  })

  it('measures in pixels when members of a group mix units', () => {
    const mixed = stacked.map((item, at) => (at === 0 ? { ...item, size: 20 } : item))
    const definition = defineGraph({
      marks: [
        nodes(mixed.slice(0, 1), { x: 'x', y: 'y', size: 20, units: 'world', parent: 'zone' }),
        nodes(mixed.slice(1), { x: 'x', y: 'y', size: 10, units: 'screen', parent: 'zone' }),
        nodes([{ id: 'z' }], { x: () => 0, y: () => 0 }),
      ],
      layout: null,
    })
    const graph = mount(definition as unknown as ReturnType<typeof itemGraph>)
    graph.view.set({ x: 0, y: 0, zoom: 2 })
    dom.flushFrames()
    const [ab = 0, ac = 0] = gaps(graph, ['a', 'b', 'c'])
    expect(ab).toBeCloseTo(44, 3)
    expect(ac).toBeCloseTo(44, 3)
    graph.destroy()
  })

  it('never lets a layout move a spread member', async () => {
    const graph = mount(itemGraph(stacked, { layout: true }))
    unfold(graph, 'zones', 'z')
    const before = graph.positions.snapshot()
    await graph.layout.run(grid(), { duration: 0 })
    dom.flushFrames()
    for (const key of ['a', 'b', 'c']) expect(graph.positions.get(key)).toEqual(before.get(key))
    graph.destroy()
  })

  it('spreads the members of a folded group that was dragged, around their data', () => {
    const graph = mount(itemGraph(stacked))
    const zone = graph.groups.keyOf('zones', 'z')
    const start = screenOf(graph, zone)
    drag(canvasOf(graph), start, { x: start.x + 80, y: start.y })
    dom.flushFrames()
    unfold(graph, 'zones', 'z')
    const middle = ['a', 'b', 'c'].map((key) => graph.positions.get(key) as Point)
    const x = middle.reduce((sum, point) => sum + point.x, 0) / 3
    const y = middle.reduce((sum, point) => sum + point.y, 0) / 3
    expect(x).toBeCloseTo(0, 3)
    expect(y).toBeCloseTo(0, 3)
    graph.destroy()
  })

  it('follows a controlled fold', () => {
    const container = document.createElement('div')
    document.body.append(container)
    let folded: readonly Key[] = []
    const graph = createGraphHost(
      container,
      {
        definition: itemGraph(stacked),
        ariaLabel: 'graph',
        folded,
        onFoldChange: (event) => {
          folded = event.folded
        },
      },
      () => fakeRenderer(),
    ) as unknown as GraphInstance
    graph.view.set({ x: 0, y: 0, zoom: 1 })
    dom.flushFrames()
    for (const gap of gaps(graph, ['a', 'b', 'c'])) expect(gap).toBeCloseTo(14, 3)
    graph.update({ folded: [graph.groups.keyOf('zones', 'z')] })
    dom.flushFrames()
    expect(graph.positions.get('a')).toEqual({ x: 0, y: 0 })
    graph.destroy()
  })
})

describe('spreading on a map', () => {
  it('spreads the places of an unfolded area and keeps their gaps through zoom', () => {
    const { map, render, camera } = fakeMap()
    const graph = mountMapGraph(map, { definition: placeGraph(places), ariaLabel: 'map' })
    render()
    graph.groups.unfold([graph.groups.keyOf('areas', 'west')])
    render()
    const keys = ['p1', 'p2', 'p3', 'p4']
    for (const gap of gaps(graph as unknown as GraphInstance, keys)) {
      expect(gap).toBeGreaterThan(13.99)
    }
    for (const zoom of [6, 2.5, 11]) {
      camera.zoom = zoom
      render()
      const apart = gaps(graph as unknown as GraphInstance, keys)
      expect(Math.abs(Math.min(...apart) - 14)).toBeLessThan(0.1)
    }
    for (const key of keys) {
      const at = screenOf(graph as unknown as GraphInstance, key)
      expect(graph.pick(at)?.key).toBe(key)
    }
    graph.groups.fold([graph.groups.keyOf('areas', 'west')])
    render()
    graph.groups.unfold([graph.groups.keyOf('areas', 'west')])
    render()
    expect(Math.abs(Math.min(...gaps(graph as unknown as GraphInstance, keys)) - 14)).toBeLessThan(
      0.1,
    )
    graph.destroy()
  })

  it('keeps the gaps on the globe', () => {
    const { map, render, camera } = fakeMap()
    const graph = mountMapGraph(map, { definition: placeGraph(places), ariaLabel: 'map' })
    render(globeInput(camera.lng, camera.lat, camera.zoom))
    graph.groups.unfold([graph.groups.keyOf('areas', 'west')])
    render(globeInput(camera.lng, camera.lat, camera.zoom))
    const keys = ['p1', 'p2', 'p3', 'p4']
    const apart = gaps(graph as unknown as GraphInstance, keys)
    expect(Math.min(...apart)).toBeGreaterThan(12.5)
    expect(Math.min(...apart)).toBeLessThan(15.5)
    for (const key of keys) {
      const at = screenOf(graph as unknown as GraphInstance, key)
      expect(graph.pick(at)?.key).toBe(key)
    }
    graph.destroy()
  })
})
