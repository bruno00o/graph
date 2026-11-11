import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import { projectLatitude, projectLongitude, worldSize, worldToGeo } from '../core/geo'
import { createGlobeCamera, type GlobeCamera } from '../core/globe'
import { defaultViewPadding } from '../define-graph'
import { dev } from '../dev'
import { stillborn } from '../host/lifecycle'
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

interface Turned {
  readonly rotate: boolean
  readonly pitch: boolean
  readonly maxPitch: number
}

const holds = new WeakMap<MapLibreMap, { count: number; readonly turned: Turned }>()

function holdNorth(map: MapLibreMap): void {
  const held = holds.get(map)
  if (held) {
    held.count++
    return
  }
  holds.set(map, {
    count: 1,
    turned: {
      rotate: map.dragRotate.isEnabled(),
      pitch: map.touchPitch.isEnabled(),
      maxPitch: map.getMaxPitch(),
    },
  })
  map.dragRotate.disable()
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
  map.touchPitch.disable()
  map.setMaxPitch(0)
}

function releaseNorth(map: MapLibreMap): void {
  const held = holds.get(map)
  if (!held) return
  held.count--
  if (held.count > 0) return
  holds.delete(map)
  const { turned } = held
  if (turned.rotate) {
    map.dragRotate.enable()
    map.touchZoomRotate.enableRotation()
    map.keyboard.enableRotation()
  }
  if (turned.pitch) map.touchPitch.enable()
  map.setMaxPitch(turned.maxPitch)
}

/** Options of `mountMapGraph`. `S` and `M` come from the definition. */
export interface MapGraphOptions<S extends string = string, M extends Mark = Mark>
  extends Omit<MountGraphOptions<S, M>, 'initialView' | 'view' | 'onViewChange'> {
  /**
   * Id of the custom layer added to the map style.
   * @default 'graph'
   */
  readonly id?: string | undefined
  /**
   * Id of the style layer to draw the graph under, such as the place labels of the basemap.
   * Defaults to the top of the style. The layer keeps this place after `setStyle`.
   */
  readonly beforeId?: string | undefined
}

/**
 * Draws a graph inside a MapLibre map, as a custom layer that shares the map's WebGL context. Nodes
 * placed by `longitude` and `latitude` follow the map, flat or on the globe projection; the map owns
 * pan, zoom and their gestures, and `view` calls move the map. The map stays north up and without
 * pitch: rotation and pitch are turned off until the last graph on the map is destroyed. Layouts,
 * edge bundling and the background grid of the definition are ignored; hulls and groups follow the
 * map, and the padding of group containers is in pixels.
 */
export function mountMapGraph<S extends string = string, M extends Mark = Mark>(
  map: MapLibreMap,
  options: MapGraphOptions<S, M>,
): GraphInstance<S, M> {
  const { id = 'graph', beforeId, ...rest } = options
  if (rest.signal?.aborted) return stillborn(rest, rest.signal)
  const canvas = map.getCanvas()
  let driver: HostDriver | null = null
  let destroyed = false
  let pendingView: View | null = null
  let warned = false
  let warnedLayout = false
  const claimed = { dragPan: false, boxZoom: false }
  let doubleClick = false
  holdNorth(map)
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
    if (dev && definition.layout && !warnedLayout) {
      warnedLayout = true
      console.warn(
        'graph: layouts do not run on a map, nodes without coordinates stay near their neighbors',
      )
    }
    return {
      ...definition,
      layout: null,
      background: null,
      bundling: null,
      routing: null,
      bridges: null,
      view: {
        minZoom: 2 ** map.getMinZoom(),
        maxZoom: 2 ** map.getMaxZoom(),
        bounds: null,
        padding: defaultViewPadding,
        autoFit: 'never',
      },
    }
  }

  function warnTilted(): void {
    if (!dev || warned) return
    if (map.getBearing() === 0 && map.getPitch() === 0) return
    warned = true
    console.warn('graph: the map layer draws on a north-up map without pitch only')
  }

  function globeOf(
    input: CustomRenderMethodInput,
    view: View,
    width: number,
    height: number,
  ): GlobeCamera | null {
    const data = input.defaultProjectionData
    const mix = data.projectionTransition
    if (!(mix > 0) || input.shaderData.variantName === 'mercator') return null
    const fallback = data.fallbackMatrix
    const depth = ((fallback[3] ?? 0) + (fallback[7] ?? 0)) / 2 + (fallback[15] ?? 0)
    return createGlobeCamera({
      matrix: data.mainMatrix,
      plane: data.clippingPlane,
      mix: Math.min(1, mix),
      depth: depth > 0 ? depth : 1,
      view,
      width,
      height,
    })
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
    render: (_, input) => {
      if (!driver) return
      warnTilted()
      const view = camera()
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const globe = globeOf(input, view, width, height)
      driver.follow(view, map.getPixelRatio(), width, height, globe)
      driver.frame(performance.now())
    },
  }

  function keepKeys(event: KeyboardEvent): void {
    if (event.defaultPrevented) event.stopPropagation()
  }

  function wantedBefore(): string | undefined {
    return beforeId !== undefined && map.getLayer(beforeId) ? beforeId : undefined
  }

  function addLayer(): void {
    if (destroyed || map.getLayer(id)) return
    map.addLayer(layer, wantedBefore())
  }

  function keepPlace(): void {
    if (destroyed || !map.getLayer(id)) return
    const order = map.getLayersOrder()
    const at = order.indexOf(id)
    const before = wantedBefore()
    const wanted = before === undefined ? order.length - 1 : order.indexOf(before) - 1
    if (at !== wanted) map.moveLayer(id, before)
  }

  function onStyleLoad(): void {
    if (map.getLayer(id)) keepPlace()
    else addLayer()
  }

  function addWhenLoaded(): void {
    if (!destroyed && !map.getLayer(id) && map.isStyleLoaded()) addLayer()
  }

  function onContextLost(): void {
    driver?.detach()
  }

  function onContextRestored(): void {
    if (destroyed) return
    if (map.getLayer(id)) map.removeLayer(id)
    addWhenLoaded()
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
      map.off('style.load', onStyleLoad)
      map.off('data', addWhenLoaded)
      map.off('webglcontextlost', onContextLost)
      map.off('webglcontextrestored', onContextRestored)
      graph.element.removeEventListener('keydown', keepKeys)
      if (map.getLayer(id)) map.removeLayer(id)
      driver = null
      canvas.style.cursor = ''
      releaseNorth(map)
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
  map.on('style.load', onStyleLoad)
  map.on('data', addWhenLoaded)
  map.on('webglcontextlost', onContextLost)
  map.on('webglcontextrestored', onContextRestored)
  addWhenLoaded()
  return graph
}
