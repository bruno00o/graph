import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geoToWorld } from '../core/geo'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { globeMatrices } from '../testing/globe'
import { mountMapGraph } from '.'

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

interface Place {
  readonly id: string
  readonly longitude: number
  readonly latitude: number
}

interface Route {
  readonly id: string
  readonly from: string
  readonly to: string
}

const places: Place[] = [
  { id: 'a', longitude: 2.35, latitude: 48.86 },
  { id: 'b', longitude: 13.4, latitude: 52.52 },
]
const routes: Route[] = [{ id: 'ab', from: 'a', to: 'b' }]

const flatInput = {
  defaultProjectionData: { projectionTransition: 0 },
  shaderData: { variantName: 'mercator' },
}

function globeInput(longitude: number, latitude: number, zoom: number) {
  const { matrix, plane, fallback } = globeMatrices({
    longitude,
    latitude,
    zoom,
    width: 800,
    height: 600,
  })
  return {
    defaultProjectionData: {
      mainMatrix: matrix,
      fallbackMatrix: fallback,
      clippingPlane: plane,
      projectionTransition: 1,
    },
    shaderData: { variantName: 'globe' },
  }
}

function toggle(enabled = true) {
  const handler = {
    enabled,
    isEnabled: () => handler.enabled,
    enable: () => {
      handler.enabled = true
    },
    disable: () => {
      handler.enabled = false
    },
    enableRotation: () => {
      handler.enabled = true
    },
    disableRotation: () => {
      handler.enabled = false
    },
  }
  return handler
}

function fakeMap() {
  const container = document.createElement('div')
  const canvasContainer = document.createElement('div')
  const canvas = document.createElement('canvas')
  Object.defineProperty(canvas, 'clientWidth', { value: 800 })
  Object.defineProperty(canvas, 'clientHeight', { value: 600 })
  canvasContainer.append(canvas)
  container.append(canvasContainer)
  document.body.append(container)
  const layers = new Map<string, CustomLayerInterface>()
  const listeners = new Map<string, Set<() => void>>()
  const camera = { lng: 2.35, lat: 48.86, zoom: 4, bearing: 0, pitch: 0 }
  const state = {
    maxPitch: 60,
    repaints: 0,
    jumps: [] as { center: [number, number]; zoom: number }[],
  }
  const map = {
    dragRotate: toggle(),
    touchZoomRotate: toggle(),
    keyboard: toggle(),
    touchPitch: toggle(),
    dragPan: toggle(),
    boxZoom: toggle(),
    doubleClickZoom: toggle(),
    getCanvas: () => canvas,
    getContainer: () => container,
    getCanvasContainer: () => canvasContainer,
    getCenter: () => ({ wrap: () => ({ lng: camera.lng, lat: camera.lat }) }),
    getZoom: () => camera.zoom,
    getBearing: () => camera.bearing,
    getPitch: () => camera.pitch,
    getPadding: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    getMinZoom: () => 0,
    getMaxZoom: () => 22,
    getMaxPitch: () => state.maxPitch,
    setMaxPitch: (value: number) => {
      state.maxPitch = value
    },
    getPixelRatio: () => 2,
    getProjection: () => ({ type: 'mercator' }),
    jumpTo: (options: { center?: [number, number]; zoom?: number; bearing?: number }) => {
      if (options.center) {
        state.jumps.push({ center: options.center, zoom: options.zoom ?? camera.zoom })
        camera.lng = options.center[0]
        camera.lat = options.center[1]
      }
      if (options.zoom !== undefined) camera.zoom = options.zoom
      if (options.bearing !== undefined) camera.bearing = options.bearing
    },
    isStyleLoaded: () => true,
    getLayer: (id: string) => layers.get(id),
    addLayer: (layer: CustomLayerInterface) => {
      layers.set(layer.id, layer)
      layer.onAdd?.(map as unknown as MapLibreMap, {} as WebGL2RenderingContext)
    },
    removeLayer: (id: string) => {
      layers.get(id)?.onRemove?.(map as unknown as MapLibreMap, {} as WebGL2RenderingContext)
      layers.delete(id)
    },
    on: (name: string, listener: () => void) => {
      const set = listeners.get(name) ?? new Set()
      set.add(listener)
      listeners.set(name, set)
    },
    off: (name: string, listener: () => void) => {
      listeners.get(name)?.delete(listener)
    },
    triggerRepaint: () => {
      state.repaints++
    },
  }
  const render = (input: unknown = flatInput) => {
    const layer = layers.get('graph')
    layer?.render?.({} as WebGL2RenderingContext, input as never)
  }
  const emit = (name: string) => {
    for (const listener of listeners.get(name) ?? []) listener()
  }
  return {
    map: map as unknown as MapLibreMap,
    fake: map,
    camera,
    state,
    layers,
    listeners,
    emit,
    render,
    canvas,
  }
}

