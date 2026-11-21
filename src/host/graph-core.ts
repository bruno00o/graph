import { createStore } from '@tanstack/store'
import type { GlobeCamera } from '../core/globe'
import { createGraphModel, type GraphChanges, type GraphModel } from '../core/graph-model'
import type { Hierarchy } from '../core/hierarchy'
import { cutOf, noEntries } from '../core/history'
import type { ContainerSource } from '../core/hull-layer'
import { checkLists, stringCheck } from '../core/key-list'
import { createPathQueries } from '../core/path-query'
import {
  type PositionReader,
  Positions,
  placeNodes,
  placeOnSurface,
  RestoredPositions,
} from '../core/positions'
import { Projection, type ProjectionChanges } from '../core/projection'
import type { Scene } from '../core/scene'
import { createScene } from '../core/scene'
import { type ShapeShift, shiftSlots } from '../core/shape-store'
import type { HideFilter } from '../core/state-buffers'
import { StateBuffers } from '../core/state-buffers'
import { freeStateNames } from '../core/state-names'
import { SupportIndex } from '../core/support'
import { readWindow } from '../core/time-range'
import { type Bounds, zoomAround } from '../core/view'
import {
  detailStep,
  edgeOwnShown,
  filtered,
  nodeShown,
  type Sight,
  shapeShown,
} from '../core/visibility'
import { dev } from '../dev'
import type { ResolvedDefinition } from '../resolved-definition'
import type { Key, KeyList, Layout, Mark, Point, View } from '../types'
import type { AnchorHost } from './anchor-host'
import { BridgeHost } from './bridges'
import { BundleHost } from './bundles'
import { HostCamera } from './camera'
import { ContainerBoxes } from './containers'
import { DataReads, forEachEdgeKey } from './data-reads'
import { DataStatus, loadedData } from './data-status'
import { createDecorations } from './decorations'
import { emptyKeys, toKeys } from './element-keys'
import type { GraphEnvironment } from './environment'
import { Emitter, type GraphTarget } from './events'
import { exposeGraph } from './exposure'
import type { FlowWatch } from './flows'
import type { FocusControl } from './focus-control'
import { FoldControl } from './folding'
import { FrameScheduler } from './frame-scheduler'
import {
  boundsAfter,
  fitIndices,
  movedReader,
  nodeBounds,
  withShapes,
  withWaypoints,
} from './framing'
import type {
  FitOptions,
  GraphCore,
  GraphCoreUpdateOptions,
  GraphCount,
  GraphFocus,
  GraphInstance,
  GraphOptions,
  GraphPositions,
  GraphState,
  GraphStore,
  GraphSurface,
  GraphUpdateOptions,
  GraphView,
  HostDriver,
  HostSurface,
  RendererFactory,
} from './graph-instance'
import { checkDuration, checkFactor, checkFit, checkView, finitePoint } from './inputs'
import { type GraphInspection, type GraphProbe, registerGraph } from './inspect'
import type { GraphWatcher } from './internals'
import { isolated, isolateSubscribers, report } from './isolate'
import { LayerControl, type LayerListener } from './layer-control'
import { LayoutHost } from './layout-session'
import { lensFrame } from './lens'
import type { LensControl } from './lens-control'
import { destroyedReason, untilDestroyed } from './lifecycle'
import type { FrameWaiters } from './page-lifecycle'
import { PaletteColors } from './palette-colors'
import { HostPicker } from './picking'
import { placementUnit } from './placement'
import type { PointerInput } from './pointer-input'
import { positionEvent } from './position-event'
import { PositionMotion } from './position-motion'
import { readonlyOf } from './readonly-store'
import type { RenderHost } from './render-host'
import { SelectionControl } from './selection-control'
import { SpreadHost } from './spread'
import { StateRegistry } from './state-registry'
import { applyStateStyles } from './state-styles'
import { hostSurfaceOf } from './surface-registry'
import { TimeControl } from './time-control'
import { fitRequest, originOf, sameView, ViewControl, type ViewMemory } from './view-control'

export type PageRender = Pick<
  RenderHost,
  | 'renderer'
  | 'full'
  | 'positionsVersion'
  | 'flowTime'
  | 'pixelRatio'
  | 'software'
  | 'contextLost'
  | 'settled'
  | 'cost'
  | 'drawn'
  | 'ratioFor'
  | 'attach'
  | 'detach'
  | 'listen'
  | 'enter'
  | 'resize'
  | 'refreshRatio'
  | 'refreshTheme'
  | 'unwatch'
  | 'release'
>

export type PagePointer = Pick<
  PointerInput,
  | 'hasDrag'
  | 'dragging'
  | 'redrawLasso'
  | 'hover'
  | 'dropLostDrag'
  | 'updateCursor'
  | 'autoPanning'
  | 'stepAutoPan'
  | 'abandon'
  | 'listen'
  | 'unlisten'
  | 'tool'
  | 'setTool'
  | 'stopMoves'
>

export interface PageApi {
  readonly element: HTMLElement
  readonly focus: GraphFocus
  readonly anchors: GraphInstance['anchors']
  readonly lens: GraphInstance['lens']
  readonly drawsOnMap: boolean
  drawn(): Promise<void>
  suspend(): void
  resume(): void
}

export type CoreOptions<S extends string = string, M extends Mark = Mark> = GraphOptions<S, M> & {
  readonly surface?: GraphSurface | null | undefined
  readonly suspended?: boolean | undefined
}

export type CoreUpdate = GraphUpdateOptions & GraphCoreUpdateOptions

interface Waiter {
  readonly resolve: () => void
  readonly reject: (reason: unknown) => void
}

export interface PageControls {
  readonly render: PageRender
  readonly pointer: PagePointer
  readonly focus: Pick<FocusControl, 'set' | 'applyKeyboard'>
  readonly lens: Pick<LensControl, 'shown' | 'wanted' | 'update'>
  readonly anchors: AnchorHost
  readonly waiters: Pick<FrameWaiters, 'drawn' | 'reject'>
  readonly api: object
  start(): FlowWatch
}

