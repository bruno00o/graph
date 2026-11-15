import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import { projectLatitude, projectLongitude, worldSize, worldToGeo } from '../core/geo'
import { createGlobeCamera, type GlobeCamera } from '../core/globe'
import { defaultViewPadding } from '../define-graph'
import { dev } from '../dev'
import { stillborn } from '../host/lifecycle'
import {
  createGraphHost,
  type GraphInstance,
  type GraphSurface,
  type HostDriver,
  type HostSurface,
  type MountGraphOptions,
  type SurfaceCapabilities,
} from '../host/mount-graph'
import { exposeSurface } from '../host/surface-registry'
import type { GraphDefinition, Mark, View } from '../types'
import { createSharedRenderer, createWebglRenderer } from '../webgl/renderer'
import { bindMap } from './binding'

export type { ExportLabels } from '../export'
export { exportMapPng, type MapPngOptions } from './export'

const mapCapabilities: SurfaceCapabilities = Object.freeze({
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
})
const elementStyle =
  'position:absolute;inset:0;overflow:hidden;outline:none;outline-offset:-2px;pointer-events:none'

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

function releaseNorth(map: MapLibreMap, removed: boolean): void {
  const held = holds.get(map)
  if (!held) return
  held.count--
  if (held.count > 0) return
  holds.delete(map)
  if (removed) return
  const { turned } = held
  if (turned.rotate) {
    map.dragRotate.enable()
    map.touchZoomRotate.enableRotation()
    map.keyboard.enableRotation()
  }
  if (turned.pitch) map.touchPitch.enable()
  map.setMaxPitch(turned.maxPitch)
}

/** Options of `mapSurface`. */
export interface MapSurfaceOptions {
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

/** Options of `mountMapGraph`. `S` and `M` come from the definition. */
export interface MapGraphOptions<S extends string = string, M extends Mark = Mark>
  extends Omit<MountGraphOptions<S, M>, 'initialView' | 'view' | 'onViewChange' | 'surface'> {
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

function hostSurface(map: MapLibreMap, options: MapSurfaceOptions): HostSurface {
  const { id = 'graph', beforeId } = options
  const canvas = map.getCanvas()
  let driver: HostDriver | null = null
  let active = false
  let listening = false
  let removed = false
  let placed: HTMLElement | null = null
  let pendingView: View | null = null
  let warned = false
  let warnedLayout = false
  const claimed = { dragPan: false, boxZoom: false }
  let doubleClick = false

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
    if (!view || !active || removed) return
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
      if (!driver || !active) return
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
    if (!listening || map.getLayer(id)) return
    map.addLayer(layer, wantedBefore())
  }

  function keepPlace(): void {
    if (!listening || !map.getLayer(id)) return
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
    if (listening && !map.getLayer(id) && map.isStyleLoaded()) addLayer()
  }

  function onContextLost(): void {
    driver?.detach()
  }

  function onContextRestored(): void {
    if (!listening) return
    if (map.getLayer(id)) map.removeLayer(id)
    addWhenLoaded()
  }

  function onMapRemoved(): void {
    removed = true
    if (active) {
      if (dev) console.warn('graph: the map was removed, the graph went back to its own canvas')
      driver?.evict()
    }
    unlisten()
    driver?.detach()
    driver = null
  }

  function listen(): void {
    if (listening) return
    listening = true
    map.on('style.load', onStyleLoad)
    map.on('data', addWhenLoaded)
    map.on('webglcontextlost', onContextLost)
    map.on('webglcontextrestored', onContextRestored)
    map.on('remove', onMapRemoved)
  }

  function unlisten(): void {
    if (!listening) return
    listening = false
    map.off('style.load', onStyleLoad)
    map.off('data', addWhenLoaded)
    map.off('webglcontextlost', onContextLost)
    map.off('webglcontextrestored', onContextRestored)
    map.off('remove', onMapRemoved)
  }

  const surface: HostSurface = {
    ...mapCapabilities,
    events: canvas,
    place: (element) => {
      if (removed) throw new Error('graph: the map of this surface was removed')
      if (active) throw new Error('graph: the surface already holds a graph')
      active = true
      placed = element
      element.style.cssText = elementStyle
      map.getCanvasContainer().after(element)
      element.addEventListener('keydown', keepKeys)
      holdNorth(map)
      if (map.getBearing() !== 0 || map.getPitch() !== 0) map.jumpTo({ bearing: 0, pitch: 0 })
    },
    unplace: (element) => {
      if (!active) return
      active = false
      placed = null
      pendingView = null
      element.removeEventListener('keydown', keepKeys)
      if (!removed) {
        surface.claim(false)
        surface.hover(false)
      }
      canvas.style.cursor = ''
      releaseNorth(map, removed)
    },
    camera: () =>
      removed ? null : { view: camera(), width: canvas.clientWidth, height: canvas.clientHeight },
    schedule: () => {
      if (!removed) map.triggerRepaint()
      return -1
    },
    cancel: () => {},
    claim: (on) => {
      if (on) {
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
    hover: (on) => {
      if (on && !doubleClick && map.doubleClickZoom.isEnabled()) {
        doubleClick = true
        map.doubleClickZoom.disable()
      } else if (!on && doubleClick) {
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
      if (driver !== next) {
        if (listening && map.getLayer(id)) map.removeLayer(id)
        driver?.detach()
        driver = next
      }
      listen()
      addWhenLoaded()
    },
    release: () => {
      if (active) driver?.evict()
      if (active && placed) surface.unplace(placed)
      if (!removed && listening && map.getLayer(id)) map.removeLayer(id)
      unlisten()
      driver?.detach()
      driver = null
    },
  }
  bindMap(surface, map)
  return surface
}

/**
 * A surface that draws a graph inside a MapLibre map, as a custom layer that shares the map's
 * WebGL context. Pass it as `surface` to `mountGraph` or to `update` to move a graph onto the map,
 * and `null` to bring it back to its own canvas. The layer and its renderer are added when a graph
 * first comes, and kept after it leaves, so that it comes back quickly: `release()` frees them.
 * While the graph is on the map, the map stays north up and without pitch, and removing the map
 * brings the graph back to its own canvas.
 */
export function mapSurface(map: MapLibreMap, options: MapSurfaceOptions = {}): GraphSurface {
  const host = hostSurface(map, options)
  const surface: GraphSurface = Object.freeze({
    name: host.name,
    release: () => host.release(),
  })
  exposeSurface(surface, host)
  return surface
}

/**
 * Draws a graph inside a MapLibre map, as a custom layer that shares the map's WebGL context. Nodes
 * placed by `longitude` and `latitude` follow the map, flat or on the globe projection; the map owns
 * pan, zoom and their gestures, and `view` calls move the map. The map stays north up and without
 * pitch: rotation and pitch are turned off until the last graph on the map is destroyed. Layouts,
 * edge bundling and the background grid of the definition are ignored; hulls and groups follow the
 * map, and the padding of group containers is in pixels. It is `mountGraph` with a `mapSurface`
 * released with the graph.
 */
export function mountMapGraph<S extends string = string, M extends Mark = Mark>(
  map: MapLibreMap,
  options: MapGraphOptions<S, M>,
): GraphInstance<S, M> {
  const { id, beforeId, ...rest } = options
  if (rest.signal?.aborted) return stillborn(rest, rest.signal, mapCapabilities)
  return createGraphHost(
    map.getContainer(),
    { ...rest, surface: mapSurface(map, { id, beforeId }) },
    createWebglRenderer,
  )
}