function definition() {
  return defineGraph({
    marks: [
      edges<Route>(routes, { source: 'from', target: 'to' }),
      nodes<Place>(places, { longitude: 'longitude', latitude: 'latitude', size: () => 20 }),
    ],
    layout: null,
  })
}

let dom: FakeDom

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  vi.restoreAllMocks()
  dom.restore()
})

describe('mountMapGraph', () => {
  it('adds a custom layer, keeps the map flat and gives everything back on destroy', () => {
    const { map, fake, layers, state } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    expect(layers.get('graph')?.type).toBe('custom')
    expect(layers.get('graph')?.renderingMode).toBe('2d')
    expect(fake.dragRotate.enabled).toBe(false)
    expect(fake.touchPitch.enabled).toBe(false)
    expect(state.maxPitch).toBe(0)
    expect(graph.element.parentElement).toBe(map.getContainer())
    graph.destroy()
    expect(layers.size).toBe(0)
    expect(fake.dragRotate.enabled).toBe(true)
    expect(fake.touchPitch.enabled).toBe(true)
    expect(state.maxPitch).toBe(60)
    expect(graph.element.isConnected).toBe(false)
  })

  it('adds the layer again when the style changes, until destroy', () => {
    const { map, layers, listeners, emit } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    layers.clear()
    emit('style.load')
    expect(layers.has('graph')).toBe(true)
    graph.destroy()
    emit('style.load')
    emit('data')
    expect(layers.size).toBe(0)
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true)
  })

  it('follows the map camera in Web Mercator', () => {
    const { map, camera, render } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    const seen: number[] = []
    graph.on('viewchange', ({ view }) => seen.push(view.zoom))
    camera.lng = 13.4
    camera.lat = 52.52
    camera.zoom = 6
    render()
    const center = geoToWorld({ longitude: 13.4, latitude: 52.52 })
    expect(graph.view.get()).toEqual({ x: center.x, y: center.y, zoom: 64 })
    expect(seen).toEqual([64])
    const node = graph.view.toScreen(center)
    expect(node.x).toBeCloseTo(400)
    expect(node.y).toBeCloseTo(300)
    graph.destroy()
  })

  it('moves the map for view calls, after the frame', async () => {
    const { map, state, render } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    render()
    const repaints = state.repaints
    graph.view.zoomBy(2)
    expect(state.repaints).toBeGreaterThan(repaints)
    expect(state.jumps).toEqual([])
    render()
    expect(state.jumps).toEqual([])
    await Promise.resolve()
    expect(state.jumps).toHaveLength(1)
    expect(state.jumps[0]?.zoom).toBeCloseTo(5)
    expect(state.jumps[0]?.center[0]).toBeCloseTo(2.35)
    expect(state.jumps[0]?.center[1]).toBeCloseTo(48.86)
    render()
    expect(graph.view.get().zoom).toBeCloseTo(32)
    graph.destroy()
  })

  it('ignores a view given to update', () => {
    const { map, render } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    render()
    const before = graph.view.get()
    graph.update({ view: { x: 0, y: 0, zoom: 1 } })
    render()
    expect(graph.view.get()).toEqual(before)
    graph.destroy()
  })

  it('takes the drag from the map while a node moves', () => {
    const { map, fake, canvas, render } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    render()
    const point = graph.view.toScreen(geoToWorld({ longitude: 2.35, latitude: 48.86 }))
    const event = { clientX: point.x, clientY: point.y, button: 0, pointerId: 1, bubbles: true }
    canvas.dispatchEvent(new PointerEvent('pointerdown', event))
    expect(fake.dragPan.enabled).toBe(false)
    expect(fake.boxZoom.enabled).toBe(false)
    canvas.dispatchEvent(new PointerEvent('pointermove', { ...event, clientX: point.x + 40 }))
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...event, clientX: point.x + 40 }))
    expect(fake.dragPan.enabled).toBe(true)
    expect(fake.boxZoom.enabled).toBe(true)
    graph.destroy()
  })

  it('leaves the background drag to the map', () => {
    const { map, fake, canvas, render, state } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    render()
    const before = graph.view.get()
    const event = { clientX: 700, clientY: 500, button: 0, pointerId: 1, bubbles: true }
    canvas.dispatchEvent(new PointerEvent('pointerdown', event))
    expect(fake.dragPan.enabled).toBe(true)
    canvas.dispatchEvent(new PointerEvent('pointermove', { ...event, clientX: 600 }))
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...event, clientX: 600 }))
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 300, bubbles: true }))
    render()
    expect(graph.view.get()).toEqual(before)
    expect(state.jumps).toEqual([])
    graph.destroy()
  })

  it('schedules its frames on the map instead of its own loop', () => {
    const { map, state, render } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    render()
    dom.flushFrames()
    const repaints = state.repaints
    graph.selection.set({ nodes: ['a'] })
    expect(state.repaints).toBe(repaints + 1)
    expect(dom.pendingFrames()).toBe(0)
    graph.destroy()
  })

  it('draws and picks on the globe, never behind it', () => {
    const { map, camera, render } = fakeMap()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const far: Place = { id: 'c', longitude: 110, latitude: 10 }
    const graph = mountMapGraph(map, {
      definition: defineGraph({
        marks: [
          nodes<Place>([...places, far], {
            longitude: 'longitude',
            latitude: 'latitude',
            size: () => 20,
          }),
        ],
        layout: null,
      }),
      ariaLabel: 'carte',
    })
    camera.zoom = 2
    render(globeInput(camera.lng, camera.lat, camera.zoom))
    const paris = graph.view.toScreen(geoToWorld(places[0] ?? far))
    expect(paris.x).toBeCloseTo(400)
    expect(paris.y).toBeCloseTo(300)
    const berlin = graph.view.toScreen(geoToWorld(places[1] ?? far))
    expect(graph.pick(berlin)?.key).toBe('b')
    const back = graph.view.toWorld(berlin)
    expect(back.x).toBeCloseTo(geoToWorld(places[1] ?? far).x, 6)
    const hidden = graph.view.toScreen(geoToWorld(far))
    expect(graph.pick(hidden)).toBeNull()
    expect(warn).not.toHaveBeenCalled()
    graph.destroy()
  })

  it('turns layouts down on a map', async () => {
    const { map } = fakeMap()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const graph = mountMapGraph(map, {
      definition: defineGraph({
        marks: definition().marks,
        layout: { name: 'still', options: {}, start: () => ({ stop: () => {}, pin: () => {} }) },
      }),
      ariaLabel: 'carte',
    })
    expect(warn).toHaveBeenCalledTimes(1)
    await expect(graph.layout.run()).rejects.toThrow('graph: layouts do not run on a map')
    graph.destroy()
  })

  it('keeps nodes exact far from where the map started', () => {
    const { map, fake, camera, render, canvas } = fakeMap()
    const graph = mountMapGraph(map, { definition: definition(), ariaLabel: 'carte' })
    camera.lng = 13.4
    camera.lat = 52.52
    camera.zoom = 21
    render()
    const hover = (x: number) =>
      canvas.dispatchEvent(
        new PointerEvent('pointermove', { clientX: x, clientY: 300, pointerId: 1, bubbles: true }),
      )
    hover(400)
    expect(graph.store.get().hovered?.key).toBe('b')
    expect(fake.doubleClickZoom.enabled).toBe(false)
    hover(412)
    expect(graph.store.get().hovered).toBeNull()
    expect(fake.doubleClickZoom.enabled).toBe(true)
    graph.destroy()
  })
})
