import type { ShapeRecord } from '../core/graph-model'
import type { Positions } from '../core/positions'
import type { Projection } from '../core/projection'
import type { Scene } from '../core/scene'
import type { ShapeShift } from '../core/shape-store'
import type { StateBuffers } from '../core/state-buffers'
import { detailStep, type Sight } from '../core/visibility'
import type { ResolvedDefinition } from '../resolved-definition'
import type { Key } from '../types'
import type { BridgeHost } from './bridges'
import type { BundleHost } from './bundles'
import type { HostCamera } from './camera'
import type { ContainerBoxes } from './containers'
import type { Decorations } from './decorations'
import type { ColorSource, FrameClock } from './environment'
import { exposeSnapshot } from './export-source'
import type { GraphState, RendererFactory, SurfaceCapabilities } from './graph-instance'
import { exposeInternals, type GraphWatcher } from './internals'
import type { LayerControl } from './layer-control'
import type { PaletteColors } from './palette-colors'
import type { PointerTool } from './pointer-tool'
import type { StateRegistry } from './state-registry'
import type { TimeControl } from './time-control'

export interface ExposureRatio {
  readonly pixelRatio: number
  readonly software: boolean | null
  ratioFor(software: boolean): number
}

export interface ExposureSource {
  readonly scene: Scene
  readonly positions: Positions
  readonly buffers: StateBuffers
  readonly registry: StateRegistry
  readonly projection: Projection
  readonly containers: ContainerBoxes
  readonly decorations: Decorations
  readonly bundles: BundleHost
  readonly bridges: BridgeHost
  readonly palette: PaletteColors
  readonly colors: ColorSource
  readonly render: ExposureRatio
  readonly time: TimeControl
  readonly layers: LayerControl
  readonly camera: HostCamera
  readonly watchers: Set<GraphWatcher>
  readonly createRenderer: RendererFactory
  readonly frames: FrameClock
  surface(): SurfaceCapabilities
  definition(): ResolvedDefinition
  state(): GraphState
  sight(except?: string | null): Sight
  sceneVersion(): number
  syncContainers(): void
  prepare(): void
  request(): void
  destroyed(): boolean
  tool(tool: PointerTool | null): boolean
  draft(keys: readonly Key[], shifts?: readonly ShapeShift[]): void
  shape(key: Key): ShapeRecord | null
  title(): string | null
}

export function exposeGraph(graph: object, source: ExposureSource): void {
  const { scene, positions, buffers, projection, containers, palette, watchers } = source
  exposeInternals(graph, {
    get onMap() {
      return source.surface().onMap
    },
    surface: () => source.surface(),
    scene,
    positions,
    definition: source.definition,
    containers: () => (projection.active ? containers : null),
    palette: () => palette.colors,
    masks: () => buffers.nodeMask,
    edgeMembers: (index, end) => projection.keysAt(index, end),
    datum: (kind, index) =>
      kind === 'nodes'
        ? projection.view.nodeAt(index)?.datum
        : kind === 'edges'
          ? projection.view.edgeAt(index)?.datum
          : projection.view.shapeAt?.(index)?.datum,
    sight: (except) => source.sight(except ?? null),
    stamp: () => ({
      scene: source.sceneVersion(),
      positions: positions.version,
      palette: palette.stamp,
      containers: projection.active ? containers.version : -1,
      detail: detailStep(scene.nodes, scene.edges, source.sight(), scene.shapes),
    }),
    watch(watcher) {
      if (source.destroyed()) {
        watcher.destroy()
        return () => {}
      }
      watchers.add(watcher)
      source.request()
      return () => {
        watchers.delete(watcher)
      }
    },
    tool: source.tool,
    draft: source.draft,
    shape: source.shape,
    globe: () => source.camera.sphere(),
    frames: source.frames,
  })

  exposeSnapshot(graph, source.surface().name !== 'none', () => {
    if (source.destroyed()) throw new Error('graph: cannot export a destroyed graph')
    const { decorations, bundles, bridges, colors, render, time, layers } = source
    source.prepare()
    source.registry.takeHighlighted()
    source.syncContainers()
    decorations.settle()
    if (scene.palette.version !== palette.version) palette.resolve(false)
    buffers.reserve(scene.nodes.capacity, scene.edges.capacity)
    source.request()
    const { view, width, height } = source.state()
    return {
      scene,
      positions,
      states: buffers,
      grid: decorations.grid,
      hulls: decorations.hulls,
      containers: projection.active ? containers : null,
      bundles: bundles.paths.any ? bundles.paths : null,
      bridges: bridges.active ? bridges.set : null,
      palette: palette.colors,
      theme: colors.theme(),
      view,
      window: time.filter,
      layers: layers.filter,
      fade: time.fade,
      width,
      height,
      pixelRatio: render.pixelRatio,
      software: render.software,
      globe: source.camera.sphere(),
      title: source.title(),
      color: (css) => colors.color(css),
      ratioFor: (software) => render.ratioFor(software),
      hullsFor(sight, at, boxes) {
        const hulls = decorations.hullsFor(sight, at, boxes)
        if (scene.palette.version !== palette.version) palette.resolve(false)
        return hulls
      },
      createRenderer: source.createRenderer,
    }
  })
}
