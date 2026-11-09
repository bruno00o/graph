import { createStore } from '@tanstack/store'
import { createGraphModel, type GraphChanges } from '../core/graph-model'
import { createPathQueries } from '../core/path-query'
import { type PositionReader, Positions, placeNodes } from '../core/positions'
import { Projection, type ProjectionChanges } from '../core/projection'
import { createScene } from '../core/scene'
import type { HideFilter } from '../core/state-buffers'
import { StateBuffers } from '../core/state-buffers'
import { freeStateNames } from '../core/state-names'
import { SupportIndex } from '../core/support'
import { readWindow } from '../core/time-range'
import { type Bounds, toWorld, zoomAround } from '../core/view'
import { detailStep, edgeOwnShown, filtered, nodeShown, type Sight } from '../core/visibility'
import { dev } from '../dev'
import { createTextWidths } from '../dom/text-width'
import { ThemeResolver } from '../dom/theme'
import { defaultFont } from '../theme/tokens'
import type { GraphDefinition, Key, Mark, Point } from '../types'
import { createWebglRenderer } from '../webgl/renderer'
import { BridgeHost } from './bridges'
import { BundleHost } from './bundles'
import { HostCamera } from './camera'
import { ContainerBoxes } from './containers'
import { DataReads } from './data-reads'
import { createDecorations } from './decorations'
import { noKeys, toKeys } from './element-keys'
import { Emitter, type GraphTarget } from './events'
import { exposeGraph } from './exposure'
import { createFlowWatch } from './flows'
import { FocusControl } from './focus-control'
import { FoldControl } from './folding'
import { FrameScheduler } from './frame-scheduler'
import { boundsAfter, fitIndices, nodeBounds, withWaypoints } from './framing'
import type {
  FitOptions,
  GraphCount,
  GraphFocus,
  GraphInstance,
  GraphPositions,
  GraphState,
  GraphStore,
  GraphView,
  HostSurface,
  MountGraphOptions,
  RendererFactory,
} from './graph-instance'
import { checkDuration, checkFactor, checkFit, checkView, finitePoint } from './inputs'
import { type GraphInspection, type GraphProbe, registerGraph } from './inspect'
import type { GraphWatcher } from './internals'
import { isolated, isolateSubscribers } from './isolate'
import { KeyboardInput } from './keyboard-input'
import { LayerControl, type LayerListener } from './layer-control'
import { LayoutHost } from './layout-session'
import { lensFrame } from './lens'
import { LensControl } from './lens-control'
import { afterDestroy, destroyedReason, FrameWaiters, stillborn, untilDestroyed } from './lifecycle'
import { HostPicker } from './picking'
import { PointerInput } from './pointer-input'
import { PositionMotion } from './position-motion'
import { readonlyOf } from './readonly-store'
import { reducedMotion } from './reduced-motion'
import { RenderHost } from './render-host'
import { SelectionControl } from './selection-control'
import { SpreadHost } from './spread'
import { StateRegistry } from './state-registry'
import { applyStateStyles } from './state-styles'
import { TimeControl } from './time-control'
import { fitRequest, originOf, sameView, ViewControl } from './view-control'

export type {
  FitOptions,
  GraphBundling,
  GraphBundlingStatus,
  GraphCount,
  GraphElement,
  GraphFocus,
  GraphGroups,
  GraphInstance,
  GraphLayers,
  GraphLayout,
  GraphLayoutStatus,
  GraphPositions,
  GraphRouting,
  GraphRoutingStatus,
  GraphSelection,
  GraphShownCount,
  GraphState,
  GraphStates,
  GraphStore,
  GraphTime,
  GraphUpdateOptions,
  GraphView,
  HostDriver,
  HostSurface,
  LayoutRunOptions,
  MountGraphOptions,
  PositionSnapshotOptions,
  RendererFactory,
  ViewOptions,
} from './graph-instance'

const idleLayout = Object.freeze({ running: false, progress: 0 })
const idleBundling = Object.freeze({ running: false })
const rebaseDistance = 2 ** 20
const mapGroupFillOpacity = 0.5
const visuallyHidden =
  'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap'

