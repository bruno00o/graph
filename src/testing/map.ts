import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl'
import { globeMatrices } from './globe'

export interface Toggle {
  enabled: boolean
  isEnabled(): boolean
  enable(): void
  disable(): void
  enableRotation(): void
  disableRotation(): void
}

export interface FakeMap {
  readonly map: MapLibreMap
  readonly fake: Readonly<
    Record<
      | 'dragRotate'
      | 'touchZoomRotate'
      | 'keyboard'
      | 'touchPitch'
      | 'dragPan'
      | 'boxZoom'
      | 'doubleClickZoom',
      Toggle
    >
  >
  readonly camera: { lng: number; lat: number; zoom: number; bearing: number; pitch: number }
  readonly state: {
    maxPitch: number
    repaints: number
    jumps: { center: [number, number]; zoom: number }[]
  }
  readonly layers: Map<string, CustomLayerInterface>
  readonly listeners: Map<string, Set<() => void>>
  readonly canvas: HTMLCanvasElement
  emit(name: string): void
  render(input?: unknown): void
}

export const flatInput: unknown = {
  defaultProjectionData: { projectionTransition: 0 },
  shaderData: { variantName: 'mercator' },
}

export function globeInput(longitude: number, latitude: number, zoom: number): unknown {
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

function toggle(enabled = true): Toggle {
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

export function fakeMap(): FakeMap {
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
  const camera: FakeMap['camera'] = { lng: 2.35, lat: 48.86, zoom: 4, bearing: 0, pitch: 0 }
  const state: FakeMap['state'] = { maxPitch: 60, repaints: 0, jumps: [] }
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
