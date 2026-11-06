import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl'
import { projectLatitude, projectLongitude, worldSize, worldToGeo } from '../core/geo'
import { dev } from '../dev'
import {
  createGraphHost,
  type GraphInstance,
  type HostDriver,
  type HostSurface,
  type MountGraphOptions,
} from '../host/mount-graph'
import type { GraphDefinition, Mark, View } from '../types'
import { createSharedRenderer, createWebglRenderer } from '../webgl/renderer'
import { bindMap, unbindMap } from './binding'

export type { ExportLabels } from '../export'
export { exportMapPng, type MapPngOptions } from './export'

/** Options of `mountMapGraph`. `S` and `M` come from the definition. */
export interface MapGraphOptions<S extends string = string, M extends Mark = Mark>
  extends Omit<MountGraphOptions<S, M>, 'initialView' | 'view' | 'onViewChange'> {
  /**
   * Id of the custom layer added to the map style.
   * @default 'graph'
   */
  readonly id?: string
  /**
   * Id of the style layer to draw the graph under, such as the place labels of the basemap.
   * Defaults to the top of the style.
   */
  readonly beforeId?: string
}

/**
 * Draws a graph inside a MapLibre map, as a custom layer that shares the map's WebGL context. Nodes
 * placed by `longitude` and `latitude` follow the map; the map owns pan, zoom and their gestures,
 * and `view` calls move the map. The map stays north up and flat: rotation and pitch are turned
 * off until `destroy`. Layouts, hulls and the background grid of the definition are ignored.
 */
export function mountMapGraph<S extends string = string, M extends Mark = Mark>(
  map: MapLibreMap,
  options: MapGraphOptions<S, M>,
): GraphInstance<S, M> {
  const { id = 'graph', beforeId, ...rest } = options
  const canvas = map.getCanvas()
  let driver: HostDriver | null = null
  let destroyed = false
  let pendingView: View | null = null
  let warned = false
  const claimed = { dragPan: false, boxZoom: false }
  let doubleClick = false
  const turned = {
    rotate: map.dragRotate.isEnabled(),
    pitch: map.touchPitch.isEnabled(),
    maxPitch: map.getMaxPitch(),
  }
  map.dragRotate.disable()
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
  map.touchPitch.disable()
  map.setMaxPitch(0)
  if (map.getBearing() !== 0 || map.getPitch() !== 0) map.jumpTo({ bearing: 0, pitch: 0 })

  function shift(): { readonly x: number; readonly y: number } {
    const padding = map.getPadding()
    return {
      x: ((padding.right ?? 0) - (padding.left ?? 0)) / 2,
      y: ((padding.bottom ?? 0) - (padding.top ?? 0)) / 2,
    }
  }

  function camera(): View {
    const center = map.getCenter().wrap()
    const zoom = 2 ** map.getZoom()
    const offset = shift()
    return {
      x: projectLongitude(center.lng) + offset.x / zoom,
      y: projectLatitude(center.lat) + offset.y / zoom,
      zoom,
    }
  }

  function moveMap(): void {
    const view = pendingView
    pendingView = null
    if (!view || destroyed) return
    const offset = shift()
    const zoom = Math.max(view.zoom, Number.MIN_VALUE)
    const x = view.x - offset.x / zoom
    const y = view.y - offset.y / zoom
    const center = worldToGeo({ x: ((x % worldSize) + worldSize) % worldSize, y })
    map.jumpTo({ center: [center.longitude, center.latitude], zoom: Math.log2(zoom) })
  }

  function adapt(definition: GraphDefinition): GraphDefinition {
    return {
      ...definition,
      layout: null,
      background: null,
      hulls: [],
      bundling: null,
      view: { minZoom: 2 ** map.getMinZoom(), maxZoom: 2 ** map.getMaxZoom(), bounds: null },
    }
  }

  function warnTilted(): void {
    if (!dev || warned) return
    const tilted = map.getBearing() !== 0 || map.getPitch() !== 0
    const globe = map.getProjection()?.type === 'globe'
    if (!tilted && !globe) return
    warned = true
    console.warn('graph: the map layer draws on a flat, north-up Mercator map only')
  }

  const layer: CustomLayerInterface = {
    id,
    type: 'custom',
    renderingMode: '2d',
    onAdd: (_, gl) => {
      driver?.attach((invalidate) => createSharedRenderer(gl, invalidate))
    },
    onRemove: () => {
      driver?.detach()
    },
    render: () => {
      if (!driver) return
      warnTilted()
      driver.follow(camera(), map.getPixelRatio(), canvas.clientWidth, canvas.clientHeight)
      driver.frame(performance.now())
    },
  }

  function keepKeys(event: KeyboardEvent): void {
    if (event.defaultPrevented) event.stopPropagation()
  }

  function addLayer(): void {
    if (destroyed || map.getLayer(id)) return
    map.addLayer(layer, beforeId !== undefined && map.getLayer(beforeId) ? beforeId : undefined)
  }

  function addWhenLoaded(): void {
    if (!destroyed && !map.getLayer(id) && map.isStyleLoaded()) addLayer()
  }

  const surface: HostSurface = {
    events: canvas,
    schedule: () => map.triggerRepaint(),
    claim: (active) => {
      if (active) {
        claimed.dragPan = map.dragPan.isEnabled()
        claimed.boxZoom = map.boxZoom.isEnabled()
        map.dragPan.disable()
        map.boxZoom.disable()
        return
      }
      if (claimed.dragPan) map.dragPan.enable()
      if (claimed.boxZoom) map.boxZoom.enable()
      claimed.dragPan = false
      claimed.boxZoom = false
    },
    hover: (active) => {
      if (active && !doubleClick && map.doubleClickZoom.isEnabled()) {
        doubleClick = true
        map.doubleClickZoom.disable()
      } else if (!active && doubleClick) {
        doubleClick = false
        map.doubleClickZoom.enable()
      }
    },
    move: (view) => {
      const first = pendingView === null
      pendingView = view
      if (first) queueMicrotask(moveMap)
    },
    adapt,
    bind: (next) => {
      driver = next
    },
    release: () => {
      destroyed = true
      if (doubleClick) map.doubleClickZoom.enable()
      surface.claim(false)
      map.off('style.load', addLayer)
      map.off('data', addWhenLoaded)
      graph.element.removeEventListener('keydown', keepKeys)
      if (map.getLayer(id)) map.removeLayer(id)
      driver = null
      if (turned.rotate) {
        map.dragRotate.enable()
        map.touchZoomRotate.enableRotation()
        map.keyboard.enableRotation()
      }
      if (turned.pitch) map.touchPitch.enable()
      map.setMaxPitch(turned.maxPitch)
      unbindMap(graph)
    },
  }

  const graph = createGraphHost(
    map.getContainer(),
    { ...rest, view: camera() },
    createWebglRenderer,
    surface,
  )
  map.getCanvasContainer().after(graph.element)
  bindMap(graph, map)
  graph.element.addEventListener('keydown', keepKeys)
  map.on('style.load', addLayer)
  map.on('data', addWhenLoaded)
  addWhenLoaded()
  return graph
}
