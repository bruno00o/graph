import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { mountMapGraph } from '../map'
import { groups, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap, globeInput } from '../testing/map'
import type { Key, Point } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

interface Place {
  readonly id: string
  readonly area: string
  readonly lng: number
  readonly lat: number
}

interface Item {
  readonly id: string
  readonly zone: string
  readonly x: number
  readonly y: number
}

const places: Place[] = [
  { id: 'a', area: 'west', lng: 2.3, lat: 48.8 },
  { id: 'b', area: 'west', lng: 2.4, lat: 48.9 },
  { id: 'c', area: 'east', lng: 4.3, lat: 48.85 },
  { id: 'd', area: 'east', lng: 4.4, lat: 48.9 },
]

const items: Item[] = [
  { id: 'a', zone: 'north', x: -200, y: -100 },
  { id: 'b', zone: 'north', x: -100, y: -100 },
  { id: 'c', zone: 'south', x: 100, y: 100 },
  { id: 'd', zone: 'south', x: 200, y: 100 },
]

function placeGraph(list: readonly Place[]) {
  return defineGraph({
    marks: [
      nodes(list, { longitude: 'lng', latitude: 'lat', name: 'places', size: 8 }),
      groups(list, { by: 'area', name: 'areas', size: 30 }),
    ],
    layout: null,
  })
}

function itemGraph(list: readonly Item[], units?: 'screen') {
  return defineGraph({
    marks: [
      nodes(list, { x: 'x', y: 'y', name: 'items', size: 8, units }),
      groups(list, { by: 'zone', name: 'zones', size: 30 }),
    ],
    layout: null,
  })
}

let dom: FakeDom

beforeEach(() => {
  dom = installDom()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
  dom.restore()
})

function drag(target: EventTarget, from: Point, to: Point): void {
  const event = { clientX: from.x, clientY: from.y, button: 0, pointerId: 1, bubbles: true }
  target.dispatchEvent(new PointerEvent('pointerdown', event))
  target.dispatchEvent(
    new PointerEvent('pointermove', { ...event, clientX: (from.x + to.x) / 2, clientY: to.y }),
  )
  target.dispatchEvent(new PointerEvent('pointermove', { ...event, clientX: to.x, clientY: to.y }))
  target.dispatchEvent(new PointerEvent('pointerup', { ...event, clientX: to.x, clientY: to.y }))
}

function screenOf(graph: GraphInstance, key: Key): Point {
  const position = graph.positions.get(key)
  if (!position) throw new Error(`no position for ${String(key)}`)
  return graph.view.toScreen(position)
}

describe('folded groups of nodes placed by their data', () => {
  it('draws the groups of a map in screen units and lets one be dragged', () => {
    const { map, canvas, render } = fakeMap()
    const graph = mountMapGraph(map, { definition: placeGraph(places), ariaLabel: 'map' })
    render()
    const west = graph.groups.keyOf('areas', 'west')
    const east = graph.groups.keyOf('areas', 'east')
    const start = screenOf(graph, west)
    const eastAt = graph.positions.get(east)
    expect(graph.pick(start)?.key).toBe(west)
    expect(graph.pick({ x: start.x + 20, y: start.y })).toBeNull()
    const moved: Key[] = []
    graph.on('positionchange', ({ positions }) => moved.push(...positions.keys()))
    drag(canvas, start, { x: start.x + 60, y: start.y })
    render()
    expect(moved).toContain(west)
    expect(screenOf(graph, west).x).toBeCloseTo(start.x + 60, 3)
    expect(graph.positions.get(east)).toEqual(eastAt)
    const dropped = graph.positions.get(west)
    graph.update({
      definition: placeGraph(
        places.map((place) => (place.id === 'a' ? { ...place, lng: 2.2 } : place)),
      ),
    })
    render()
    expect(graph.positions.get(west)).toEqual(dropped)
    graph.destroy()
  })

  it('lets a group be dragged on the globe', () => {
    const { map, canvas, render, camera } = fakeMap()
    const graph = mountMapGraph(map, { definition: placeGraph(places), ariaLabel: 'map' })
    render(globeInput(camera.lng, camera.lat, camera.zoom))
    const west = graph.groups.keyOf('areas', 'west')
    const start = screenOf(graph, west)
    expect(graph.pick(start)?.key).toBe(west)
    drag(canvas, start, { x: start.x + 60, y: start.y })
    render(globeInput(camera.lng, camera.lat, camera.zoom))
    const end = screenOf(graph, west)
    expect(end.x).toBeCloseTo(start.x + 60, 0)
    expect(end.y).toBeCloseTo(start.y, 0)
    graph.destroy()
  })

  it('keeps a dragged group in place through data changes of its members', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      { definition: itemGraph(items), ariaLabel: 'graph' },
      () => fakeRenderer(),
    )
    graph.view.set({ x: 0, y: 0, zoom: 1 })
    dom.flushFrames()
    const north = graph.groups.keyOf('zones', 'north')
    const start = screenOf(graph, north)
    expect(graph.positions.get(north)).toEqual({ x: -150, y: -100 })
    drag(graph.element.querySelector('canvas') as HTMLCanvasElement, start, {
      x: start.x + 60,
      y: start.y + 20,
    })
    dom.flushFrames()
    const dropped = graph.positions.get(north)
    const zoom = graph.view.get().zoom
    expect(dropped?.x).toBeCloseTo(-150 + 60 / zoom, 3)
    expect(dropped?.y).toBeCloseTo(-100 + 20 / zoom, 3)
    const updated = items.map((item) => (item.id === 'a' ? { ...item, x: -210 } : item))
    graph.update({ definition: itemGraph(updated) })
    dom.flushFrames()
    expect(graph.positions.get(north)).toEqual(dropped)
    const added = [...updated, { id: 'e', zone: 'north', x: -300, y: -100 }]
    graph.update({ definition: itemGraph(added) })
    dom.flushFrames()
    expect(graph.positions.get(north)).toEqual(dropped)
    graph.groups.unfold([north])
    dom.flushFrames()
    expect(graph.positions.get('a')).toEqual({ x: -210, y: -100 })
    graph.destroy()
  })

  it('draws a group in the units of its nodes', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      { definition: itemGraph(items, 'screen'), ariaLabel: 'graph' },
      () => fakeRenderer(),
    )
    dom.flushFrames()
    graph.view.set({ x: 0, y: 0, zoom: 0.25 })
    dom.flushFrames()
    expect(graph.view.get().zoom).toBe(0.25)
    const north = graph.groups.keyOf('zones', 'north')
    const center = screenOf(graph, north)
    expect(graph.pick({ x: center.x + 12, y: center.y })?.key).toBe(north)
    graph.update({ definition: itemGraph(items) })
    dom.flushFrames()
    expect(graph.pick({ x: center.x + 12, y: center.y })).toBeNull()
    graph.destroy()
  })
})