export function createGraphHost<S extends string = string, M extends Mark = Mark>(
  container: HTMLElement,
  options: MountGraphOptions<S, M>,
  createRenderer: RendererFactory,
  surface: HostSurface | null = null,
): GraphInstance<S, M> {
  let given: GraphDefinition = options.definition
  let definition: GraphDefinition = surface ? surface.adapt(given) : given
  const controlled = options.selection !== undefined
  const viewControlled = options.view !== undefined
  const foldControlled = options.folded !== undefined
  const timeControlled = options.time !== undefined
  const layersControlled = options.hiddenLayers !== undefined
  let onViewChange = isolated(options.onViewChange)
  const emitter = new Emitter()
  const timeWindow = new TimeControl(
    {
      controlled: timeControlled,
      emitter,
      definition: () => definition,
      patch,
      request: () => request(),
    },
    options.time ?? options.initialTime ?? null,
    options.onTimeChange,
  )
  let hideChecked = 0
  let shownDetail = -1
  const element = document.createElement('div')
  element.setAttribute('data-graph', '')
  element.setAttribute('role', 'img')
  element.setAttribute('aria-label', options.ariaLabel)
  element.style.cssText = surface
    ? 'position:absolute;inset:0;overflow:hidden;outline:none;outline-offset:-2px;pointer-events:none'
    : 'position:relative;width:100%;height:100%;overflow:hidden;outline:none;outline-offset:-2px'
  const canvas = surface?.events ?? document.createElement('canvas')
  const announcer = document.createElement('div')
  announcer.setAttribute('aria-live', 'polite')
  announcer.style.cssText = visuallyHidden
  if (surface) element.append(announcer)
  else {
    canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none'
    element.append(canvas, announcer)
  }
  container.append(element)

  let destroyed = false
  let flushing = false
  let sceneVersion = 0
  let probe: GraphProbe | null = null
  const watchers = new Set<GraphWatcher>()
  const lifetime = new AbortController()
  let endReason: unknown = null
  const scheduler = new FrameScheduler(frame, surface, () => destroyed)
  const waiters = new FrameWaiters(() => scheduler.due || !render.renderer || render.contextLost)

  const model = createGraphModel({ schedule: () => request(true) })
  const textWidths = createTextWidths(defaultFont)
  const scene = createScene(
    textWidths.width,
    surface ? { groupFillOpacity: mapGroupFillOpacity } : {},
  )
  const positions = new Positions()
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
    eligible: (index) =>
      !Number.isNaN(positions.source[index * 2] ?? Number.NaN) || definition.layout === null,
    settled: () => motion.settled(),
    claim: (index) => motion.free(index),
    camera: () => {
      const { view, width, height } = store.get()
      return { zoom: view.zoom, globe: camera.sphere(), width, height }
    },
    duration: () => (reducedMotion() ? 0 : definition.transitions.layout),
  })
  const layers = new LayerControl(
    {
      controlled: layersControlled,
      scene,
      emitter,
      patch,
      reorder: () => registry.reorder(),
      dropHidden,
      request: () => request(),
    },
    options.hiddenLayers ?? options.initialHiddenLayers ?? [],
    options.onLayerChange as LayerListener,
  )
  const registry = new StateRegistry(
    model,
    buffers,
    {
      indexOf: (key) => projection.edgeIndexOf(key),
      keysAt: (index) => projection.keysAt(index),
    },
    (kind, index) => layers.position(kind, index),
  )
  const themeResolver = new ThemeResolver(element)
  const render = new RenderHost({
    canvas,
    surface,
    createRenderer,
    scene,
    themeResolver,
    textWidths,
    paths: () => bundles.paths,
    state: () => store.get(),
    patch,
    remeasured: () => {
      sceneVersion++
    },
    reconstrain: () => views.reconstrain(),
    drawNow,
    request: () => request(),
    destroyed: () => destroyed,
  })

  registry.define(freeStateNames(definition.states))
  if (options.selection !== undefined) registry.set('selected', options.selection)
  projection.setFolded(options.folded ?? options.initialFolded ?? [])
  const selection = new SelectionControl(
    {
      controlled,
      registry,
      support,
      emitter,
      state: () => store.get(),
      patch,
      definition: () => definition,
      request: () => request(),
    },
    options.onSelectionChange,
  )
  const store = createStore<GraphState>({
    view: options.view ?? options.initialView ?? { x: 0, y: 0, zoom: 1 },
    width: 0,
    height: 0,
    hovered: null,
    focused: null,
    selection: controlled ? registry.members('selected') : noKeys,
    states: selection.freeStates(),
    positionsVersion: 0,
    layout: idleLayout,
    folded: [...projection.folded],
    bundling: idleBundling,
    routing: idleBundling,
    time: timeWindow.window,
    lens: null,
    hiddenLayers: layers.hidden,
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
    },
    reducedMotion,
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
  })
  render.adoptLimits()
  const decorations = createDecorations({
    element,
    canvas,
    model,
    scene,
    positions,
    registry,
    state: () => store.get(),
    sight: () => sight(),
    request: () => request(),
    containers: () => (projection.active ? containerBoxes : null),
    edgeIndex: (key) => projection.edgeIndexOf(key),
    paths: bundles.paths,
  })

  const views = new ViewControl({
    controlled: viewControlled,
    given: options.initialView !== undefined || viewControlled,
    emitter,
    state: () => store.get(),
    patch,
    definition: () => definition,
    request: () => request(),
    frameCost: () => render.cost.value,
    deliver: (sent) =>
      scheduler.hush(() =>
        surface
          ? surface.move(sent.view)
          : onViewChange?.({ view: sent.view, origin: originOf(sent.cause) }),
      ),
    published: () => pointer.redrawLasso(),
    measure: (keys) =>
      withWaypoints(
        bounds(fitIndices(keys, model, projection, scene.edges), motion.settled()),
        keys,
        projection,
        scene.edges,
        bundles.paths,
        motion.settled(),
      ),
    limitBounds: () => bounds(),
    sceneVersion: () => sceneVersion,
    positionsVersion: () => positions.version,
  })
  const camera = new HostCamera({
    positions,
    state: () => store.get(),
    viewport: () => views.viewport(),
    lens: () => lens.shown,
  })
  const motion = new PositionMotion({
    positions,
    spread,
    definition: () => definition,
    dragging: () => pointer.dragging(),
    request: () => request(),
    frameCost: () => render.cost.value,
  })
  const layouts = new LayoutHost({
    onMap: surface !== null,
    scene,
    model,
    positions,
    projection,
    spread,
    motion,
    views,
    bundles,
    emitter,
    state: () => store.get(),
    patch,
    definition: () => definition,
    dragging: () => pointer.dragging(),
    boundsAfter: (indices, to, keys) =>
      boundsAfter(
        scene.nodes,
        hierarchy,
        () => motion.settled(),
        indices,
        to,
        fitIndices(keys, model, projection, scene.edges),
      ),
    prepare: flushPending,
    request: () => request(),
    destroyed: () => destroyed,
  })
  const folds = new FoldControl(
    {
      controlled: foldControlled,
      model,
      scene,
      positions,
      projection,
      motion,
      emitter,
      state: () => store.get(),
      patch,
      definition: () => definition,
      makeRoom: (moving, to) => layouts.makeRoom(moving, to),
      request: (flush) => request(flush),
      prepare: flushPending,
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
  const focus = new FocusControl({
    element,
    announcer,
    model,
    scene,
    positions,
    registry,
    views,
    camera,
    emitter,
    state: () => store.get(),
    patch,
    definition: () => definition,
    sight: () => sight(),
    target: (kind, key) => picker.target(kind, key),
    prepare: flushPending,
    request: () => request(),
    destroyed: () => destroyed,
  })
  const lens = new LensControl({
    element,
    onMap: surface !== null,
    emitter,
    definition: () => definition,
    viewport: () => views.viewport(),
    patch,
    request: () => request(),
    destroyed: () => destroyed,
    focusAt: () => focus.lensPoint(),
  })
  const pointer = new PointerInput({
    canvas,
    element,
    surface,
    model,
    scene,
    hierarchy,
    positions,
    registry,
    spread,
    motion,
    views,
    camera,
    lens,
    focus,
    selection,
    folds,
    picker,
    layouts,
    emitter,
    state: () => store.get(),
    patch,
    definition: () => definition,
    sight: () => sight(),
    request: () => request(),
    destroyed: () => destroyed,
  })
  const keyboard = new KeyboardInput({
    element,
    views,
    focus,
    selection,
    folds,
    state: () => store.get(),
    definition: () => definition,
    cancelLasso: () => pointer.cancelLasso(),
    prepare: flushPending,
  })
  const reads = new DataReads({ model, hierarchy, support, scene, buffers, emitter })

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
    if (((hide.nodes | hide.edges | hide.otherNodes | hide.otherEdges) & flag) === 0) return hide
    const nodes = (hide.nodes & ~flag) >>> 0
    const edges = (hide.edges & ~flag) >>> 0
    const otherNodes = (hide.otherNodes & ~flag) >>> 0
    const otherEdges = (hide.otherEdges & ~flag) >>> 0
    return (nodes | edges | otherNodes | otherEdges) === 0
      ? null
      : { ...hide, nodes, edges, otherNodes, otherEdges }
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
      surface !== null,
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

  function flushChanges(): void {
    const start = clock()
    const changes = model.flush()
    if (projection.grouping) folds.foldNew(changes)
    if (destroyed) return
    const supported = support.apply(changes)
    const projected = projection.apply(changes)
    const flushed = clock()
    scene.apply(projection.view, projected.scene)
    const applied = clock()
    applyChanges(changes, projected)
    if (destroyed) return
    for (const watcher of watchers) watcher.changed?.(projected.scene)
    if (destroyed) return
    if (supported) selection.lightSupport()
    probe?.flushed(flushed - start, applied - flushed)
    reads.refreshIssues()
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
    motion.follow(placeNodes(model, positions, changes))
    spread.release(projected.unfolded)
    const fresh = folds.reveal(changes, projected)
    spread.changed(changes, projected, performance.now())
    buffers.reserve(scene.nodes.capacity, scene.edges.capacity)
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
    layouts.follow(changes, fresh)
  }

  function concealed(element: GraphTarget): boolean {
    if (element.kind === 'node') {
      const index = model.node(element.key)?.index ?? -1
      return index >= 0 && !projection.nodeShown(index)
    }
    return model.edge(element.key) !== undefined && projection.edgeIndexOf(element.key) < 0
  }

  function frame(now: number): void {
    scheduler.started()
    if (destroyed || render.contextLost) return
    const start = clock()
    flushPending()
    if (destroyed) return
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
    if (dirty.palette || scene.palette.version !== render.paletteVersion) {
      render.resolvePalette(false)
    }
    buffers.reserve(scene.nodes.capacity, scene.edges.capacity)
    const renderer = render.renderer
    if (!renderer) {
      decorations.place()
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
    render.cost.drawn(now)
    decorations.place()
    const end = clock()
    probe?.framed(start, end - start, synced - syncStart, end - renderStart)
    for (const watcher of watchers) watcher.frame()
    if (views.animation || pointer.autoPanning || motion.active || easing || flowing || spreading) {
      request()
    } else if (wait >= 0) scheduler.later(wait)
    waiters.drawn()
  }

  function drawNow(): void {
    scheduler.takeFrame()
    frame(performance.now())
  }

  render.watch(element)
  const flows = createFlowWatch({
    scene,
    buffers,
    positions,
    element,
    version: () => sceneVersion,
    wake: () => request(),
    paths: bundles.paths,
  })

  const listeners: ReadonlyArray<
    readonly [string, (event: never) => void, AddEventListenerOptions?]
  > = [
    ['pointerdown', pointer.onPointerDown],
    ['pointermove', pointer.onPointerMove],
    ['pointerup', pointer.onPointerUp],
    ['pointercancel', pointer.onPointerCancel],
    ['pointerleave', pointer.onPointerLeave],
    ['dblclick', pointer.onDoubleClick],
    ['contextmenu', pointer.onContextMenu],
    ['wheel', pointer.onWheel, { passive: false }],
    ...(surface
      ? []
      : ([
          ['webglcontextlost', render.onContextLost],
          ['webglcontextrestored', render.onContextRestored],
        ] as const)),
  ]
  for (const [name, listener, listenerOptions] of listeners) {
    canvas.addEventListener(name, listener as EventListener, listenerOptions)
  }
  const elementListeners: ReadonlyArray<readonly [string, (event: never) => void]> = [
    ['keydown', keyboard.onKeyDown],
    ['focus', focus.onFocus],
    ['blur', focus.onBlur],
  ]
  for (const [name, listener] of elementListeners) {
    element.addEventListener(name, listener as EventListener)
  }
  const windowListeners: ReadonlyArray<readonly [string, (event: never) => void]> = [
    ['keydown', lens.onKeyDown],
    ['keyup', lens.onKeyUp],
    ['blur', lens.onBlur],
  ]
  for (const [name, listener] of windowListeners) {
    window.addEventListener(name, listener as EventListener)
  }
  pointer.watchPinch()
  focus.applyKeyboard()

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

  const focusApi: GraphFocus = {
    get: () => store.get().focused,
    set: (next) => {
      flushPending()
      const resolved = next ? picker.target(next.kind, next.key) : null
      if (next && (!resolved || concealed(resolved))) return
      focus.remembered = null
      focus.set(resolved, 'api')
      if (destroyed) return
      if (resolved && definition.interaction.keyboard) element.focus({ preventScroll: true })
    },
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
      if (moved.size > 0) emitter.emit('positionchange', { origin: 'api', positions: moved })
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
      issues: reads.issues,
      layout: layouts.session?.layout.name ?? null,
      renderer: render.renderer?.stats?.() ?? null,
    }
  }

  const instance: GraphInstance<S> = {
    store: readonlyStore,
    view,
    selection: selection.selectionApi(),
    focus: focusApi,
    states: selection.statesApi(),
    positions: positionsApi,
    layout: layouts.api(),
    anchors: decorations.anchors,
    groups: folds.api(),
    paths,
    time: timeWindow.api(),
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
    element,
    signal: lifetime.signal,
    get destroyed() {
      return destroyed
    },
    lens: {
      get: () => lens.shown,
      set: (input) => lens.set(input),
      toWorld: (point) => toWorld(camera.viewAt(point), views.viewport(), point),
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
    datumOf: (element) => {
      flushPending()
      const record = element.kind === 'node' ? model.node(element.key) : model.edge(element.key)
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
    drawn: () => waiters.wait(),
    update(next) {
      if (viewControlled && next.view !== undefined && !surface) checkView(next.view)
      if (next.ariaLabel !== undefined) element.setAttribute('aria-label', next.ariaLabel)
      if (next.onSelectionChange !== undefined) selection.listen(next.onSelectionChange)
      if (controlled && next.selection !== undefined) selection.answer(toKeys(next.selection))
      if (next.onFoldChange !== undefined) folds.listen(next.onFoldChange)
      if (foldControlled && next.folded !== undefined) folds.answer(next.folded)
      if (next.onViewChange !== undefined && !surface) onViewChange = isolated(next.onViewChange)
      if (viewControlled && next.view !== undefined && !surface) views.apply(next.view)
      if (next.onTimeChange !== undefined) timeWindow.listen(next.onTimeChange)
      if (timeControlled && next.time !== undefined) {
        timeWindow.apply(readWindow(next.time))
      }
      if (next.onLayerChange !== undefined) {
        layers.listen(next.onLayerChange as LayerListener)
      }
      if (layersControlled && next.hiddenLayers !== undefined) {
        layers.answer(next.hiddenLayers)
      }
      if (next.definition && next.definition !== given) {
        const previous = definition.layout
        given = next.definition
        definition = surface ? surface.adapt(given) : given
        layouts.replaced(previous)
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
        if (registry.define(freeStateNames(definition.states))) {
          patch({ states: selection.freeStates() })
        }
        selection.lightSupport()
        applyStyles()
        focus.applyKeyboard()
        pointer.updateCursor()
        views.reconstrain()
        request(true)
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      endReason ??= destroyedReason()
      unregister()
      probe = null
      layouts.destroy()
      scheduler.cancelFrame()
      pointer.stopMoves()
      scheduler.cancelLater()
      render.unwatch()
      flows.destroy()
      bundles.destroy()
      bridges.destroy()
      pointer.stopPinch()
      for (const [name, listener] of listeners) {
        canvas.removeEventListener(name, listener as EventListener)
      }
      for (const [name, listener] of elementListeners) {
        element.removeEventListener(name, listener as EventListener)
      }
      for (const [name, listener] of windowListeners) {
        window.removeEventListener(name, listener as EventListener)
      }
      emitter.clear()
      model.destroy()
      render.release()
      themeResolver.destroy()
      decorations.destroy()
      for (const watcher of [...watchers]) watcher.destroy()
      watchers.clear()
      element.remove()
      surface?.release()
      waiters.reject(endReason)
      lifetime.abort(endReason)
    },
  }

  const guarded = untilDestroyed(
    instance,
    afterDestroy<S, Mark>(readonlyStore, element, lifetime.signal, () => endReason),
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
    graph: guarded as GraphInstance,
    inspect: inspection,
    probe: (next) => {
      probe = next
    },
  })

  exposeGraph(guarded, {
    element,
    scene,
    positions,
    buffers,
    registry,
    projection,
    containers: containerBoxes,
    decorations,
    bundles,
    bridges,
    render,
    themeResolver,
    time: timeWindow,
    layers,
    camera,
    watchers,
    createRenderer,
    definition: () => definition,
    state: () => store.get(),
    sight,
    sceneVersion: () => sceneVersion,
    syncContainers,
    prepare: flushPending,
    request: () => request(),
    destroyed: () => destroyed,
  })

  surface?.bind({
    frame,
    follow: (next, ratio, width, height, globe = null) => {
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
    attach: (create) => render.attach(create),
    detach: () => render.detach(),
  })

  render.settled = true
  return guarded as unknown as GraphInstance<S, M>
}

/**
 * Mounts a graph into `container` and returns its instance. The graph fills the container: give the
 * container a size.
 */
export function mountGraph<S extends string = string, M extends Mark = Mark>(
  container: HTMLElement,
  options: MountGraphOptions<S, M>,
): GraphInstance<S, M> {
  if (options.signal?.aborted) return stillborn(options, options.signal)
  return createGraphHost(container, options, createWebglRenderer)
}
