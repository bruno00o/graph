import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { mountMapGraph } from '../map'
import { edges, nodes } from '../marks'
import { resolvedOf } from '../resolved-definition'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { fakeMap } from '../testing/map'
import { canvasCapabilities, canvasSurface } from './canvas-surface'
import type { GraphPositionEvent } from './events'
import { FrameScheduler } from './frame-scheduler'
import type { GraphInstance, SurfaceCapabilities } from './graph-instance'
import { internalsOf } from './internals'
import { createGraphHost } from './mount-graph'

const made = vi.hoisted(() => ({ own: 0, shared: 0, destroyed: 0 }))

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => {
    made.own++
    return {
      ...fakeRenderer(),
      destroy: () => {
        made.destroyed++
      },
    }
  },
  createSharedRenderer: () => {
    made.shared++
    return fakeRenderer()
  },
}))

interface Place {
  readonly id: string
  readonly longitude: number
  readonly latitude: number
}

const places: Place[] = [
  { id: 'a', longitude: 2.35, latitude: 48.86 },
  { id: 'b', longitude: 13.4, latitude: 52.52 },
]

function definition() {
  return defineGraph({
    marks: [
      edges<{ id: string; from: string; to: string }>([{ id: 'ab', from: 'a', to: 'b' }], {
        source: 'from',
        target: 'to',
      }),
      nodes<Place>(places, { longitude: 'longitude', latitude: 'latitude', size: () => 20 }),
    ],
    layout: null,
  })
}

const plainAnswers: SurfaceCapabilities = {
  name: 'canvas',
  ownCanvas: true,
  ownCamera: true,
  viewGestures: true,
  layouts: true,
  lens: true,
  minimap: true,
  onMap: false,
  screenPadding: false,
  groupFillOpacity: null,
}

const mapAnswers: SurfaceCapabilities = {
  name: 'map',
  ownCanvas: false,
  ownCamera: false,
  viewGestures: false,
  layouts: false,
  lens: false,
  minimap: false,
  onMap: true,
  screenPadding: true,
  groupFillOpacity: 0.5,
}

function capabilities(graph: GraphInstance): SurfaceCapabilities {
  const surface = internalsOf(graph, 'test').surface()
  return {
    name: surface.name,
    ownCanvas: surface.ownCanvas,
    ownCamera: surface.ownCamera,
    viewGestures: surface.viewGestures,
    layouts: surface.layouts,
    lens: surface.lens,
    minimap: surface.minimap,
    onMap: surface.onMap,
    screenPadding: surface.screenPadding,
    groupFillOpacity: surface.groupFillOpacity,
  }
}

function wheel(target: EventTarget): void {
  const init = { clientX: 400, clientY: 300, deltaY: -200, bubbles: true, cancelable: true }
  const event = new WheelEvent('wheel', init)
  for (const name of ['clientX', 'clientY'] as const) {
    Object.defineProperty(event, name, { value: init[name] })
  }
  for (const name of ['ctrlKey', 'metaKey', 'shiftKey'] as const) {
    Object.defineProperty(event, name, { value: false })
  }
  target.dispatchEvent(event)
}

let dom: FakeDom
let container: HTMLElement

beforeEach(() => {
  dom = installDom()
  container = document.createElement('div')
  document.body.append(container)
  made.own = 0
  made.shared = 0
  made.destroyed = 0
})

afterEach(() => {
  container.remove()
  vi.restoreAllMocks()
  dom.restore()
})

describe('canvas surface', () => {
  it('answers each capability as the plain graph did', () => {
    expect({ ...canvasCapabilities }).toEqual(plainAnswers)
    expect(Object.isFrozen(canvasCapabilities)).toBe(true)
  })

  it('puts its own canvas in the element and keeps the definition as given', () => {
    const surface = canvasSurface()
    const element = document.createElement('div')
    surface.place(element, container)
    expect(element.parentElement).toBe(container)
    expect(element.firstElementChild).toBe(surface.events)
    expect(element.style.position).toBe('relative')
    expect(surface.events.style.touchAction).toBe('none')
    const given = definition()
    expect(surface.adapt(resolvedOf(given))).toBe(given)
  })

  it('schedules frames with animation frames', () => {
    const surface = canvasSurface()
    const before = dom.pendingFrames()
    expect(surface.schedule(() => {})).toBeGreaterThan(0)
    expect(dom.pendingFrames()).toBe(before + 1)
  })
})

