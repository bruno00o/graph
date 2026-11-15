import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geoToWorld } from '../core/geo'
import { persistPositions } from '../db'
import { defineGraph } from '../define-graph'
import type { GraphPositionEvent, GraphSurfaceEvent } from '../host/events'
import { internalsOf } from '../host/internals'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { grid } from '../layouts'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
import type { GraphDefinition, View } from '../types'
import { exportMapPng, mapSurface, mountMapGraph } from '.'

const made = vi.hoisted(() => ({ shared: 0, sharedGone: 0, own: 0, ownGone: 0 }))

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => {
    made.shared++
    return {
      ...fakeRenderer(),
      destroy: () => {
        made.sharedGone++
      },
    }
  },
}))

interface Place {
  readonly id: string
  readonly x?: number
  readonly y?: number
}

interface Route {
  readonly id: string
  readonly from: string
  readonly to: string
}

const routes: Route[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
]

const paris = geoToWorld({ longitude: 2.35, latitude: 48.86 })
const berlin = geoToWorld({ longitude: 13.4, latitude: 52.52 })

function places(extra: Partial<Place> = {}): Place[] {
  return [
    { id: 'a', x: paris.x, y: paris.y },
    { id: 'b', x: berlin.x, y: berlin.y },
    { id: 'c', ...extra },
  ]
}

function define(data: Place[] = places(), layout: boolean = true): GraphDefinition {
  return defineGraph({
    marks: [
      edges<Route>(routes, { source: 'from', target: 'to' }),
      nodes<Place>(data, { x: 'x', y: 'y' }),
    ],
    layout: layout ? grid() : null,
  }) as GraphDefinition
}

let dom: FakeDom
let container: HTMLElement

beforeEach(() => {
  dom = installDom()
  made.shared = 0
  made.sharedGone = 0
  made.own = 0
  made.ownGone = 0
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
  document.body.innerHTML = ''
})

function mount(options: Partial<Parameters<typeof createGraphHost>[1]> = {}): GraphInstance {
  return createGraphHost(
    container,
    { definition: define(), ariaLabel: 'graph', ...options },
    () => {
      made.own++
      return {
        ...fakeRenderer(),
        destroy: () => {
          made.ownGone++
        },
      }
    },
  ) as GraphInstance
}

function at(graph: GraphInstance, key: string): { x: number; y: number } {
  const point = graph.positions.get(key)
  if (!point) throw new Error(`no position for ${key}`)
  return point
}