export interface HostParts {
  readonly model: GraphModel
  readonly scene: Scene
  readonly positions: Positions
  readonly hierarchy: Hierarchy
  readonly buffers: StateBuffers
  readonly registry: StateRegistry
  readonly spread: SpreadHost
  readonly motion: PositionMotion
  readonly views: ViewControl
  readonly camera: HostCamera
  readonly selection: SelectionControl
  readonly folds: FoldControl
  readonly picker: HostPicker
  readonly layouts: LayoutHost
  readonly emitter: Emitter
  readonly bundles: BundleHost
  readonly palette: PaletteColors
  surface(): HostSurface
  state(): GraphState
  patch(next: Partial<GraphState>): void
  definition(): ResolvedDefinition
  sight(except?: string | null): Sight
  prepare(): void
  request(): void
  destroyed(): boolean
  target(kind: GraphTarget['kind'], key: Key): GraphTarget | null
  concealed(target: GraphTarget): boolean
  edgeKeys(index: number, sight: Sight, visit: (key: Key) => void): void
  edgeIndex(key: Key): number
  containers(): ContainerSource | null
  sphere(): GlobeCamera | null
  reconstrain(): void
  remeasured(): void
  sceneVersion(): number
  drawNow(): void
  framing(): boolean
  due(): boolean
}

export interface HostPage {
  readonly createRenderer: RendererFactory
  place(surface: HostSurface): void
  unplace(surface: HostSurface): void
  open(parts: HostParts): PageControls
  focused(): boolean
  focus(): void
  measure(): { readonly width: number; readonly height: number }
  unlisten(): void
  remove(): void
  update(next: CoreUpdate): void
  dead(
    store: GraphStore,
    signal: AbortSignal,
    reason: () => unknown,
    shaped: () => boolean,
  ): GraphCore
  title(): string | null
}

const idleLayout = Object.freeze({ running: false, progress: 0 })
const idleBundling = Object.freeze({ running: false })
const rebaseDistance = 2 ** 20