describe('map surface', () => {
  it('answers each capability as the map graph did', () => {
    const { map } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    expect(capabilities(graph as GraphInstance)).toEqual(mapAnswers)
    expect(graph.element.previousElementSibling).toBe(map.getCanvasContainer())
    expect(graph.element.style.pointerEvents).toBe('none')
    graph.destroy()
  })

  it('schedules frames with map repaints and drops what the map cannot run', () => {
    const { map, state, render } = fakeMap()
    const given = { ...definition(), layout: { name: 'none' } } as never
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mountMapGraph(map, { definition: given, ariaLabel: 'carte' })
    render()
    const repaints = state.repaints
    graph.selection.set({ nodes: ['a'] })
    expect(state.repaints).toBeGreaterThan(repaints)
    expect(dom.pendingFrames()).toBe(0)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('layouts do not run on a map'))
    graph.destroy()
  })
})

describe('frame scheduler', () => {
  it('asks the current surface for frames and cancels on the surface that scheduled', () => {
    const cancelled: string[] = []
    const surfaceNamed = (name: string, request: number) => ({
      ...canvasSurface(),
      name,
      schedule: () => request,
      cancel: () => {
        cancelled.push(name)
      },
    })
    let current = surfaceNamed('first', 7)
    const scheduler = new FrameScheduler(
      () => {},
      () => current,
      () => false,
    )
    scheduler.request()
    expect(scheduler.due).toBe(true)
    current = surfaceNamed('second', -1)
    scheduler.takeFrame()
    expect(cancelled).toEqual(['first'])
    expect(scheduler.due).toBe(false)
    scheduler.request()
    expect(scheduler.due).toBe(true)
    scheduler.cancelFrame()
    expect(cancelled).toEqual(['first'])
    scheduler.started()
    expect(scheduler.due).toBe(false)
  })
})

describe('the host reads the capabilities of its surface', () => {
  function plain(): GraphInstance {
    return createGraphHost(
      container,
      { definition: definition(), ariaLabel: 'graphe', initialView: { x: 0, y: 0, zoom: 1 } },
      () => {
        made.own++
        return {
          ...fakeRenderer(),
          destroy: () => {
            made.destroyed++
          },
        }
      },
    ) as GraphInstance
  }

  it('gives the default surface to a plain graph', () => {
    const graph = plain()
    expect(capabilities(graph)).toEqual(plainAnswers)
    expect(graph.drawsOnMap).toBe(false)
    expect(internalsOf(graph, 'test').onMap).toBe(false)
    graph.destroy()
  })

  it('creates its renderer at once only on its own canvas', () => {
    const graph = plain()
    expect(made.own).toBe(1)
    graph.destroy()
    const { map } = fakeMap()
    const onMap = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    expect(made.own).toBe(1)
    expect(made.shared).toBe(1)
    onMap.destroy()
  })

  it('listens to context loss only on its own canvas', () => {
    const graph = plain()
    const canvas = internalsOf(graph, 'test').surface() as unknown as { events: HTMLCanvasElement }
    canvas.events.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    expect(made.destroyed).toBe(1)
    graph.destroy()
    expect(made.destroyed).toBe(1)
  })

  it('zooms on the wheel only where it owns the view gestures', () => {
    const graph = plain()
    dom.flushFrames()
    const canvas = graph.element.querySelector('canvas') as HTMLCanvasElement
    wheel(canvas)
    dom.flushFrames()
    expect(graph.store.state.view.zoom).toBeGreaterThan(1)
    graph.destroy()
    const { map, camera, render } = fakeMap()
    const onMap = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    render()
    const zoom = camera.zoom
    wheel(map.getCanvas())
    render()
    expect(camera.zoom).toBe(zoom)
    onMap.destroy()
  })

  it('opens the lens and runs layouts only where the surface allows them', async () => {
    const graph = plain()
    dom.flushFrames()
    graph.lens.set({ at: { x: 100, y: 100 } })
    expect(graph.lens.get()).not.toBeNull()
    await expect(graph.layout.run()).rejects.toThrow('no layout to run')
    graph.destroy()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { map, render } = fakeMap()
    const onMap = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    render()
    onMap.lens.set({ at: { x: 100, y: 100 } })
    expect(onMap.lens.get()).toBeNull()
    expect(warn).toHaveBeenCalledWith('graph: the lens does not work on a map')
    await expect(onMap.layout.run()).rejects.toThrow('layouts do not run on a map')
    onMap.destroy()
  })

  it('gives degrees with moved positions only on a map', () => {
    const seen: GraphPositionEvent[] = []
    const graph = plain()
    dom.flushFrames()
    graph.on('positionchange', (event) => seen.push(event))
    graph.positions.set([['a', { x: 10, y: 10 }]])
    graph.destroy()
    const { map, render } = fakeMap()
    const onMap = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    render()
    onMap.on('positionchange', (event) => seen.push(event))
    onMap.positions.set([['a', { x: 256, y: 256 }]])
    onMap.destroy()
    expect(seen.map((event) => event.geo !== undefined)).toEqual([false, true])
  })
})