async function settle(): Promise<void> {
  for (let round = 0; round < 4; round++) {
    dom.flushFrames()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('moving a graph onto a map and back', () => {
  it('moves the element, the drawing and the store, and comes back the same', async () => {
    const { map, layers, render } = fakeMap()
    const graph = mount()
    await settle()
    const canvas = graph.element.querySelector('canvas') as HTMLCanvasElement
    const before = graph.view.get()
    const seen: GraphSurfaceEvent[] = []
    graph.on('surfacechange', (event) => seen.push(event))
    const surface = mapSurface(map)
    graph.update({ surface })
    render()
    expect(graph.store.state.surface).toBe('map')
    expect(graph.drawsOnMap).toBe(true)
    expect(graph.element.previousElementSibling).toBe(map.getCanvasContainer())
    expect(canvas.style.display).toBe('none')
    expect(layers.has('graph')).toBe(true)
    expect(made.shared).toBe(1)
    expect(graph.view.get().zoom).toBe(16)
    expect(at(graph, 'a').x).toBeCloseTo(paris.x)
    graph.update({ surface: null })
    await settle()
    expect(graph.store.state.surface).toBe('canvas')
    expect(graph.drawsOnMap).toBe(false)
    expect(graph.element.parentElement).toBe(container)
    expect(canvas.style.display).toBe('block')
    expect(graph.view.get()).toEqual(before)
    expect(seen).toEqual([
      { surface: 'map', previous: 'canvas' },
      { surface: 'canvas', previous: 'map' },
    ])
    expect(layers.has('graph')).toBe(true)
    expect(made.own).toBe(1)
    graph.destroy()
    expect(layers.has('graph')).toBe(false)
    expect(made.sharedGone).toBe(1)
    expect(made.ownGone).toBe(1)
  })

  it('keeps the positions of each surface, without a layout run on the way back', async () => {
    const { map, render } = fakeMap()
    const graph = mount()
    await settle()
    let runs = 0
    graph.on('layoutstart', () => {
      runs++
    })
    graph.positions.set([['c', { x: 1234, y: 567 }]])
    const surface = mapSurface(map)
    graph.update({ surface })
    render()
    const onMap = at(graph, 'c')
    expect(onMap).not.toEqual({ x: 1234, y: 567 })
    graph.positions.set([['c', { x: 300, y: 200 }]])
    graph.update({ surface: null })
    await settle()
    expect(at(graph, 'c').x).toBeCloseTo(1234)
    expect(at(graph, 'c').y).toBeCloseTo(567)
    graph.update({ surface })
    render()
    expect(at(graph, 'c').x).toBeCloseTo(300)
    expect(at(graph, 'c').y).toBeCloseTo(200)
    expect(runs).toBe(0)
    graph.destroy()
  })

  it('places the nodes that arrived while away, and moves those whose data moved', async () => {
    const { map, render } = fakeMap()
    const graph = mount({ definition: define(places({ x: 10, y: 10 })) })
    await settle()
    const surface = mapSurface(map)
    graph.update({ surface })
    render()
    let runs = 0
    graph.on('layoutstart', () => {
      runs++
    })
    graph.update({ definition: define([...places({ x: 50, y: 60 }), { id: 'd' }]) })
    render()
    expect(runs).toBe(0)
    expect(graph.positions.snapshot().get('c')).toEqual({ x: 50, y: 60 })
    graph.update({ surface: null })
    expect(at(graph, 'c')).toEqual({ x: 50, y: 60 })
    expect(graph.positions.get('d')).toBeDefined()
    expect(runs).toBe(1)
    graph.destroy()
  })

  it('takes up again on its return a layout run that the move stopped', async () => {
    const { map, render } = fakeMap()
    const graph = mount()
    dom.flushFrames()
    const ends: boolean[] = []
    graph.on('layoutend', (event) => ends.push(event.completed))
    graph.update({ surface: mapSurface(map) })
    render()
    expect(ends).toEqual([false])
    graph.update({ surface: null })
    await settle()
    expect(ends).toEqual([false, true])
    graph.destroy()
  })

  it('runs the layout on the first visit of the canvas after a mount on a map', async () => {
    const { map, render } = fakeMap()
    const surface = mapSurface(map)
    const graph = mount({ surface })
    render()
    expect(graph.store.state.surface).toBe('map')
    expect(made.own).toBe(0)
    let runs = 0
    graph.on('layoutstart', () => {
      runs++
    })
    graph.update({ surface: null })
    await settle()
    expect(runs).toBe(1)
    expect(made.own).toBe(1)
    graph.destroy()
  })

  it('takes the view given with the switch, and moves the map to it', async () => {
    const { map, state, render } = fakeMap()
    const graph = mount()
    await settle()
    graph.update({ surface: mapSurface(map), view: { ...berlin, zoom: 32 } })
    await Promise.resolve()
    expect(state.jumps).toHaveLength(1)
    expect(state.jumps[0]?.zoom).toBeCloseTo(5)
    render()
    expect(graph.view.get().zoom).toBeCloseTo(32)
    const back: View = { x: 5, y: 6, zoom: 2 }
    graph.update({ surface: null, view: back })
    expect(graph.view.get()).toEqual(back)
    graph.destroy()
  })

  it('applies on its return the controlled view given while on the map', async () => {
    const { map, render, state } = fakeMap()
    const requests: View[] = []
    const graph = mount({
      view: { x: 0, y: 0, zoom: 1 },
      onViewChange: (event) => requests.push(event.view),
    })
    await settle()
    graph.update({ surface: mapSurface(map) })
    render()
    const onMap = graph.view.get()
    graph.update({ view: { x: 40, y: 50, zoom: 3 } })
    expect(graph.view.get()).toEqual(onMap)
    expect(state.jumps).toEqual([])
    graph.update({ surface: null })
    expect(graph.view.get()).toEqual({ x: 40, y: 50, zoom: 3 })
    graph.destroy()
  })

  it('turns layouts down on the map only', async () => {
    const { map, render } = fakeMap()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mount()
    await settle()
    graph.update({ surface: mapSurface(map) })
    render()
    await expect(graph.layout.run()).rejects.toThrow('graph: layouts do not run on a map')
    graph.update({ surface: null })
    await expect(graph.layout.run(undefined, { duration: 0 })).resolves.toBe(true)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('layouts do not run on a map'))
    graph.destroy()
  })

  it('names the surface of each position change', async () => {
    const { map, render } = fakeMap()
    const graph = mount()
    await settle()
    const seen: GraphPositionEvent[] = []
    graph.on('positionchange', (event) => seen.push(event))
    graph.positions.set([['c', { x: 1, y: 2 }]])
    graph.update({ surface: mapSurface(map) })
    render()
    graph.positions.set([['c', { x: 3, y: 4 }]])
    expect(seen.map((event) => event.surface)).toEqual(['canvas', 'map'])
    expect(seen[0]?.geo).toBeUndefined()
    expect(seen[1]?.geo?.get('c')).toBeDefined()
    graph.destroy()
  })

  it('brings the graph back to its canvas when the surface is released', async () => {
    const { map, layers, render, fake } = fakeMap()
    const graph = mount()
    await settle()
    const surface = mapSurface(map)
    graph.update({ surface })
    render()
    surface.release()
    expect(graph.store.state.surface).toBe('canvas')
    expect(layers.has('graph')).toBe(false)
    expect(made.sharedGone).toBe(1)
    expect(fake.dragRotate.enabled).toBe(true)
    graph.update({ surface })
    expect(layers.has('graph')).toBe(true)
    expect(made.shared).toBe(2)
    graph.update({ surface: null })
    surface.release()
    expect(layers.has('graph')).toBe(false)
    expect(made.sharedGone).toBe(2)
    expect(graph.store.state.surface).toBe('canvas')
    graph.destroy()
  })

  it('comes back to its canvas when the map is removed', async () => {
    const { map, render } = fakeMap()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mount()
    await settle()
    const surface = mapSurface(map)
    graph.update({ surface })
    render()
    map.remove()
    expect(graph.store.state.surface).toBe('canvas')
    expect(graph.element.parentElement).toBe(container)
    expect(warn).toHaveBeenCalledWith(
      'graph: the map was removed, the graph went back to its own canvas',
    )
    expect(() => graph.update({ surface })).toThrow('graph: the map of this surface was removed')
    expect(graph.store.state.surface).toBe('canvas')
    graph.destroy()
  })

  it('gives the map back when destroyed on it', async () => {
    const { map, layers, render, fake, listeners } = fakeMap()
    const graph = mount()
    await settle()
    graph.update({ surface: mapSurface(map) })
    render()
    graph.destroy()
    expect(layers.size).toBe(0)
    expect(fake.dragRotate.enabled).toBe(true)
    expect(fake.dragPan.enabled).toBe(true)
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true)
    expect(graph.element.isConnected).toBe(false)
  })

  it('holds one graph at a time', () => {
    const { map, render } = fakeMap()
    const surface = mapSurface(map)
    const first = mount()
    first.update({ surface })
    render()
    const second = mount()
    expect(() => second.update({ surface })).toThrow('graph: the surface already holds a graph')
    expect(second.store.state.surface).toBe('canvas')
    first.update({ surface: null })
    second.update({ surface })
    expect(second.store.state.surface).toBe('map')
    first.destroy()
    second.destroy()
  })

  it('refuses a surface that does not come from mapSurface', () => {
    const graph = mount()
    expect(() => graph.update({ surface: { name: 'map', release: () => {} } })).toThrow(
      'graph: surface must come from mapSurface, or be null',
    )
    graph.destroy()
  })

  it('makes a new renderer for its canvas once a context lost while away is restored', async () => {
    const { map, render } = fakeMap()
    const graph = mount()
    await settle()
    const canvas = graph.element.querySelector('canvas') as HTMLCanvasElement
    graph.update({ surface: mapSurface(map) })
    render()
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    expect(made.ownGone).toBe(1)
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(made.own).toBe(1)
    graph.update({ surface: null })
    expect(made.own).toBe(2)
    expect(internalsOf(graph, 'test').surface().name).toBe('canvas')
    graph.destroy()
  })

  it('waits for a context lost while away before drawing on its canvas again', async () => {
    const { map, render } = fakeMap()
    const graph = mount()
    await settle()
    const canvas = graph.element.querySelector('canvas') as HTMLCanvasElement
    graph.update({ surface: mapSurface(map) })
    render()
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    graph.update({ surface: null })
    expect(made.own).toBe(1)
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(made.own).toBe(2)
    graph.destroy()
  })

  it('exports the map it is on, and refuses once it left it', async () => {
    const { map, render } = fakeMap()
    const graph = mount()
    await settle()
    graph.update({ surface: mapSurface(map) })
    render()
    expect(internalsOf(graph, 'test').onMap).toBe(true)
    graph.update({ surface: null })
    await expect(exportMapPng(graph)).rejects.toThrow('graph: the graph is not on a map')
    graph.destroy()
  })

  it('writes the moves of the surface it was on when asked, unless told which', async () => {
    const { map, render } = fakeMap()
    const rows = createCollection(
      localOnlyCollectionOptions({
        id: 'switch-rows',
        getKey: (row: { readonly id: string; readonly x: number; readonly y: number }) => row.id,
        initialData: [{ id: 'c', x: 0, y: 0 }],
      }),
    )
    const graph = mount()
    await settle()
    const stop = persistPositions(graph, { collection: rows })
    const both = createCollection(
      localOnlyCollectionOptions({
        id: 'switch-both',
        getKey: (row: { readonly id: string; readonly x: number; readonly y: number }) => row.id,
        initialData: [{ id: 'c', x: 0, y: 0 }],
      }),
    )
    const stopBoth = persistPositions(graph, { collection: both, surfaces: ['canvas', 'map'] })
    graph.update({ surface: mapSurface(map) })
    render()
    graph.positions.set([['c', { x: 7, y: 8 }]])
    stop()
    stopBoth()
    expect(rows.get('c')).toMatchObject({ x: 0, y: 0 })
    expect(both.get('c')).toMatchObject({ x: 7, y: 8 })
    graph.destroy()
  })

  it('keeps mountMapGraph as it was', () => {
    const { map, layers, render } = fakeMap()
    const graph = mountMapGraph(map, { definition: define(places(), false), ariaLabel: 'carte' })
    render()
    expect(graph.store.state.surface).toBe('map')
    expect(layers.has('graph')).toBe(true)
    graph.destroy()
    expect(layers.size).toBe(0)
  })
})