export function createGraphCore<S extends string = string, M extends Mark = Mark>(
  options: CoreOptions<S, M>,
  environment: GraphEnvironment,
  page: HostPage,
): GraphCore<S, M> {
  const { home, colors, textWidths, still, work, quiet, frames } = environment
  let surface: HostSurface = hostSurfaceOf(options.surface) ?? home
  let given: ResolvedDefinition = options.definition as ResolvedDefinition<S, M>
  let definition: ResolvedDefinition = surface.adapt(given)
  const controlled = options.selection !== undefined
  const viewControlled = options.view !== undefined
  const foldControlled = options.folded !== undefined
  const timeControlled = options.time !== undefined
  const layersControlled = options.hiddenLayers !== undefined
  let onViewChange = isolated(options.onViewChange)
  const check = stringCheck()
  const foldNew = typeof options.initialFolded === 'function' ? options.initialFolded : null
  const initialFolded = foldNew ? undefined : (options.initialFolded as KeyList | undefined)
  check(initialFolded, 'the initialFolded option')
  check(options.folded, 'the folded option')
  check(options.initialHiddenLayers, 'the initialHiddenLayers option')
  check(options.hiddenLayers, 'the hiddenLayers option')
  checkLists(check, options.selection, 'the selection.$ option')
  const base = {
    state: () => store.get(),
    patch,
    definition: () => definition,
    request: () => request(),
    destroyed: () => destroyed,
  }
  const emitter = new Emitter()
  const timeWindow = new TimeControl(
    {
      ...base,
      controlled: timeControlled,
      emitter,
      readAt: (window) => {
        model.readAt(cutOf(window))
        selectTimes()
      },
    },
    options.time ?? options.initialTime ?? null,
    options.onTimeChange,
  )
  let hideChecked = 0
  let shownDetail = -1
  page.place(surface)
  const visited = new Set<HostSurface>([home, surface])
  const drivers = new Map<HostSurface, HostDriver>()
  const memories = new Map<HostSurface, ViewMemory>()
  let heldView: View | null = null
  const startCamera = surface.camera()
  const startView = options.view ?? options.initialView ?? null

  let destroyed = false
  let flushing = false
  let framing = false
  let sceneVersion = 0
  let probe: GraphProbe | null = null
  let drafted: readonly Key[] = []
  let shifted: readonly ShapeShift[] = []
  const watchers = new Set<GraphWatcher>()
  const lifetime = new AbortController()
  let endReason: unknown = null
  const settling: Waiter[] = []
  let settleCheck: ReturnType<typeof setTimeout> | undefined
  const scheduler = new FrameScheduler(
    frame,
    () => surface,
    () => destroyed,
  )

  const model = createGraphModel({ schedule: () => request(true) })
  model.readAt(cutOf(timeWindow.window))
  const scene = createScene(
    textWidths.width,
    surface.groupFillOpacity === null ? {} : { groupFillOpacity: surface.groupFillOpacity },
  )
  selectTimes()
  scene.shapes.work = work
  const positions = new Positions()
  let restore: RestoredPositions | null = null
  if (options.initialPositions !== undefined) {
    restore = new RestoredPositions(options.initialPositions)
    if (dev && restore.skipped > 0) {
      console.warn(
        `graph: initialPositions skipped ${restore.skipped} entr${restore.skipped === 1 ? 'y' : 'ies'} without a key and a finite x and y`,
      )
    }
    if (restore.size === 0) restore = null
  }
  const buffers = new StateBuffers()
  const projection = new Projection(model)
  const support = new SupportIndex(model)
  const hierarchy = projection.hierarchy
  const containerBoxes = new ContainerBoxes()
  const spread = new SpreadHost({
    nodes: scene.nodes,
    hierarchy,
    positions,
    containers: projection.containers,
    placeGap: () => definition.spread?.gap ?? null,
    eligible: (index) =>
      !Number.isNaN(positions.source[index * 2] ?? Number.NaN) ||
      (definition.layout === null && positions.restored[index] !== 1 && !layouts.placedBy(index)),
    settled: () => motion.settled(),
    claim: (index) => motion.free(index),
    camera: () => {
      const { view, width, height } = store.get()
      return { zoom: view.zoom, globe: camera.sphere(), width, height }
    },
    duration: () => (still() ? 0 : definition.transitions.layout),
  })
  const layers = new LayerControl(
    {
      ...base,
      controlled: layersControlled,
      scene,
      emitter,
      reorder: () => registry.reorder(),
      dropHidden,
    },
    options.hiddenLayers ?? options.initialHiddenLayers ?? [],
    options.onLayerChange as LayerListener,
  )
  const registry = new StateRegistry(
    model,
    buffers,
    {
      indexOf: (key) => projection.edgeIndexOf(key),
      keysAt: (index, end) => projection.keysAt(index, end),
      halvedAt: (index) => projection.halvedAt(index),
    },
    (kind, index) => layers.position(kind, index),
    (kind) => (kind === 'nodes' && scene.nodes.order.used ? scene.nodes.order : null),
  )
  const palette = new PaletteColors(scene, colors, (shown, count) =>
    render.renderer?.setPalette(shown, count),
  )

  registry.setShaped(definition.marks.some((mark) => mark.type === 'shapes'))
  registry.define(freeStateNames(definition.states))
  if (options.selection !== undefined) registry.set('selected', options.selection)
  projection.setFolded(options.folded ?? initialFolded ?? [])
  if (foldNew) {
    hierarchy.foldNew = (index) => {
      const record = model.nodeAt(index)
      if (!record) return false
      try {
        return foldNew({
          kind: 'node',
          key: record.key,
          datum: record.datum,
          mark: record.mark.name,
        } as never)
      } catch (error) {
        report(error)
        return false
      }
    }
  }
  const selection = new SelectionControl(
    {
      ...base,
      controlled,
      registry,
      support,
      emitter,
    },
    options.onSelectionChange,
  )
  const store = createStore<GraphState>({
    view: startCamera?.view ?? startView ?? { x: 0, y: 0, zoom: 1 },
    width: startCamera?.width ?? 0,
    height: startCamera?.height ?? 0,
    hovered: null,
    focused: null,
    selection: controlled ? registry.members('selected') : emptyKeys(registry.shaped),
    states: selection.freeStates(),
    positionsVersion: 0,
    layout: idleLayout,
    folded: [...projection.folded],
    bundling: idleBundling,
    routing: idleBundling,
    time: timeWindow.window,
    lens: null,
    hiddenLayers: layers.hidden,
    data: loadedData,
    surface: surface.name,
    suspended: options.suspended === true,
  })
  const readonlyStore: GraphStore = isolateSubscribers(readonlyOf(store))
  const bundles = new BundleHost(
    {
      edges: scene.edges,
      nodes: scene.nodes,
      positions,
      datum: (index) => {
        const key = scene.edges.keys[index]
        return key === undefined ? undefined : model.edge(key)?.datum
      },
      busy: () => layouts.session !== null || motion.active || pointer.hasDrag(),
      duration: () => definition.transitions.layout,
      frameCost: () => render.cost.value,
      request: () => request(),
      running: (running, kind) => {
        const status = kind === 'route' ? 'routing' : 'bundling'
        if (store.get()[status].running !== running) patch({ [status]: { running } })
      },
      zoom: () => store.get().view.zoom,
      boxes: () => routeBoxes(),
      sight: () => sight(),
      holder: (index) => {
        if (!projection.active) return -1
        const above = hierarchy.parent[index] ?? -1
        return above >= 0 && projection.containers.has(above) ? above : -1
      },
      work,
      quiet,
    },
    still,
  )
  function routeBoxes(): Float32Array | null {
    if (!projection.active) return null
    syncContainers()
    return containerBoxes.boxes
  }
  const bridges = new BridgeHost({
    edges: scene.edges,
    nodes: scene.nodes,
    positions,
    paths: bundles.paths,
    zoom: () => store.get().view.zoom,
    boxes: routeBoxes,
    busy: () => layouts.session !== null || motion.active || pointer.hasDrag(),
    request: () => request(),
    sight: () => sight(),
    quiet,
    slice: work.slice,
  })
  const decorations = createDecorations({
    ...base,
    model,
    scene,
    positions,
    sight: () => sight(),
    containers: () => (projection.active ? containerBoxes : null),
  })

  const views = new ViewControl({
    ...base,
    controlled: () => viewControlled || !surface.ownCamera,
    given: options.initialView !== undefined || viewControlled || startCamera !== null,
    emitter,
    frameCost: () => render.cost.value,
    still,
    deliver: (sent) =>
      scheduler.hush(() =>
        surface.ownCamera
          ? onViewChange?.({ view: sent.view, origin: originOf(sent.cause) })
          : surface.move(sent.view),
      ),
    published: () => pointer.redrawLasso(),
    measure: (keys) =>
      withShapes(
        withWaypoints(
          bounds(fitIndices(keys, model, projection, scene.edges), motion.settled()),
          keys,
          projection,
          scene.edges,
          bundles.paths,
          motion.settled(),
        ),
        keys,
        scene.shapes,
        (key) => model.shape(key)?.index ?? -1,
        motion.settled(),
      ),
    limitBounds: () => bounds(),
    sceneVersion: () => sceneVersion,
    positionsVersion: () => positions.version,
    waiting: () => data.holds(),
  })
  const camera = new HostCamera({
    positions,
    state: () => store.get(),
    viewport: () => views.viewport(),
    lens: () => lens.shown,
  })
  const placing = (zoom: () => number) =>
    placementUnit({ nodes: scene.nodes, model, zoom, globe: () => camera.sphere() })
  const placement = placing(() => store.get().view.zoom)
  const motion = new PositionMotion({
    ...base,
    positions,
    spread,
    dragging: () => pointer.dragging(),
    frameCost: () => render.cost.value,
    still,
  })
  const layouts = new LayoutHost({
    ...base,
    surface: () => surface,
    scene,
    model,
    positions,
    projection,
    spread,
    motion,
    views,
    bundles,
    emitter,
    work,
    dragging: () => pointer.dragging(),
    boundsAfter: (indices, to, keys) =>
      withShapes(
        boundsAfter(
          scene.nodes,
          hierarchy,
          () => motion.settled(),
          indices,
          to,
          fitIndices(keys, model, projection, scene.edges),
        ),
        keys,
        scene.shapes,
        (key) => model.shape(key)?.index ?? -1,
        scene.shapes.pinCount > 0 ? movedReader(motion.settled(), indices, to) : motion.settled(),
      ),
    prepare: flushPending,
    containers: () => syncContainers(),
    waiting: () => data.holds(),
  })
  const data = new DataStatus({
    ...base,
    model,
    emitter,
    wait: () => definition.waitForData,
    flush: flushPending,
    request: () => request(true),
    released: () => {
      layouts.release()
      request()
    },
  })
  const folds = new FoldControl(
    {
      ...base,
      controlled: foldControlled,
      model,
      scene,
      positions,
      projection,
      motion,
      emitter,
      places: () => layouts.places(),
      makeRoom: (moving, to) => layouts.makeRoom(moving, to),
      arranger: (index) => layouts.arranger(index),
      arranges: () => layouts.arranges(),
      request: (flush) => request(flush),
      prepare: flushPending,
      unit: placement,
    },
    options.onFoldChange,
  )
  const picker = new HostPicker({
    scene,
    model,
    positions,
    buffers,
    projection,
    containers: containerBoxes,
    paths: bundles.paths,
    camera,
    layerPosition: (kind, index) => layers.position(kind, index),
    viewport: () => views.viewport(),
    timeFilter: () => timeWindow.filter,
    layerFilter: () => layers.filter,
    syncContainers,
    sceneVersion: () => sceneVersion,
    dragging: () => pointer.hasDrag(),
    moving: () => layouts.session !== null || motion.active || spread.writing,
  })
  const reads = new DataReads({ model, projection, hierarchy, support, scene, buffers, emitter })
  scene.shapes.wake = () => {
    if (destroyed) return
    reads.refreshIssues()
    request()
  }
  const parts: HostParts = {
    ...base,
    model,
    scene,
    positions,
    hierarchy,
    buffers,
    registry,
    spread,
    motion,
    views,
    camera,
    selection,
    folds,
    picker,
    layouts,
    emitter,
    bundles,
    palette,
    surface: () => surface,
    sight,
    prepare: flushPending,
    target: (kind, key) => picker.target(kind, key),
    concealed,
    edgeKeys: (index, seen, visit) =>
      forEachEdgeKey(projection, scene.edges.keys, index, seen, visit),
    edgeIndex: (key) => projection.edgeIndexOf(key),
    containers: () => (projection.active ? containerBoxes : null),
    sphere: () => camera.sphere(),
    reconstrain: () => views.reconstrain(),
    remeasured: () => {
      sceneVersion++
    },
    sceneVersion: () => sceneVersion,
    drawNow,
    framing: () => framing,
    due: () => scheduler.due,
  }
  const { render, pointer, focus, lens, anchors, waiters, api, start } = page.open(parts)
  const flows = start()

  function sight(except: string | null = null): Sight {
    return {
      zoom: store.get().view.zoom,
      time: timeWindow.filter,
      layers: layers.filter,
      hide: hideFilter(except),
    }
  }

  function hideFilter(except: string | null): HideFilter | null {
    const hide = buffers.hide
    const bit = hide && except !== null ? registry.bit(except) : -1
    if (!hide || bit < 0) return hide
    const flag = (1 << bit) >>> 0
    const all =
      hide.nodes | hide.edges | hide.shapes | hide.otherNodes | hide.otherEdges | hide.otherShapes
    if ((all & flag) === 0) return hide
    const nodes = (hide.nodes & ~flag) >>> 0
    const edges = (hide.edges & ~flag) >>> 0
    const shapes = (hide.shapes & ~flag) >>> 0
    const otherNodes = (hide.otherNodes & ~flag) >>> 0
    const otherEdges = (hide.otherEdges & ~flag) >>> 0
    const otherShapes = (hide.otherShapes & ~flag) >>> 0
    return (nodes | edges | shapes | otherNodes | otherEdges | otherShapes) === 0
      ? null
      : { ...hide, nodes, edges, shapes, otherNodes, otherEdges, otherShapes }
  }

  function dropHidden(): void {
    const hovered = store.get().hovered
    if (hovered && !targetShown(hovered)) pointer.hover(null, null)
    const focused = store.get().focused
    if (focused && !targetShown(focused)) focus.set(null)
  }

  function targetShown(element: GraphTarget): boolean {
    if (!layers.filter && !buffers.hide) return true
    const seen = sight()
    if (element.kind === 'shape') {
      const index = model.shape(element.key)?.index ?? -1
      return index < 0 || shapeShown(scene.shapes, index, seen)
    }
    if (element.kind === 'node') {
      const index = model.node(element.key)?.index ?? -1
      return index < 0 || nodeShown(scene.nodes, index, seen)
    }
    const index = projection.edgeIndexOf(element.key)
    return (
      index < 0 ||
      scene.edges.alive[index] !== 1 ||
      (edgeOwnShown(scene.edges, index, seen) &&
        nodeShown(scene.nodes, scene.edges.source[index] ?? 0, seen) &&
        nodeShown(scene.nodes, scene.edges.target[index] ?? 0, seen))
    )
  }

  function patch(next: Partial<GraphState>): void {
    if (destroyed) return
    store.setState((state) => ({ ...state, ...next }))
  }

  function request(flush = false): void {
    scheduler.request(flush)
  }

  function clock(): number {
    return probe ? performance.now() : 0
  }

  function applyStyles(): void {
    applyStateStyles(
      definition.states,
      registry,
      buffers,
      (color) => scene.palette.id(color),
      projection.active,
    )
  }

  function syncContainers(): void {
    if (!projection.active) return
    containerBoxes.sync(
      projection.containers,
      projection.containerVersion,
      hierarchy,
      scene.nodes,
      positions,
      sceneVersion,
      store.get().view.zoom,
      surface.screenPadding,
    )
    scene.nodes.containerBoxes = containerBoxes.boxes
  }

  function bounds(
    indices: Iterable<number> | null = null,
    reader: PositionReader = positions,
  ): Bounds | null {
    syncContainers()
    return nodeBounds(scene.nodes, containerBoxes, positions, indices, reader)
  }

  function writeDrafts(): void {
    const indices: number[] = []
    const kinds: number[] = []
    const add = (key: Key, kind: number) => {
      const record = model.shape(key)
      if (!record) return
      indices.push(record.index)
      kinds.push(kind)
    }
    for (const key of drafted) add(key, 1)
    shifted.forEach((shift, slot) => {
      scene.shapes.setShift(slot, shift.x, shift.y)
      for (const key of shift.keys) add(key, slot + 2)
    })
    scene.shapes.setDrafts(indices, kinds)
  }

  function flushChanges(): void {
    const start = clock()
    const changes = model.flush()
    const born = projection.grouping ? folds.foldNew(changes) : null
    if (destroyed) return
    const supported = support.apply(changes)
    const projected = projection.apply(changes)
    const flushed = clock()
    scene.apply(projection.view, projected.scene)
    const applied = clock()
    applyChanges(changes, projected)
    if (destroyed) return
    if (foldNew) folds.adopt()
    if (destroyed) return
    if (drafted.length + shifted.length > 0) writeDrafts()
    for (const watcher of watchers) watcher.changed?.(projected.scene)
    if (destroyed) return
    if (supported) selection.lightSupport()
    probe?.flushed(flushed - start, applied - flushed)
    reads.refreshIssues()
    if (destroyed) return
    data.refresh()
    if (destroyed) return
    if (born) emitter.emit('foldchange', { folded: born })
  }

  function countElements(): GraphCount {
    flushPending()
    return reads.count(sight(), sceneVersion)
  }

  function flushPending(): void {
    if (!scheduler.needsFlush || flushing) return
    scheduler.needsFlush = false
    flushing = true
    try {
      flushChanges()
    } finally {
      flushing = false
    }
  }

  function applyChanges(changes: GraphChanges, projected: ProjectionChanges): void {
    pointer.dropLostDrag(changes.nodes.removed)
    if (destroyed) return
    const moves = placeNodes(model, positions, changes, restore, placement)
    if (restore && (restore.size === 0 || (model.nodeCount > 0 && !data.loading))) restore = null
    for (const index of moves.restored) projection.markSeen(index)
    motion.follow(moves)
    spread.release(projected.unfolded)
    const revealed = folds.reveal(changes, projected, moves.restored)
    spread.changed(changes, projected, performance.now())
    buffers.reserve(scene.nodes.capacity, scene.edges.capacity, scene.shapes.capacity)
    const result = registry.apply(changes)
    registry.refreshEdges(projected.edges)
    bundles.changed(
      projected.scene.edges.added.length > 0 || projected.scene.edges.removed.length > 0,
      projected.scene.nodes.added.length > 0 ||
        projected.scene.nodes.removed.length > 0 ||
        projected.scene.nodes.updated.length > 0,
    )
    bridges.changed()
    sceneVersion++
    layers.arrange()
    decorations.changed()
    if (result.selection) {
      selection.publish()
      if (controlled) selection.askCurrent()
      if (destroyed) return
    }
    const hovered = store.get().hovered
    if (hovered && !result.hovered && concealed(hovered)) {
      registry.set('hovered', {})
      patch({ hovered: null })
      pointer.updateCursor()
    } else if (result.hovered) {
      patch({ hovered: null })
      pointer.updateCursor()
    } else if (hovered) {
      const fresh = picker.target(hovered.kind, hovered.key)
      if (fresh && (fresh.datum !== hovered.datum || fresh.mark !== hovered.mark)) {
        patch({ hovered: fresh })
      }
    }
    const focused = store.get().focused
    if (focused && !result.focused && concealed(focused)) {
      const index = focused.kind === 'node' ? (model.node(focused.key)?.index ?? -1) : -1
      const holder = index >= 0 ? hierarchy.keys[hierarchy.representative(index)] : undefined
      focus.set(holder !== undefined ? picker.target('node', holder) : null)
    } else if (result.focused) {
      patch({ focused: null })
      emitter.emit('focuschange', { target: null })
    } else if (focused) {
      const fresh = picker.target(focused.kind, focused.key)
      if (fresh && (fresh.datum !== focused.datum || fresh.mark !== focused.mark)) {
        patch({ focused: fresh })
      }
    }
    if (destroyed) return
    if (projected.reshaped) layouts.reshaped()
    layouts.follow(changes, revealed)
  }

  function concealed(element: GraphTarget): boolean {
    if (element.kind === 'shape') return false
    if (element.kind === 'node') {
      const index = model.node(element.key)?.index ?? -1
      return index >= 0 && !projection.nodeShown(index)
    }
    return model.edge(element.key) !== undefined && projection.edgeIndexOf(element.key) < 0
  }

  function frame(now: number): void {
    const was = framing
    framing = true
    try {
      drawFrame(now)
    } finally {
      framing = was
    }
  }

  function selectTimes(): void {
    const filter = timeWindow.filter
    scene.nodes.time.select(filter)
    scene.edges.time.select(filter)
    scene.shapes.time.select(filter)
  }

  function drawFrame(now: number): void {
    scheduler.started()
    if (destroyed) return
    const start = clock()
    flushPending()
    if (destroyed) return
    selectTimes()
    views.settle()
    views.step(now)
    if (pointer.autoPanning) pointer.stepAutoPan(now)
    views.send()
    if (destroyed) return
    if (motion.active) motion.step(now)
    const spreading = spread.frame(now)
    if (lens.wanted?.follow === 'focus') lens.update()
    if (destroyed) return
    const easing = bundles.frame(now)
    bridges.frame()
    if (bundles.routes || bridges.enabled) {
      const detail = detailStep(scene.nodes, scene.edges, sight())
      if (detail !== shownDetail) {
        shownDetail = detail
        bundles.shownChanged()
        bridges.changed()
      }
    }
    if (buffers.hideVersion !== hideChecked) {
      hideChecked = buffers.hideVersion
      dropHidden()
    }
    if (destroyed) return
    registry.takeHighlighted()
    syncContainers()
    decorations.prepare()
    const dirty = scene.takeDirty()
    if (dirty.palette || scene.palette.version !== palette.version) palette.resolve(false)
    buffers.reserve(scene.nodes.capacity, scene.edges.capacity, scene.shapes.capacity)
    const renderer = render.renderer
    if (!renderer) {
      if (positions.version !== store.get().positionsVersion) {
        patch({ positionsVersion: positions.version })
        if (destroyed) return
      }
      anchors.place()
      for (const watcher of watchers) watcher.frame()
      if (views.animation || pointer.autoPanning || motion.active || easing || spreading) request()
      return
    }
    const positionsChanged = positions.version !== render.positionsVersion
    const syncStart = clock()
    renderer.sync({
      scene,
      dirty,
      positions,
      positionsChanged,
      states: buffers,
      full: render.full,
      grid: decorations.grid,
      hulls: decorations.hulls,
      containers: projection.active ? containerBoxes : undefined,
      bundles: bundles.paths,
      bridges: bridges.active ? bridges.set : null,
    })
    const synced = clock()
    render.full = false
    if (positionsChanged) {
      render.positionsVersion = positions.version
      patch({ positionsVersion: render.positionsVersion })
      if (destroyed) return
    }
    const { view, width, height } = store.get()
    const renderStart = clock()
    const flowing = flows.moving(view, width, height)
    if (flowing) render.flowTime = flows.time(now)
    const time = render.flowTime
    const shown = lens.shown ? lensFrame(view, { width, height }, lens.shown) : null
    const wait = renderer.render({
      view,
      width,
      height,
      pixelRatio: render.pixelRatio,
      time,
      lens: shown,
      window: timeWindow.filter,
      layers: layers.filter,
      globe: camera.globe,
    })
    const held = !!renderer.holding?.()
    if (!held) render.drawn(now)
    anchors.place()
    const end = clock()
    probe?.framed(start, end - start, synced - syncStart, end - renderStart)
    for (const watcher of watchers) watcher.frame()
    if (views.animation || pointer.autoPanning || motion.active || easing || flowing || spreading) {
      request()
    } else if (wait >= 0) scheduler.later(wait)
    if (!held) waiters.drawn()
  }

  function drawNow(): void {
    scheduler.takeFrame()
    frame(performance.now())
  }

  function idle(): boolean {
    return !(
      scheduler.needsFlush ||
      data.waiting ||
      layouts.busy ||
      views.animation !== null ||
      motion.active ||
      spread.pending ||
      bundles.busy ||
      bridges.busy ||
      scene.shapes.filling ||
      decorations.pending
    )
  }

  function checkSettled(): void {
    settleCheck = undefined
    if (destroyed || settling.length === 0) return
    flushPending()
    if (destroyed) return
    if (!idle()) {
      settleCheck = setTimeout(checkSettled, 0)
      return
    }
    for (const waiter of settling.splice(0)) waiter.resolve()
  }

  function settled(): Promise<void> {
    return new Promise((resolve, reject) => {
      settling.push({ resolve, reject })
      if (settleCheck === undefined) checkSettled()
    })
  }

  function applyDefinition(): void {
    definition = surface.adapt(given)
    model.setMarks(definition.marks)
    projection.setMarks(definition.marks)
    support.setMarks(definition.marks)
    scene.setDefinition(definition)
    decorations.setDefinition(definition)
    bundles.setBundling(definition.bundling, definition.routing)
    bridges.setOptions(definition.bridges)
    timeWindow.refreshFade()
    layers.arrange()
    layers.refresh()
    const reshaped = registry.setShaped(scene.shapes.marked)
    if (registry.define(freeStateNames(definition.states)) || reshaped) {
      patch({ states: selection.freeStates() })
    }
    if (reshaped) patch({ selection: registry.members('selected') })
    selection.lightSupport()
    applyStyles()
    focus.applyKeyboard()
    pointer.updateCursor()
    views.reconstrain()
    data.refresh()
    render.refreshRatio()
  }

  function driverOf(target: HostSurface): HostDriver {
    const known = drivers.get(target)
    if (known) return known
    const driver: HostDriver = {
      frame: (now) => {
        if (surface === target) frame(now)
      },
      follow: (next, ratio, width, height, globe = null) => {
        if (surface !== target || destroyed) return
        render.pixelRatio = ratio
        camera.globe = globe
        scheduler.hush(() => {
          const state = store.get()
          if (state.width !== width || state.height !== height) patch({ width, height })
          const cause = views.followed()
          const far = Math.max(
            Math.abs(next.x - positions.originX),
            Math.abs(next.y - positions.originY),
          )
          if (far * next.zoom > rebaseDistance) {
            positions.rebase(next.x, next.y)
            request()
          }
          if (!sameView(next, state.view)) views.publish(next, cause)
        })
      },
      attach: (create) => render.attach(target, create),
      detach: () => render.detach(target),
      evict: () => {
        if (surface === target && !destroyed) moveTo(home, null)
      },
    }
    drivers.set(target, driver)
    return driver
  }

  function moveTo(next: HostSurface, wanted: View | null): void {
    const previous = surface
    flushPending()
    if (destroyed) return
    const focused = page.focused()
    page.place(next)
    visited.add(next)
    pointer.abandon()
    if (destroyed) return
    motion.finish()
    if (destroyed) return
    layouts.leave()
    if (destroyed) return
    spread.leave()
    memories.set(previous, views.leave())
    camera.globe = null
    scheduler.takeFrame()
    pointer.unlisten()
    page.unplace(previous)
    surface = next
    const stale = positions.swap(previous, next)
    restore = null
    render.listen(next)
    render.enter(next)
    pointer.listen(next.events)
    next.bind(driverOf(next))
    applyDefinition()
    if (destroyed) return
    if (scene.setGroupFillOpacity(next.groupFillOpacity)) scheduler.needsFlush = true
    flushPending()
    if (destroyed) return
    const arriving = next.camera()?.view.zoom ?? store.get().view.zoom
    const arrived = placeOnSurface(
      model,
      positions,
      stale,
      (index) =>
        projection.active && !projection.nodeShown(index) ? hierarchy.representative(index) : -1,
      placing(() => arriving),
    )
    for (const index of arrived) projection.markSeen(index)
    views.dropRequests()
    const cameraView = next.camera()
    const memory = memories.get(next) ?? null
    const kept = next.ownCamera ? (wanted ?? heldView ?? memory?.view ?? null) : null
    if (next.ownCamera) heldView = null
    const shown = cameraView?.view ?? kept
    if (shown && !sameView(shown, store.get().view)) views.publish(shown, 'api')
    if (destroyed) return
    views.enter(memory, kept === null && cameraView === null)
    if (wanted || kept) views.pendingFit = null
    const size = cameraView ?? page.measure()
    render.resize(size.width, size.height, false)
    if (wanted && !next.ownCamera) next.move(views.constrain(wanted))
    spread.enter(performance.now())
    lens.update()
    if (destroyed) return
    layouts.enter(arrived)
    if (destroyed) return
    patch({ surface: next.name })
    if (destroyed) return
    for (const watcher of [...watchers]) watcher.surface?.(next)
    if (destroyed) return
    emitter.emit('surfacechange', { surface: next.name, previous: previous.name })
    if (destroyed) return
    if (focused) page.focus()
    request(true)
  }

  model.setMarks(definition.marks)
  projection.setMarks(definition.marks)
  support.setMarks(definition.marks)
  scene.setDefinition(definition)
  decorations.setDefinition(definition)
  bundles.setBundling(definition.bundling, definition.routing)
  bridges.setOptions(definition.bridges)
  layers.arrange()
  layers.refresh()
  applyStyles()
  render.refreshTheme()
  data.refresh()
  request(true)

  const view: GraphView = {
    get: () => store.get().view,
    set: (next, viewOptions = {}) => {
      checkView(next)
      checkDuration(viewOptions)
      views.animateTo(next, viewOptions.duration, 'api')
    },
    fit: (fitOptions?: FitOptions, ...rest: unknown[]) => {
      const iterable = typeof Object(fitOptions)[Symbol.iterator] === 'function'
      if (rest.length > 0 || iterable) {
        throw new TypeError('graph: view.fit takes options, such as { nodes }')
      }
      checkFit(fitOptions ?? {})
      checkLists(check, fitOptions, 'view.fit({ $ })')
      flushPending()
      views.fit(fitRequest(fitOptions ?? {}))
    },
    zoomBy: (factor, viewOptions = {}) => {
      checkFactor(factor)
      checkDuration(viewOptions)
      const size = views.viewport()
      const center = { x: size.width / 2, y: size.height / 2 }
      const zoomed = zoomAround(views.base(), size, center, factor, definition.view)
      views.animateTo(zoomed, viewOptions.duration, 'api')
    },
    toScreen: (point) => camera.screenAt(point),
    toWorld: (point) => camera.worldAt(point, store.get().view),
  }

  const positionsApi: GraphPositions = {
    get: (key) => {
      flushPending()
      const record = model.node(key)
      return record ? { x: positions.x(record.index), y: positions.y(record.index) } : undefined
    },
    set: (entries, positionOptions = {}) => {
      checkDuration(positionOptions)
      flushPending()
      const indices: number[] = []
      const to: number[] = []
      const moved = new Map<Key, Point>()
      let skipped = 0
      for (const [key, point] of entries) {
        const record = model.node(key)
        if (!record) continue
        if (!finitePoint(point)) {
          skipped++
          continue
        }
        indices.push(record.index)
        to.push(point.x, point.y)
        moved.set(key, { x: point.x, y: point.y })
        projection.markSeen(record.index)
      }
      for (const index of indices) spread.detach(index)
      spread.settle(performance.now())
      const run = layouts.session?.run
      if (run) {
        for (const [i, index] of indices.entries())
          run.pin(index, to[i * 2] ?? 0, to[i * 2 + 1] ?? 0)
      }
      if (dev && skipped > 0) {
        console.warn(`graph: positions.set skipped ${skipped} node(s) without a finite x and y`)
      }
      motion.move(indices, to, positionOptions.duration ?? 0)
      if (moved.size > 0) {
        emitter.emit('positionchange', positionEvent('api', moved, surface))
      }
    },
    reset: (keys, resetOptions = {}) => {
      checkDuration(resetOptions)
      flushPending()
      if (keys !== undefined) check(keys, 'positions.reset')
      const reader = motion.settled()
      const indices: number[] = []
      const to: number[] = []
      const moved = new Map<Key, Point>()
      const visit = (key: Key, index: number) => {
        const x = positions.source[index * 2] ?? Number.NaN
        const y = positions.source[index * 2 + 1] ?? Number.NaN
        if (Number.isNaN(x) || Number.isNaN(y) || spread.owns(index)) return
        const here = Math.fround(reader.x(index) - positions.originX)
        const there = Math.fround(x - positions.originX)
        const aside = Math.fround(reader.y(index) - positions.originY)
        const beyond = Math.fround(y - positions.originY)
        spread.reattach(index)
        if (here === there && aside === beyond) return
        indices.push(index)
        to.push(x, y)
        moved.set(key, { x, y })
        projection.markSeen(index)
      }
      if (keys === undefined) {
        for (const record of model.nodes()) visit(record.key, record.index)
      } else {
        for (const key of keys) {
          const record = model.node(key)
          if (record) visit(record.key, record.index)
        }
      }
      const run = layouts.session?.run
      if (run) {
        for (const [i, index] of indices.entries())
          run.pin(index, to[i * 2] ?? 0, to[i * 2 + 1] ?? 0)
      }
      motion.move(indices, to, resetOptions.duration ?? definition.transitions.positions)
      spread.settle(performance.now())
      if (moved.size > 0) {
        emitter.emit('positionchange', positionEvent('api', moved, surface))
      }
    },
    snapshot: (snapshotOptions = {}) => {
      flushPending()
      const reader = snapshotOptions.settled === false ? positions : motion.settled()
      const result = new Map<Key, Point>()
      for (const record of model.nodes()) {
        result.set(record.key, { x: reader.x(record.index), y: reader.y(record.index) })
      }
      return result
    },
  }

  const paths = createPathQueries({
    model,
    shown: () => {
      const seen = sight()
      if (!filtered(scene.nodes, seen) && !filtered(scene.edges, seen)) return null
      return {
        node: (index) => nodeShown(scene.nodes, index, seen),
        edge: (index) => edgeOwnShown(scene.edges, index, seen),
      }
    },
    prepare: flushPending,
    groups: () =>
      projection.active
        ? {
            representative: (index) => hierarchy.representative(index),
            forEachMember: (index, visit) => {
              if (hierarchy.folded[index] === 1) hierarchy.forEachDescendant(index, visit)
            },
          }
        : null,
  })

  function inspection(): GraphInspection {
    return {
      ...reads.alive(sceneVersion),
      pendingEdges: model.pendingCount,
      shapes: scene.shapes.count,
      issues: reads.issues,
      layout: layouts.session?.name ?? null,
      renderer: render.renderer?.stats?.() ?? null,
      contextLost: render.contextLost,
      software: render.software,
      pixelRatio: render.pixelRatio,
      ratioOption: definition.pixelRatio,
    }
  }

  const instance: GraphCore<S> = {
    store: readonlyStore,
    view,
    selection: selection.selectionApi(),
    states: selection.statesApi(),
    positions: positionsApi,
    layout: layouts.api(),
    groups: folds.api(),
    paths,
    time: timeWindow.api(),
    history: {
      of: (element) => {
        flushPending()
        const kind =
          element.kind === 'node' ? 'nodes' : element.kind === 'edge' ? 'edges' : 'shapes'
        return (model.history(kind, element.key) ?? noEntries) as never
      },
      instant: () => cutOf(timeWindow.window).time,
    },
    layers: layers.api(),
    support: {
      carriers: (key, walk) => {
        flushPending()
        return support.carriers(key, walk)
      },
      carried: (key, walk) => {
        flushPending()
        return support.carried(key, walk)
      },
    },
    bundling: {
      run: () => {
        flushPending()
        return bundles.run('bundle')
      },
    },
    routing: {
      run: () => {
        flushPending()
        return bundles.run('route')
      },
    },
    signal: lifetime.signal,
    get destroyed() {
      return destroyed
    },
    pick: (point) => {
      flushPending()
      return picker.pick(point)
    },
    neighbors: (key) => {
      flushPending()
      return model.neighbors(key)
    },
    edgesOf: (key) => {
      flushPending()
      return model.edgesOf(key)
    },
    endpoints: (key) => {
      flushPending()
      return model.endpoints(key)
    },
    issues: () => {
      flushPending()
      return reads.issues
    },
    count: countElements,
    shown: () => {
      flushPending()
      return reads.shown(sight(), sceneVersion)
    },
    isShown: (element) => {
      flushPending()
      return reads.isShown(element.kind, element.key, sight())
    },
    refresh: (keys) => {
      checkLists(check, keys, 'refresh({ $ })')
      if (keys.nodes) model.refresh('nodes', keys.nodes)
      if (keys.edges) model.refresh('edges', keys.edges)
      if (keys.shapes) model.refresh('shapes', keys.shapes)
    },
    datumOf: (element) => {
      flushPending()
      const record =
        element.kind === 'node'
          ? model.node(element.key)
          : element.kind === 'edge'
            ? model.edge(element.key)
            : model.shape(element.key)
      return record?.datum as never
    },
    on: (name, handler, listen) => {
      const until = listen?.signal
      if (until?.aborted) return () => {}
      const off = emitter.on(name, handler)
      if (!until) return off
      const stop = () => {
        off()
        until.removeEventListener('abort', stop)
      }
      until.addEventListener('abort', stop, { once: true, signal: lifetime.signal })
      return stop
    },
    loaded: () => data.loaded(),
    settled,
    update(next: CoreUpdate) {
      const target = next.surface === undefined ? surface : (hostSurfaceOf(next.surface) ?? home)
      const moving = target !== surface
      if (next.view !== undefined && (moving || viewControlled)) checkView(next.view)
      page.update(next)
      if (next.onSelectionChange !== undefined) selection.listen(next.onSelectionChange)
      if (controlled && next.selection !== undefined) {
        checkLists(check, next.selection, 'update({ selection: { $ } })')
        selection.answer(toKeys(next.selection, registry.shaped))
      }
      if (next.onFoldChange !== undefined) folds.listen(next.onFoldChange)
      if (foldControlled && next.folded !== undefined) {
        check(next.folded, 'update({ folded })')
        folds.answer(next.folded)
      }
      if (next.onViewChange !== undefined) onViewChange = isolated(next.onViewChange)
      if (viewControlled && next.view !== undefined && !moving) {
        if (surface.ownCamera) views.apply(next.view)
        else heldView = next.view
      }
      if (next.onTimeChange !== undefined) timeWindow.listen(next.onTimeChange)
      if (timeControlled && next.time !== undefined) {
        timeWindow.answer(readWindow(next.time))
      }
      if (next.onLayerChange !== undefined) {
        layers.listen(next.onLayerChange as LayerListener)
      }
      if (layersControlled && next.hiddenLayers !== undefined) {
        check(next.hiddenLayers, 'update({ hiddenLayers })')
        layers.answer(next.hiddenLayers)
      }
      if (moving) {
        if (next.definition) given = next.definition as ResolvedDefinition
        moveTo(target, next.view ?? null)
        return
      }
      if (next.definition && next.definition !== given) {
        const previous: Layout | null = definition.layout
        given = next.definition as ResolvedDefinition
        definition = surface.adapt(given)
        layouts.replaced(previous)
        applyDefinition()
        if (destroyed) return
        request(true)
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      endReason ??= destroyedReason()
      unregister()
      probe = null
      clearTimeout(settleCheck)
      for (const waiter of settling.splice(0)) waiter.reject(endReason)
      layouts.destroy(endReason)
      scheduler.cancelFrame()
      pointer.stopMoves()
      scheduler.cancelLater()
      render.unwatch()
      flows.destroy()
      bundles.destroy()
      bridges.destroy()
      page.unlisten()
      emitter.clear()
      model.destroy()
      scene.shapes.destroy()
      render.release()
      colors.destroy()
      anchors.destroy()
      for (const watcher of [...watchers]) watcher.destroy()
      watchers.clear()
      page.remove()
      for (const each of visited) each.release()
      waiters.reject(endReason)
      data.destroy(endReason)
      lifetime.abort(endReason)
    },
  }

  Object.defineProperties(instance, Object.getOwnPropertyDescriptors(api))
  const guarded = untilDestroyed(
    instance as GraphCore,
    page.dead(
      readonlyStore as GraphStore,
      lifetime.signal,
      () => endReason,
      () => scene.shapes.marked,
    ),
    () => destroyed,
  )
  const mountSignal = options.signal
  mountSignal?.addEventListener(
    'abort',
    () => {
      endReason = mountSignal.reason
      guarded.destroy()
    },
    { once: true, signal: lifetime.signal },
  )

  const unregister = registerGraph({
    graph: guarded as GraphCore,
    label: () => page.title() ?? '',
    inspect: inspection,
    probe: (next) => {
      probe = next
    },
  })

  exposeGraph(guarded, {
    ...parts,
    projection,
    containers: containerBoxes,
    decorations,
    bridges,
    render,
    colors,
    time: timeWindow,
    layers,
    watchers,
    createRenderer: page.createRenderer,
    syncContainers,
    tool: (tool) => {
      if (destroyed || (tool && pointer.tool)) return false
      pointer.setTool(tool)
      return true
    },
    draft: (keys, shifts = []) => {
      if (destroyed) return
      flushPending()
      drafted = [...keys]
      shifted = shifts.slice(0, shiftSlots)
      writeDrafts()
      request()
    },
    shape: (key) => {
      if (destroyed) return null
      flushPending()
      return model.shape(key) ?? null
    },
    title: () => page.title(),
    frames,
  })

  surface.bind(driverOf(surface))
  if (startCamera && startView) surface.move(startView)

  render.settled = true
  return guarded as unknown as GraphCore<S, M>
}
