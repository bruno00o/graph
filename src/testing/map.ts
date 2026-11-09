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
  readonly styleLayers: Set<string>
  readonly listeners: Map<string, Set<() => void>>
  readonly canvas: HTMLCanvasElement
  order(): string[]
  setStyle(layers: readonly string[], options?: { readonly diff?: boolean }): void
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

export function fakeMap(style: readonly string[] = []): FakeMap {
  const container = document.createElement('div')
  const canvasContainer = document.createElement('div')
  const canvas = document.createElement('canvas')
  Object.defineProperty(canvas, 'clientWidth', { value: 800 })
  Object.defineProperty(canvas, 'clientHeight', { value: 600 })
  canvasContainer.append(canvas)
  container.append(canvasContainer)
  document.body.append(container)
  const layers = new Map<string, CustomLayerInterface>()
  const styleLayers = new Set<string>(style)
  const stacked: string[] = [...style]
  const listeners = new Map<string, Set<() => void>>()
  const camera: FakeMap['camera'] = { lng: 2.35, lat: 48.86, zoom: 4, bearing: 0, pitch: 0 }
  const state: FakeMap['state'] = { maxPitch: 60, repaints: 0, jumps: [] }
  const present = (id: string) => layers.has(id) || styleLayers.has(id)
  const order = () => stacked.filter(present)
  const place = (id: string, before?: string) => {
    const from = stacked.indexOf(id)
    if (from !== -1) stacked.splice(from, 1)
    const index = before === undefined ? -1 : stacked.indexOf(before)
    if (index === -1) stacked.push(id)
    else stacked.splice(index, 0, id)
  }
  const emit = (name: string) => {
    for (const listener of listeners.get(name) ?? []) listener()
  }
  const setStyle = (next: readonly string[], options: { readonly diff?: boolean } = {}) => {
    if (options.diff === false) {
      for (const id of [...layers.keys()]) map.removeLayer(id)
      styleLayers.clear()
      stacked.length = 0
      for (const id of next) {
        styleLayers.add(id)
        stacked.push(id)
      }
      emit('style.load')
      return
    }
    let changed = false
    for (const id of [...styleLayers]) {
      if (next.includes(id)) continue
      styleLayers.delete(id)
      stacked.splice(stacked.indexOf(id), 1)
      changed = true
    }
    next.forEach((id, index) => {
      if (styleLayers.has(id)) return
      const following = next.slice(index + 1).find((other) => styleLayers.has(other))
      styleLayers.add(id)
      place(id, following)
      changed = true
    })
    if (changed) emit('style.load')
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
    getLayer: (id: string) => layers.get(id) ?? (styleLayers.has(id) ? { id } : undefined),
    getLayersOrder: () => order(),
    moveLayer: (id: string, before?: string) => {
      if (!present(id) || (before !== undefined && !present(before))) return
      place(id, before)
    },
    addLayer: (layer: CustomLayerInterface, before?: string) => {
      if (before !== undefined && !present(before)) return
      layers.set(layer.id, layer)
      place(layer.id, before)
      layer.onAdd?.(map as unknown as MapLibreMap, {} as WebGL2RenderingContext)
    },
    removeLayer: (id: string) => {
      layers.get(id)?.onRemove?.(map as unknown as MapLibreMap, {} as WebGL2RenderingContext)
      layers.delete(id)
    },
    setStyle,
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
  return {
    map: map as unknown as MapLibreMap,
    fake: map,
    camera,
    state,
    layers,
    styleLayers,
    listeners,
    order,
    setStyle,
    emit,
    render,
    canvas,
  }
}
