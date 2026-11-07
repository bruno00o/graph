import { createStore, type ReadonlyStore } from '@tanstack/store'
import { containerShape } from '../core/columns'
import { defaultPointBudget } from '../core/edge-paths'
import { flowSpeed } from '../core/flow'
import { sideOf } from '../core/geo-arc'
import { type GlobeCamera, globeScale, globeScreen, globeWorld } from '../core/globe'
import {
  createGraphModel,
  type Endpoints,
  type GraphChanges,
  type GraphIssue,
} from '../core/graph-model'
import { groupingOf } from '../core/group-index'
import { nodesInside } from '../core/lasso'
import type { LayerFilter } from '../core/mark-layers'
import { createPathQueries } from '../core/path-query'
import { PickIndex, type PickSource } from '../core/pick-index'
import {
  goldenAngle,
  type PositionMoves,
  Positions,
  placementSpacing,
  placeNodes,
} from '../core/positions'
import { Projection, type ProjectionChanges } from '../core/projection'
import { createScene } from '../core/scene'
import { shallowEqual } from '../core/shallow-equal'
import { nearestNode, nodeToward } from '../core/spatial'
import {
  type HideFilter,
  type ResolvedStateStyle,
  StateBuffers,
  type StateKind,
} from '../core/state-buffers'
import { freeStateNames, isBuiltInState } from '../core/state-names'
import { SupportIndex } from '../core/support'
import { readWindow, sameWindow, type TimeFilter, timeFilter } from '../core/time-range'
import {
  type Bounds,
  constrainView,
  easeInOut,
  edgePush,
  fitBounds,
  interpolateView,
  type PanLimits,
  panBy,
  toScreen,
  toWorld,
  wheelFactor,
  wheelPixels,
  zoomAround,
} from '../core/view'
import { detailStep, edgeOwnShown, filtered, nodeShown, type Sight } from '../core/visibility'
import { dev } from '../dev'
import { observeTheme, ThemeResolver } from '../dom/theme'
import { builtInStyles, defaults } from '../theme/tokens'
import type {
  BuiltInState,
  FreeState,
  GraphDefinition,
  GraphPaths,
  GraphSupport,
  Key,
  LayerName,
  Layout,
  LayoutRun,
  Mark,
  NodeDatum,
  Point,
  StateStyle,
  SupportWalk,
  TimeWindow,
  TimeWindowInput,
  View,
} from '../types'
import { createWebglRenderer } from '../webgl/renderer'
import type { GraphAnchors } from './anchors'
import { BridgeHost } from './bridges'
import { BundleHost } from './bundles'
import { ContainerBoxes } from './containers'
import { createDecorations } from './decorations'
import {
  type ElementKeys,
  type ElementKeysInput,
  Emitter,
  type GraphEventHandler,
  type GraphEventName,
  type GraphFoldEvent,
  type GraphLayerEvent,
  type GraphTarget,
  type GraphTimeEvent,
  type GraphViewEvent,
  type ZoomKey,
} from './events'
import { exposeSnapshot } from './export-source'
import { createFlowWatch } from './flows'
import { type GraphInspection, type GraphProbe, registerGraph } from './inspect'
import { exposeInternals, type GraphWatcher } from './internals'
import { keyAction } from './keyboard'
import { layoutGraph } from './layout-graph'
import {
  clampLensZoom,
  editableTarget,
  type GraphLens,
  type GraphLensState,
  type LensInput,
  lensContains,
  lensFrame,
  lensView,
  sameLens,
} from './lens'
import type { Renderer } from './renderer'
import { clearRoom } from './room'
import { StateRegistry } from './state-registry'

/** What the store of a graph holds. `S` is the union of the state names, `M` that of the marks. */
export interface GraphState<S extends string = string, M extends Mark = Mark> {
  /** Current view. */
  readonly view: View
  /** Width of the graph element, in CSS pixels. */
  readonly width: number
  /** Height of the graph element, in CSS pixels. */
  readonly height: number
  /** Element under the pointer, or `null`. */
  readonly hovered: GraphTarget<M> | null
  /** Element with the keyboard focus, or `null`. */
  readonly focused: GraphTarget<M> | null
  /** Selected nodes and edges. */
  readonly selection: ElementKeys
  /** Members of each free state, by name. */
  readonly states: { readonly [K in FreeState<S>]: ElementKeys }
  /** Changes whenever a node position changes. Read the positions with `positions.get`. */
  readonly positionsVersion: number
  /** Status of the current layout run. */
  readonly layout: GraphLayoutStatus
  /** Keys of the folded groups. */
  readonly folded: readonly Key[]
  /** Status of edge bundling. */
  readonly bundling: GraphBundlingStatus
  /** Status of edge routing. */
  readonly routing: GraphRoutingStatus
  /** Time window, or `null` when every element shows whatever its `time`. */
  readonly time: TimeWindow | null
  /** The magnifying lens, or `null` when hidden. */
  readonly lens: GraphLensState | null
  /** Names of the hidden layers. */
  readonly hiddenLayers: readonly LayerName<M>[]
}

/** Status of edge bundling. */
export interface GraphBundlingStatus {
  /** `true` while bundles are computed. */
  readonly running: boolean
}

/** Status of edge routing. */
export interface GraphRoutingStatus {
  /** `true` while routes are computed. */
  readonly running: boolean
}

/** Status of the current layout run. */
export interface GraphLayoutStatus {
  /** `true` while a run is in progress. */
  readonly running: boolean
  /** Progress of the run, from 0 to 1. */
  readonly progress: number
}

/** Read-only TanStack Store of the graph state. Write through the methods of the instance. */
export type GraphStore<S extends string = string, M extends Mark = Mark> = ReadonlyStore<
  GraphState<S, M>
>

/** Options of an animated view change. */
export interface ViewOptions {
  /**
   * Animation duration in milliseconds, zero with `prefers-reduced-motion`.
   * @default 0
   */
  readonly duration?: number
}

/** Options of `view.fit`. */
export interface FitOptions extends ViewOptions {
  /**
   * Margin around the framed nodes, in screen pixels.
   * @default 32
   */
  readonly padding?: number
}

/**
 * The camera of a graph. The last animated call wins, and every call stays within the `view`
 * limits of the definition. In controlled mode, changes go to `onViewChange` instead.
 */
export interface GraphView {
  /** Current view. */
  get(): View
  /** Moves the view, at once or over `duration`. */
  set(view: View, options?: ViewOptions): void
  /**
   * Frames the given nodes, or every node without keys. Called before the element has a size, it
   * waits for one.
   */
  fit(keys?: Iterable<Key>, options?: FitOptions): void
  /** Multiplies the zoom around the center of the view, up to the zoom limits. */
  zoomBy(factor: number, options?: ViewOptions): void
  /**
   * Converts a point in world units to screen pixels, relative to the graph element. On a map drawn
   * as a globe, the point follows the globe, also on its far side.
   */
  toScreen(point: Point): Point
  /**
   * Converts a point in screen pixels, relative to the graph element, to world units. On a map
   * drawn as a globe, a point beside the globe converts as on the flat map.
   */
  toWorld(point: Point): Point
}

/** A node or an edge, by key. */
export interface GraphElement {
  /** Kind of element. */
  readonly kind: 'node' | 'edge'
  /** Key of the element. */
  readonly key: Key
}

/** The selection of a graph. In controlled mode, changes go to `onSelectionChange` instead. */
export interface GraphSelection {
  /** Selected nodes and edges. */
  get(): ElementKeys
  /** Replaces the selection. */
  set(keys: ElementKeysInput): void
  /** Empties the selection. */
  clear(): void
}

/** The keyboard focus of a graph. `M` is the union of the marks. */
export interface GraphFocus<M extends Mark = Mark> {
  /** Element with the keyboard focus, or `null`. */
  get(): GraphTarget<M> | null
  /**
   * Moves the focus to an element, or removes it with `null`. When the keyboard is on, the graph
   * element takes the DOM focus; an unknown key changes nothing.
   */
  set(element: GraphElement | null): void
}

/**
 * Members of the free states, by key. Built-in and undeclared names are refused. A key can join a
 * state before its element exists.
 */
export interface GraphStates<N extends string = string> {
  /** Replaces the members of a state. */
  set(name: N, keys: ElementKeysInput): void
  /** Adds members to a state. */
  add(name: N, keys: ElementKeysInput): void
  /** Removes members from a state. */
  remove(name: N, keys: ElementKeysInput): void
  /** Empties a state, or every free state without a name. */
  clear(name?: N): void
  /** Whether an element is a member of a state. */
  has(name: N, element: GraphElement): boolean
}

/**
 * Folding of the groups declared by the `parent` channel of `nodes()`. A folded key with no node yet
 * applies when the group arrives. When `folded` is controlled, changes go to `onFoldChange`.
 */
export interface GraphGroups {
  /** Keys of the folded groups. */
  folded(): readonly Key[]
  /** Whether the group is folded. */
  isFolded(key: Key): boolean
  /** Folds the given groups, or every group, nested ones included, without argument. */
  fold(keys?: Iterable<Key>): void
  /** Unfolds the given groups, or every group without argument. */
  unfold(keys?: Iterable<Key>): void
  /** Folds the group if it is unfolded, unfolds it otherwise. */
  toggle(key: Key): void
  /** Replaces the folded groups. */
  set(keys: Iterable<Key>): void
  /** Key of the group that contains the node, if any. */
  parent(key: Key): Key | undefined
  /** Keys of the nodes the group contains directly. */
  children(key: Key): Key[]
}

/**
 * Visibility of the layers named by the `layer` option of `nodes()` and `edges()`. A hidden layer
 * hides its nodes, its edges and the edges of its nodes from drawing, picking, labels, the legend,
 * the minimap, hulls, exports and path queries on the visible graph. A hidden name with no layer
 * yet applies when a mark names it. When `hiddenLayers` is controlled, changes go to
 * `onLayerChange`. `L` is the union of the layer names.
 */
export interface GraphLayers<L extends string = string> {
  /** Names of the layers, in the order of the first mark of each. */
  names(): readonly L[]
  /** Names of the hidden layers. */
  hidden(): readonly L[]
  /** Whether the layer is hidden. */
  isHidden(name: L): boolean
  /** Hides the given layers, or every layer without argument. */
  hide(names?: Iterable<L>): void
  /** Shows the given layers, or every layer without argument. */
  show(names?: Iterable<L>): void
  /** Hides the layer if it shows, shows it otherwise. */
  toggle(name: L): void
  /** Replaces the hidden layers. */
  set(hidden: Iterable<L>): void
}

/** Options of `layout.run`. */
export interface LayoutRunOptions {
  /** Nodes to lay out. The others stay still and act as anchors. */
  readonly keys?: Iterable<Key>
  /**
   * Frames every node on the result, with `true` or fit options. A result reported at once is
   * framed where nodes land, while they glide.
   */
  readonly fit?: boolean | FitOptions
  /**
   * Glide to a result reported at once, in milliseconds, `transitions.layout` by default. `0`
   * places nodes at once.
   */
  readonly duration?: number
}

/** Layout runs of a graph. `M` is the union of the marks, whose node items layouts read. */
export interface GraphLayout<M extends Mark = Mark> {
  /**
   * Applies pending data changes, then lays out every free node, or only `keys`, with `layout` or
   * the layout of the definition. Resolves to `true` when the run ends and `false` when it is
   * stopped or replaced, and rejects when there is no layout to run or the graph is on a map.
   */
  run(layout?: Layout<NodeDatum<M>>, options?: LayoutRunOptions): Promise<boolean>
  /** Ends the current run and leaves nodes where they are. */
  stop(): void
}

/**
 * Edge bundling, set by the `bundling` of the definition. Bundles are computed once nodes stand
 * still: after a layout run, a drag or a change of edges.
 */
export interface GraphBundling {
  /**
   * Applies pending data changes, then bundles the edges now, from the current positions. Resolves
   * to `true` once the new bundles are drawn and `false` when the run is replaced or there is no
   * bundling to run.
   */
  run(): Promise<boolean>
}

/**
 * Edge routing, set by the `routing` of the definition. Routes are computed once nodes stand
 * still: after a layout run, a drag or a change of nodes or edges. Until then, routes follow their
 * moving ends.
 */
export interface GraphRouting {
  /**
   * Applies pending data changes, then routes the edges now, from the current positions. Resolves
   * to `true` once the new routes are drawn and `false` when the run is replaced or there is no
   * routing to run.
   */
  run(): Promise<boolean>
}

/**
 * The time window of a graph. Nodes and edges with a `time` show only while they exist in the
 * window; without a window, every element shows. In controlled mode, changes go to `onTimeChange`.
 */
export interface GraphTime {
  /** Current window, or `null` when every element shows. */
  get(): TimeWindow | null
  /**
   * Replaces the window, or removes it with `null`. Throws a `RangeError` for an end that is not a
   * finite time, or a start after the end.
   */
  set(window: TimeWindowInput | null): void
}

/** Node positions, in world units. */
export interface GraphPositions {
  /** Position of a node, or `undefined` for an unknown key. */
  get(key: Key): Point | undefined
  /**
   * Moves nodes, at once or over `duration`, and emits `positionchange` with the origin `'api'`.
   * During a layout run, the moved nodes stay pinned until it ends.
   */
  set(entries: Iterable<readonly [Key, Point]>, options?: ViewOptions): void
}

/** Options of `mountGraph`. `S` and `M` come from the definition. */
export interface MountGraphOptions<S extends string = string, M extends Mark = Mark> {
  /** What to draw: the result of `defineGraph`. */
  readonly definition: GraphDefinition<S, M>
  /** Accessible name of the graph element. */
  readonly ariaLabel: string
  /**
   * View at mount, within the `view` limits of the definition. Without it and without `view`, the
   * first data is fitted with a 32 pixel margin.
   */
  readonly initialView?: View
  /**
   * Current view, applied as given. Passing it makes the view controlled for the life of the graph:
   * gestures, keys, `view` calls and animation steps go to `onViewChange`, and only
   * `update({ view })` moves the view.
   */
  readonly view?: View
  /**
   * Receives the view requests in controlled mode, within the `view` limits of the definition, at
   * most once per frame and before drawing: call `update({ view })` in it to draw the request in
   * the same frame.
   */
  readonly onViewChange?: (event: GraphViewEvent) => void
  /** Initial selection. Passing it makes the selection controlled for the life of the graph. */
  readonly selection?: ElementKeysInput
  /** Receives every selection request in controlled mode, instead of the selection changing. */
  readonly onSelectionChange?: (selection: ElementKeys) => void
  /** Groups folded at mount, by key. Later changes go through `groups`. */
  readonly initialFolded?: Iterable<Key>
  /**
   * Folded groups. Passing it makes folding controlled for the life of the graph: requests go to
   * `onFoldChange` and only `update({ folded })` applies them.
   */
  readonly folded?: Iterable<Key>
  /** Receives every fold request in controlled mode, instead of the folded groups changing. */
  readonly onFoldChange?: (event: GraphFoldEvent) => void
  /** Time window at mount, or `null` for none. Later changes go through `time`. */
  readonly initialTime?: TimeWindowInput | null
  /**
   * Time window, or `null` for none. Passing it makes the window controlled for the life of the
   * graph: `time.set` calls go to `onTimeChange`, and only `update({ time })` moves the window.
   */
  readonly time?: TimeWindowInput | null
  /** Receives every window request in controlled mode, instead of the window changing. */
  readonly onTimeChange?: (event: GraphTimeEvent) => void
  /** Layers hidden at mount, by name. Later changes go through `layers`. */
  readonly initialHiddenLayers?: Iterable<LayerName<M>>
  /**
   * Hidden layers. Passing it makes their visibility controlled for the life of the graph:
   * requests go to `onLayerChange` and only `update({ hiddenLayers })` applies them.
   */
  readonly hiddenLayers?: Iterable<LayerName<M>>
  /** Receives every layer request in controlled mode, instead of the hidden layers changing. */
  readonly onLayerChange?: (event: GraphLayerEvent<M>) => void
}

/**
 * A mounted graph, returned by `mountGraph` and by the ref of `<Graph>`. `S` is the union of the
 * state names and `M` that of the marks, both taken from the definition.
 */
export interface GraphInstance<S extends string = string, M extends Mark = Mark> {
  /** Read-only TanStack Store of the graph state. */
  readonly store: GraphStore<S, M>
  /** The camera. */
  readonly view: GraphView
  /** The selection. */
  readonly selection: GraphSelection
  /** The keyboard focus. */
  readonly focus: GraphFocus<M>
  /** Members of the free states. */
  readonly states: GraphStates<FreeState<S>>
  /** Node positions. */
  readonly positions: GraphPositions
  /** Layout runs. */
  readonly layout: GraphLayout<M>
  /** HTML elements pinned to nodes, edges or points. */
  readonly anchors: GraphAnchors<FreeState<S> | BuiltInState>
  /** Folding of nested groups. */
  readonly groups: GraphGroups
  /** Shortest paths and reachable nodes, on the data or on the graph as drawn. */
  readonly paths: GraphPaths<M>
  /** Visibility of the layers. */
  readonly layers: GraphLayers<LayerName<M>>
  /** Edges that carry an edge, and edges an edge carries, from `supportedBy`. */
  readonly support: GraphSupport
  /** Edge bundling. */
  readonly bundling: GraphBundling
  /** Edge routing. */
  readonly routing: GraphRouting
  /** The time window that filters elements with a `time`. */
  readonly time: GraphTime
  /** The magnifying lens. */
  readonly lens: GraphLens
  /** The `div` added to the container, which holds the canvas. */
  readonly element: HTMLElement
  /**
   * Element under a point in screen pixels, nodes before edges, or `null`. Inside the lens, the
   * element it shows there.
   */
  pick(point: Point): GraphTarget<M> | null
  /** Keys of the nodes connected to a node. */
  neighbors(key: Key): Key[]
  /** Keys of the edges of a node. */
  edgesOf(key: Key): Key[]
  /** Source and target keys of an edge, or `undefined` for an unknown or waiting edge. */
  endpoints(key: Key): Endpoints | undefined
  /** Subscribes to an event. Returns the function that unsubscribes. */
  on<K extends GraphEventName>(name: K, handler: GraphEventHandler<K, M>): () => void
  /**
   * Applies a new `definition`, `ariaLabel`, `onSelectionChange`, `onFoldChange`, `onViewChange`,
   * `onTimeChange`, `onLayerChange`, controlled `selection`, controlled `folded`, controlled
   * `view`, controlled `time` or controlled `hiddenLayers`. Positions, view and selection stay.
   */
  update(
    options: Partial<
      Omit<
        MountGraphOptions<S, M>,
        'initialView' | 'initialFolded' | 'initialTime' | 'initialHiddenLayers'
      >
    >,
  ): void
  /** Removes the element and frees every resource. A layout run in progress resolves to `false`. */
  destroy(): void
}

export type RendererFactory = (canvas: HTMLCanvasElement, invalidate: () => void) => Renderer

export interface HostDriver {
  frame(now: number): void
  follow(
    view: View,
    pixelRatio: number,
    width: number,
    height: number,
    globe?: GlobeCamera | null,
  ): void
  attach(create: (invalidate: () => void) => Renderer): void
  detach(): void
}

export interface HostSurface {
  readonly events: HTMLCanvasElement
  schedule(): void
  claim(active: boolean): void
  hover(active: boolean): void
  move(view: View): void
  adapt(definition: GraphDefinition): GraphDefinition
  bind(driver: HostDriver): void
  release(): void
}

interface ViewAnimation {
  readonly from: View
  readonly to: View
  readonly start: number
  readonly duration: number
}

interface PositionAnimation {
  readonly id: number
  readonly indices: readonly number[]
  readonly from: Float32Array
  readonly to: Float32Array
  readonly start: number
  readonly duration: number
  readonly done: (() => void) | null
}

interface Gesture {
  readonly id: number
  readonly touch: boolean
  readonly start: Point
  readonly target: GraphTarget | null
  readonly drag: NodeDrag | null
  readonly lasso: Point[] | null
  readonly lens: Point | null
  last: Point
  event: PointerEvent
  moved: boolean
}

interface Pinch {
  readonly points: Map<number, Point>
  center: Point
  distance: number
}

interface LimitBox {
  readonly scene: number
  readonly positions: number
  readonly box: Bounds | null
}

const svgNamespace = 'http://www.w3.org/2000/svg'
const lassoStep = 3
const keyPan = 0.1
const followMargin = 48
const keyDuration = 200
const visuallyHidden =
  'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap'
const focusOutline = '2px solid var(--graph-focus-ring,#c93700)'
const lassoStyle =
  'fill:color-mix(in srgb,var(--graph-accent,#c93700) 10%,transparent);stroke:var(--graph-accent,#c93700);stroke-width:1.5;stroke-dasharray:4 3;stroke-linejoin:round'

interface LayoutSettings {
  readonly fit: FitOptions | null
  readonly duration: number
}

interface LayoutSession extends LayoutSettings {
  readonly layout: Layout
  readonly movable: Uint8Array
  readonly auto: boolean
  readonly resolve: (completed: boolean) => void
  run: LayoutRun | null
  progressed: boolean
  animation: number
  fitted: boolean
}

const idleLayout: GraphLayoutStatus = Object.freeze({ running: false, progress: 0 })
const idleBundling: GraphBundlingStatus = Object.freeze({ running: false })

function sameLayout(a: Layout | null, b: Layout | null): boolean {
  if (a === b) return true
  return a !== null && b !== null && a.name === b.name && shallowEqual(a.options, b.options)
}

interface NodeDrag {
  readonly target: GraphTarget & { readonly kind: 'node' }
  readonly indices: readonly number[]
  readonly keys: readonly Key[]
  readonly offsets: Float32Array
  readonly inLens: boolean
  started: boolean
}

const defaultPadding = 32
const requestMemory = 8
const rebaseDistance = 2 ** 20
const clickSlop = 4
const touchSlop = 10
const autoPanZone = 40
const autoPanSpeed = 900
const autoPanFirstStep = 16
const autoPanLongestStep = 50
const pickTolerance = 4
const highlightOrder = 2 ** 40
const layerOrder = 2 ** 26
const kindOf = { node: 'nodes', edge: 'edges' } as const satisfies Record<string, StateKind>
const noKeys: ElementKeys = Object.freeze({ nodes: [], edges: [] })

let reducedMotionQuery: MediaQueryList | undefined

function reducedMotion(): boolean {
  reducedMotionQuery ??= window.matchMedia?.('(prefers-reduced-motion: reduce)')
  return reducedMotionQuery?.matches ?? false
}

function toKeys(input: ElementKeysInput): ElementKeys {
  return { nodes: [...(input.nodes ?? [])], edges: [...(input.edges ?? [])] }
}

function sameList(a: readonly Key[], b: readonly Key[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((key) => set.has(key))
}

function sameKeys(a: ElementKeys, b: ElementKeys): boolean {
  return sameList(a.nodes, b.nodes) && sameList(a.edges, b.edges)
}

function sameView(a: View, b: View): boolean {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom
}

function sameTarget(a: GraphTarget | null, b: GraphTarget | null): boolean {
  return a === b || (a !== null && b !== null && a.kind === b.kind && a.key === b.key)
}

function sameEnd(a: GraphTarget | null, b: GraphTarget | null): boolean {
  return a?.kind !== 'edge' || b?.kind !== 'edge' || a.end === b.end
}

function countAlive(alive: Uint8Array, capacity: number): number {
  let count = 0
  for (let index = 0; index < capacity; index++) if (alive[index] === 1) count++
  return count
}

function resolveStyle(style: StateStyle, id: (color: string) => number): ResolvedStateStyle {
  return {
    ...(style.opacity !== undefined ? { opacity: style.opacity } : {}),
    ...(style.strokeWidth !== undefined ? { strokeWidth: style.strokeWidth } : {}),
    ...(style.halo !== undefined ? { halo: style.halo } : {}),
    ...(style.label !== undefined ? { label: style.label } : {}),
    ...(style.fill !== undefined ? { fill: id(style.fill) } : {}),
    ...(style.stroke !== undefined ? { stroke: id(style.stroke) } : {}),
    ...(style.outline !== undefined ? { outline: id(style.outline) } : {}),
    ...(style.labelColor !== undefined ? { labelColor: id(style.labelColor) } : {}),
    ...(style.flow !== undefined ? { flow: flowSpeed(style.flow) } : {}),
    ...(style.raise !== undefined ? { raise: style.raise } : {}),
    ...(style.hide !== undefined ? { hide: style.hide } : {}),
    ...(style.outlineWidth !== undefined || style.outline !== undefined
      ? { outlineWidth: style.outlineWidth ?? defaults.nodeOutlineWidth }
      : {}),
  }
}

export function createGraphHost<S extends string = string, M extends Mark = Mark>(
  container: HTMLElement,
  options: MountGraphOptions<S, M>,
  createRenderer: RendererFactory,
  surface: HostSurface | null = null,
): GraphInstance<S, M> {
  let given: GraphDefinition = options.definition
  let definition: GraphDefinition = surface ? surface.adapt(given) : given
  const controlled = options.selection !== undefined
  let onSelectionChange = options.onSelectionChange
  const foldControlled = options.folded !== undefined
  let onFoldChange = options.onFoldChange
  const viewControlled = options.view !== undefined
  let onViewChange = options.onViewChange
  const timeControlled = options.time !== undefined
  let onTimeChange = options.onTimeChange
  let timeWindow = readWindow(options.time ?? options.initialTime ?? null)
  let filter: TimeFilter | null = timeFilter(timeWindow, definition.time.fade)
  let filterFade = definition.time.fade
  const layersControlled = options.hiddenLayers !== undefined
  type LayerListener = ((event: GraphLayerEvent) => void) | undefined
  let onLayerChange = options.onLayerChange as LayerListener
  let hiddenLayers: readonly string[] = [
    ...new Set<string>(options.hiddenLayers ?? options.initialHiddenLayers ?? []),
  ]
  let layerFilter: LayerFilter | null = null
  let hideChecked = 0
  let shownDetail = -1
  let litStates: readonly string[] = []
  let outgoingView: View | null = null
  let sentViews: View[] = []
  let quiet = false
  let warnedEmpty = false
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
  let remembered: GraphTarget | null = null

  let frameRequest = 0
  let laterRequest: ReturnType<typeof setTimeout> | undefined
  let needsFlush = false
  let full = true
  let destroyed = false
  let settled = false
  let contextLost = false
  let positionsVersion = -1
  let paletteCount = 0
  let paletteColors = new Uint8Array(256 * 4)
  let viewAnimation: ViewAnimation | null = null
  let positionAnimations: PositionAnimation[] = []
  let animationOwner = new Uint32Array(0)
  let animationSerial = 0
  let pendingFit: FitOptions | null =
    options.initialView || viewControlled ? null : { padding: defaultPadding }
  let pendingBounds: { readonly box: Bounds; readonly padding: number } | null = null
  let pixelRatio = window.devicePixelRatio || 1
  let drawingLimit = Number.POSITIVE_INFINITY
  let ratioLimit = Number.POSITIVE_INFINITY
  let sceneVersion = 0
  let pickedScene = -1
  let pickedPositions = -1
  let pickedPaths = 0
  let gesture: Gesture | null = null
  let pinch: Pinch | null = null
  let autoPanning = false
  let autoPanTime = -1
  let limitBox: LimitBox | null = null
  let session: LayoutSession | null = null
  let laidOut = false
  let relayout = false
  let framing = options.initialView === undefined && !viewControlled
  let framed: View | null = null
  let probe: GraphProbe | null = null
  let paletteStamp = 0
  const watchers = new Set<GraphWatcher>()
  let counted = -1
  let counts = { nodes: 0, edges: 0, pendingEdges: 0 }
  let globe: GlobeCamera | null = null
  let lens: GraphLensState | null = null
  let wantedLens: GraphLensState | null = null
  let keyLens = false
  let pointer: Point | null = null
  let lensMemory: { radius: number; zoom: number } | null = null
  let warnedLens = false
  let flowTime = 0

  const model = createGraphModel({ schedule: () => request(true) })
  const scene = createScene()
  const positions = new Positions()
  const buffers = new StateBuffers()
  const projection = new Projection(model)
  const support = new SupportIndex(model)
  const hierarchy = projection.hierarchy
  const containerBoxes = new ContainerBoxes()
  const foldOrigins = new Map<number, readonly [number, number]>()
  const registry = new StateRegistry(
    model,
    buffers,
    {
      indexOf: (key) => projection.edgeIndexOf(key),
      keysAt: (index) => projection.keysAt(index),
    },
    (kind, index) => layerPosition(kind, index),
  )
  const emitter = new Emitter()
  const pickIndex = new PickIndex()
  const themeResolver = new ThemeResolver(element)
  let renderer: Renderer | null = surface ? null : createRenderer(canvas, () => request())

  registry.define(freeStateNames(definition.states))
  if (options.selection !== undefined) registry.set('selected', options.selection)
  projection.setFolded(options.folded ?? options.initialFolded ?? [])
  const store = createStore<GraphState>({
    view: options.view ?? options.initialView ?? { x: 0, y: 0, zoom: 1 },
    width: 0,
    height: 0,
    hovered: null,
    focused: null,
    selection: controlled ? registry.members('selected') : noKeys,
    states: freeStates(),
    positionsVersion: 0,
    layout: idleLayout,
    folded: [...projection.folded],
    bundling: idleBundling,
    routing: idleBundling,
    time: timeWindow,
    lens: null,
    hiddenLayers,
  })
  const readonlyStore: GraphStore = createStore(() => store.state)
  const bundles = new BundleHost(
    {
      edges: scene.edges,
      nodes: scene.nodes,
      positions,
      datum: (index) => {
        const key = scene.edges.keys[index]
        return key === undefined ? undefined : model.edge(key)?.datum
      },
      busy: () => session !== null || positionAnimations.length > 0 || Boolean(gesture?.drag),
      duration: () => definition.transitions.layout,
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
  adoptLimits()
  const routeBoxes = (): Float32Array | null => {
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
    busy: () => session !== null || positionAnimations.length > 0 || Boolean(gesture?.drag),
    request: () => request(),
    sight: () => sight(),
  })
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

  const layerPositions = { nodes: new Map<number, number>(), edges: new Map<number, number>() }
  let layerShape = ''
  const pickSource: PickSource = {
    nodes: scene.nodes,
    edges: scene.edges,
    positions,
    order: (kind, index) => {
      const mask = (kind === 'nodes' ? buffers.nodeMask[index] : buffers.edgeMask[index]) ?? 0
      const raised = (mask & buffers.raised(kind)) !== 0
      return (raised ? highlightOrder : 0) + layerPosition(kind, index) * layerOrder + index
    },
    paths: bundles.paths,
  }

  function sight(except: string | null = null): Sight {
    return {
      zoom: store.get().view.zoom,
      time: filter,
      layers: layerFilter,
      hide: hideFilter(except),
    }
  }

  function hideFilter(except: string | null): HideFilter | null {
    const hide = buffers.hide
    const bit = hide && except !== null ? registry.bit(except) : -1
    if (!hide || bit < 0) return hide
    const flag = (1 << bit) >>> 0
    if (((hide.nodes | hide.edges) & flag) === 0) return hide
    const nodes = (hide.nodes & ~flag) >>> 0
    const edges = (hide.edges & ~flag) >>> 0
    return nodes === 0 && edges === 0 ? null : { ...hide, nodes, edges }
  }

  function orderLayers(names: Iterable<string>): string[] {
    const wanted = new Set(names)
    const known = scene.markLayers.names
    return [
      ...known.filter((name) => wanted.has(name)),
      ...[...wanted].filter((name) => !known.includes(name)),
    ]
  }

  function refreshLayers(): void {
    const next = scene.markLayers.filter(new Set(hiddenLayers))
    if (next === layerFilter) return
    layerFilter = next
    dropHidden()
    request()
  }

  function dropHidden(): void {
    const hovered = store.get().hovered
    if (hovered && !targetShown(hovered)) setHovered(null, null)
    const focused = store.get().focused
    if (focused && !targetShown(focused)) setFocused(null)
  }

  function targetShown(element: GraphTarget): boolean {
    if (!layerFilter && !buffers.hide) return true
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

  function applyHidden(next: Iterable<string>): void {
    const list = orderLayers(next)
    if (sameList(list, hiddenLayers)) return
    hiddenLayers = list
    refreshLayers()
    patch({ hiddenLayers: list })
    emitter.emit('layerchange', { hidden: list })
    request()
  }

  function requestHidden(next: Iterable<string>): void {
    const list = orderLayers(next)
    if (!layersControlled) {
      applyHidden(list)
      return
    }
    if (!sameList(list, hiddenLayers)) onLayerChange?.({ hidden: list })
  }

  function lightSupport(): void {
    const lit = definition.support
    const names = lit ? [lit.carriers, lit.carried] : [null, null]
    for (const name of litStates) {
      if (!names.includes(name) && registry.names.includes(name) && registry.set(name, {})) {
        publishState(name)
      }
    }
    litStates = names.filter((name): name is string => name !== null)
    if (!lit || !support.active) return
    const selected = registry.members('selected').edges
    const light = (name: string | null, walk: (key: Key) => SupportWalk) => {
      if (name === null) return
      const nodes = new Set<Key>()
      const edges = new Set<Key>()
      for (const key of selected) {
        const found = walk(key)
        for (const edge of found.edges) edges.add(edge)
        for (const node of found.nodes) nodes.add(node)
      }
      if (registry.set(name, { nodes, edges })) publishState(name)
    }
    light(lit.carriers, (key) => support.carriers(key))
    light(lit.carried, (key) => support.carried(key))
  }

  function applyTime(next: TimeWindow | null): void {
    if (sameWindow(next, timeWindow)) return
    timeWindow = next
    filter = timeFilter(next, filterFade)
    patch({ time: next })
    emitter.emit('timechange', { window: next })
    request()
  }

  function requestTime(next: TimeWindow | null): void {
    if (!timeControlled) {
      applyTime(next)
      return
    }
    if (!sameWindow(next, timeWindow)) onTimeChange?.({ window: next })
  }

  function refreshFade(): void {
    if (definition.time.fade === filterFade) return
    filterFade = definition.time.fade
    filter = timeFilter(timeWindow, filterFade)
  }

  function layerPosition(kind: StateKind, index: number): number {
    const slot = (kind === 'nodes' ? scene.nodes.slot[index] : scene.edges.slot[index]) ?? 0
    return layerPositions[kind].get(slot) ?? 0
  }

  function freeStates(): Record<string, ElementKeys> {
    return Object.fromEntries(
      freeStateNames(definition.states).map((name) => [name, registry.members(name)]),
    )
  }

  function patch(next: Partial<GraphState>): void {
    store.setState((state) => ({ ...state, ...next }))
  }

  function request(flush = false): void {
    if (flush) needsFlush = true
    if (frameRequest !== 0 || destroyed || (quiet && !flush)) return
    if (!surface) {
      frameRequest = requestAnimationFrame(frame)
      return
    }
    frameRequest = -1
    surface.schedule()
  }

  function hush(run: () => void): void {
    const was = quiet
    quiet = true
    try {
      run()
    } finally {
      quiet = was
    }
  }

  function clock(): number {
    return probe ? performance.now() : 0
  }

  function requestLater(delay: number): void {
    if (laterRequest !== undefined || destroyed) return
    laterRequest = setTimeout(() => {
      laterRequest = undefined
      request()
    }, delay)
  }

  function panLimits(): PanLimits | null {
    const area = definition.view.bounds
    if (!area) return null
    if (!('margin' in area)) return { box: area, margin: 0 }
    if (limitBox?.scene !== sceneVersion || limitBox.positions !== positions.version) {
      limitBox = { scene: sceneVersion, positions: positions.version, box: bounds() }
    }
    return limitBox.box ? { box: limitBox.box, margin: area.margin } : null
  }

  function constrain(view: View): View {
    return constrainView(view, viewport(), definition.view, panLimits())
  }

  function publishView(view: View): void {
    patch({ view })
    emitter.emit('viewchange', { view })
    if (gesture?.lasso) drawLasso(gesture.lasso)
  }

  function baseView(): View {
    return outgoingView ?? sentViews[sentViews.length - 1] ?? store.get().view
  }

  function proposeView(view: View): void {
    if (!viewControlled) {
      publishView(view)
      return
    }
    outgoingView = view
    request()
  }

  function commitView(view: View): boolean {
    const next = constrain(view)
    if (sameView(next, baseView())) return false
    proposeView(next)
    request()
    return true
  }

  function sendView(): void {
    const view = outgoingView
    if (!view) return
    outgoingView = null
    sentViews.push(view)
    if (sentViews.length > requestMemory) sentViews.shift()
    hush(() => (surface ? surface.move(view) : onViewChange?.({ view })))
  }

  function applyView(view: View): void {
    const answered = sentViews.findIndex((sent) => sameView(sent, view))
    if (answered >= 0) sentViews = sentViews.slice(answered + 1)
    else {
      sentViews = []
      outgoingView = null
    }
    if (sameView(view, store.get().view)) return
    publishView(view)
    request()
  }

  function reconstrain(): void {
    const current = baseView()
    if (constrain(current) !== current) commitView(current)
  }

  function viewport(): { width: number; height: number } {
    const { width, height } = store.get()
    return { width, height }
  }

  function resolvePalette(from: number): void {
    const colors = scene.palette.colors
    if (colors.length * 4 > paletteColors.length) {
      const next = new Uint8Array(Math.max(colors.length * 4, paletteColors.length * 2))
      next.set(paletteColors)
      paletteColors = next
    }
    themeResolver.palette(colors, paletteColors, from)
    paletteCount = colors.length
    paletteStamp++
    renderer?.setPalette(paletteColors, paletteCount)
  }

  function adoptLimits(): void {
    const limits = renderer?.limits?.()
    bundles.paths.pointBudget = Math.min(
      defaultPointBudget,
      limits?.pathPoints ?? defaultPointBudget,
    )
    drawingLimit = limits?.drawingBuffer ?? Number.POSITIVE_INFINITY
    ratioLimit = limits?.software ? 1 : Number.POSITIVE_INFINITY
  }

  function refreshTheme(): void {
    renderer?.setTheme(themeResolver.theme())
    resolvePalette(0)
    request()
  }

  function applyStyles(): void {
    const edgeHide = buffers.edgeHide
    const id = (color: string) => scene.palette.id(color)
    for (const kind of ['nodes', 'edges'] as const) {
      registry.names.forEach((name, bit) => {
        const own = definition.states[name]
        const style = isBuiltInState(name) ? { ...builtInStyles[kind][name], ...own } : own
        buffers.setStyle(kind, bit, style ? resolveStyle(style, id) : null)
      })
      for (let bit = registry.names.length; bit < 32; bit++) buffers.setStyle(kind, bit, null)
    }
    if (buffers.edgeHide !== edgeHide && projection.active) registry.refresh()
  }

  function applyLayers(): void {
    const shape = scene.layers.map((layer) => `${layer.kind}${layer.slot}`).join()
    if (shape === layerShape) return
    layerShape = shape
    layerPositions.nodes.clear()
    layerPositions.edges.clear()
    scene.layers.forEach((layer, position) => {
      layerPositions[layer.kind].set(layer.slot, position)
    })
    registry.reorder()
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
  }

  function bounds(keys?: Iterable<Key>): Bounds | null {
    const nodes = scene.nodes
    syncContainers()
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    const include = (index: number) => {
      if (nodes.alive[index] !== 1) return
      if (nodes.shape[index] === containerShape) {
        const box = containerBoxes.bounds(index, positions)
        minX = Math.min(minX, box.minX)
        minY = Math.min(minY, box.minY)
        maxX = Math.max(maxX, box.maxX)
        maxY = Math.max(maxY, box.maxY)
        return
      }
      const radius = nodes.screenUnits[index] === 1 ? 0 : (nodes.size[index] ?? 0) / 2
      minX = Math.min(minX, positions.x(index) - radius)
      minY = Math.min(minY, positions.y(index) - radius)
      maxX = Math.max(maxX, positions.x(index) + radius)
      maxY = Math.max(maxY, positions.y(index) + radius)
    }
    if (keys) {
      for (const key of keys) {
        const record = model.node(key)
        if (record) include(record.index)
      }
    } else {
      for (let index = 0; index < nodes.capacity; index++) include(index)
    }
    return maxX < minX ? null : { minX, minY, maxX, maxY }
  }

  function animateTo(target: View, duration = 0): void {
    const ms = reducedMotion() ? 0 : duration
    if (ms <= 0) {
      viewAnimation = null
      commitView(target)
      return
    }
    const to = constrain(target)
    viewAnimation = { from: baseView(), to, start: performance.now(), duration: ms }
    request()
  }

  function frameBox(box: Bounds, padding: number): View {
    return fitBounds(box, viewport(), padding, definition.view)
  }

  function fitTo(keys: Iterable<Key> | undefined, fitOptions: FitOptions): boolean {
    const box = bounds(keys)
    const size = viewport()
    if (!box || size.width === 0 || size.height === 0) return false
    animateTo(frameBox(box, fitOptions.padding ?? defaultPadding), fitOptions.duration)
    return true
  }

  function target(kind: 'node' | 'edge', key: Key): GraphTarget | null {
    const record = kind === 'node' ? model.node(key) : model.edge(key)
    return record ? { kind, key, datum: record.datum, mark: record.mark.name } : null
  }

  function sphere(): GlobeCamera | null {
    return globe && globe.mix > 0 ? globe : null
  }

  function worldAt(point: Point, view: View = viewAt(point)): Point {
    const camera = sphere()
    const found = camera ? globeWorld(camera, point.x, point.y) : null
    return found ?? toWorld(view, viewport(), point)
  }

  function screenAt(point: Point): Point {
    const camera = sphere()
    if (!camera) return toScreen(store.get().view, viewport(), point)
    const out = { x: 0, y: 0 }
    globeScreen(camera, point.x, point.y, out)
    return out
  }

  function facing(index: number): boolean {
    const camera = sphere()
    return !camera || sideOf(camera, positions.x(index), positions.y(index)) >= 0
  }

  function viewAt(point: Point): View {
    const current = store.get().view
    return lens && lensContains(lens, point) ? lensView(current, viewport(), lens) : current
  }

  function dragView(drag: NodeDrag): View {
    const current = store.get().view
    return drag.inLens && lens ? lensView(current, viewport(), lens) : current
  }

  function lensFocus(): Point {
    const focused = store.get().focused
    const point = focused ? focusPoint(focused) : null
    const size = viewport()
    return point
      ? toScreen(store.get().view, size, point)
      : { x: size.width / 2, y: size.height / 2 }
  }

  function updateLens(): void {
    let next: GraphLensState | null = null
    if (wantedLens && !surface) {
      const { follow } = wantedLens
      const at = follow === 'pointer' ? pointer : follow === 'focus' ? lensFocus() : wantedLens.at
      if (at) next = { ...wantedLens, at }
    }
    if (next) lensMemory = { radius: next.radius, zoom: next.zoom }
    if (sameLens(lens, next)) return
    lens = next
    patch({ lens })
    emitter.emit('lenschange', { lens })
    request()
  }

  function setLens(input: LensInput | null): void {
    keyLens = false
    if (surface && input && dev && !warnedLens) {
      warnedLens = true
      console.warn('graph: the lens does not work on a map')
    }
    if (!input) {
      wantedLens = null
      updateLens()
      return
    }
    const options = definition.interaction.lens
    const size = viewport()
    const place = input.at ?? wantedLens?.at ?? { x: size.width / 2, y: size.height / 2 }
    const radius = input.radius ?? wantedLens?.radius ?? lensMemory?.radius ?? options.radius
    const zoom = input.zoom ?? wantedLens?.zoom ?? lensMemory?.zoom ?? options.zoom
    if (!(radius > 0) || !Number.isFinite(radius)) {
      throw new RangeError('graph: lens radius must be a positive number')
    }
    if (!Number.isFinite(zoom)) throw new RangeError('graph: lens zoom must be a finite number')
    wantedLens = {
      at:
        typeof place === 'string' ? (lens?.at ?? { x: size.width / 2, y: size.height / 2 }) : place,
      radius,
      zoom: clampLensZoom(zoom),
      follow: typeof place === 'string' ? place : null,
    }
    updateLens()
  }

  function trackPointer(point: Point): void {
    pointer = point
    if (keyLens && wantedLens?.follow === 'focus') wantedLens = { ...wantedLens, follow: 'pointer' }
    if (wantedLens?.follow === 'pointer') updateLens()
  }

  function lensKeyFor(event: KeyboardEvent): boolean {
    const key = definition.interaction.lens.key
    if (key === null || event.key !== key || surface || destroyed) return false
    if (event.target !== element && editableTarget(event.target)) return false
    return pointer !== null || document.activeElement === element
  }

  function onLensKeyDown(event: KeyboardEvent): void {
    if (event.repeat || keyLens || !lensKeyFor(event)) return
    const options = definition.interaction.lens
    keyLens = true
    wantedLens = {
      at: pointer ?? lensFocus(),
      radius: lensMemory?.radius ?? options.radius,
      zoom: lensMemory?.zoom ?? options.zoom,
      follow: pointer ? 'pointer' : 'focus',
    }
    updateLens()
  }

  function onLensKeyUp(event: KeyboardEvent): void {
    if (!keyLens || event.key !== definition.interaction.lens.key) return
    event.preventDefault()
    keyLens = false
    wantedLens = null
    updateLens()
  }

  function onLensBlur(): void {
    if (!keyLens) return
    keyLens = false
    wantedLens = null
    updateLens()
  }

  function pickAt(point: Point): GraphTarget | null {
    syncContainers()
    if (!gesture?.drag && pickedPaths !== bundles.paths.version) {
      pickIndex.build(pickSource)
      pickedPaths = bundles.paths.version
      pickedScene = sceneVersion
      pickedPositions = positions.version
    } else if (
      !gesture?.drag &&
      (pickedScene !== sceneVersion || pickedPositions !== positions.version)
    ) {
      pickIndex.refresh(pickSource)
      pickedScene = sceneVersion
      pickedPositions = positions.version
    }
    const camera = sphere()
    const lensView = viewAt(point)
    const world = camera
      ? globeWorld(camera, point.x, point.y)
      : toWorld(lensView, viewport(), point)
    if (!world) return null
    const seen: Sight = {
      zoom: lensView.zoom,
      time: filter,
      layers: layerFilter,
      hide: buffers.hide,
    }
    const surfaceOf = camera ? { scale: globeScale(camera, world.y), visible: facing } : null
    const hit = pickIndex.pick(pickSource, world.x, world.y, seen, pickTolerance, surfaceOf)
    if (!hit) {
      const shown = (index: number) => nodeShown(scene.nodes, index, seen)
      const index = projection.active ? containerBoxes.pick(world.x, world.y, positions, shown) : -1
      const key = index >= 0 ? scene.nodes.keys[index] : undefined
      return key === undefined ? null : target('node', key)
    }
    const key = hit.kind === 'node' ? scene.nodes.keys[hit.index] : scene.edges.keys[hit.index]
    if (key === undefined) return null
    const found = target(hit.kind, key)
    if (!found || hit.kind === 'node') return found
    const aggregate = projection.aggregateAt(hit.index)
    return {
      ...found,
      kind: 'edge',
      ...(hit.end ? { end: hit.end } : {}),
      ...(aggregate ? { aggregate } : {}),
    }
  }

  function groupLinks(): Uint32Array {
    const nodes = scene.nodes
    const pairs: number[] = []
    const member = (index: number): number => {
      let at = index
      while (at >= 0 && nodes.shape[at] === containerShape) {
        let next = -1
        for (
          let child = hierarchy.firstChild[at] ?? -1;
          child >= 0 && next < 0;
          child = hierarchy.nextSibling[child] ?? -1
        ) {
          if (nodes.alive[child] === 1) next = child
        }
        at = next
      }
      return at >= 0 && nodes.alive[at] === 1 ? at : -1
    }
    for (const container of projection.containers) {
      let hub = -1
      for (
        let child = hierarchy.firstChild[container] ?? -1;
        child >= 0;
        child = hierarchy.nextSibling[child] ?? -1
      ) {
        const found = member(child)
        if (found < 0) continue
        if (hub < 0) hub = found
        else pairs.push(hub, found)
      }
    }
    return Uint32Array.from(pairs)
  }

  function isGroup(key: Key): boolean {
    const index = model.node(key)?.index ?? -1
    return index >= 0 && (hierarchy.childCount[index] ?? 0) > 0
  }

  function applyFolded(next: Iterable<Key>): void {
    const folded = [...new Set(next)]
    if (sameList(store.get().folded, folded)) return
    projection.setFolded(folded)
    patch({ folded })
    emitter.emit('foldchange', { folded })
    request(true)
  }

  function requestFolded(next: Iterable<Key>): void {
    const folded = [...new Set(next)]
    if (!foldControlled) {
      applyFolded(folded)
      return
    }
    if (!sameList(store.get().folded, folded)) onFoldChange?.({ folded })
  }

  function allGroups(): Key[] {
    const keys: Key[] = []
    for (let index = 0; index < hierarchy.capacity; index++) {
      const key = hierarchy.keys[index]
      if (
        hierarchy.present[index] === 1 &&
        (hierarchy.childCount[index] ?? 0) > 0 &&
        key !== undefined
      )
        keys.push(key)
    }
    return keys
  }

  function toggleFold(key: Key): void {
    const folded = store.get().folded
    requestFolded(
      projection.folded.has(key)
        ? folded.filter((each) => !Object.is(each, key))
        : [...folded, key],
    )
  }

  function publishSelection(): void {
    const selection = registry.members('selected')
    patch({ selection })
    lightSupport()
    emitter.emit('selectionchange', selection)
    request()
  }

  function requestSelection(next: ElementKeys): void {
    if (controlled) {
      if (!sameKeys(registry.members('selected'), next)) onSelectionChange?.(next)
    } else if (registry.set('selected', next)) {
      publishSelection()
    }
  }

  function publishState(name: string): void {
    patch({ states: { ...store.get().states, [name]: registry.members(name) } })
    request()
  }

  function setHovered(next: GraphTarget | null, event: MouseEvent | null): void {
    const current = store.get().hovered
    const same = sameTarget(current, next)
    if (same && sameEnd(current, next)) return
    if (!same) registry.set('hovered', next ? keysOf(next) : {})
    patch({ hovered: next })
    if (current && event) emitter.emit('pointerleave', { target: current, originalEvent: event })
    if (next && event) emitter.emit('pointerenter', { target: next, originalEvent: event })
    updateCursor()
    request()
  }

  function keysOf(element: GraphTarget): ElementKeysInput {
    if (element.kind === 'edge' && element.aggregate) return { edges: element.aggregate.keys }
    return { [kindOf[element.kind]]: [element.key] }
  }

  function nodePoint(key: Key): Point | null {
    const record = model.node(key)
    return record ? { x: positions.x(record.index), y: positions.y(record.index) } : null
  }

  function focusPoint(focus: GraphTarget): Point | null {
    if (focus.kind === 'node') return nodePoint(focus.key)
    const ends = model.endpoints(focus.key)
    const a = ends ? nodePoint(ends.source) : null
    const b = ends ? nodePoint(ends.target) : null
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null
  }

  function labelOf(focus: GraphTarget): string {
    const record = focus.kind === 'node' ? model.node(focus.key) : model.edge(focus.key)
    const labels = focus.kind === 'node' ? scene.nodes.label : scene.edges.label
    return (record && labels[record.index]) || String(focus.key)
  }

  function announce(text: string): void {
    announcer.textContent = announcer.textContent === text ? `${text}\u00a0` : text
  }

  function reveal(focus: GraphTarget): void {
    const point = focusPoint(focus)
    if (!point) return
    const view = baseView()
    const size = viewport()
    const screen = sphere() ? screenAt(point) : toScreen(view, size, point)
    const inside =
      screen.x >= followMargin &&
      screen.x <= size.width - followMargin &&
      screen.y >= followMargin &&
      screen.y <= size.height - followMargin
    if (!inside) animateTo({ ...view, x: point.x, y: point.y }, keyDuration)
  }

  function setFocused(next: GraphTarget | null, follow = false): void {
    if (sameTarget(store.get().focused, next)) return
    registry.set('focused', next ? { [kindOf[next.kind]]: [next.key] } : {})
    patch({ focused: next })
    if (next) {
      element.style.outline = 'none'
      announce(labelOf(next))
      if (follow) reveal(next)
    }
    emitter.emit('focuschange', { target: next })
    request()
  }

  function moveFocus(direction: Point): void {
    const current = store.get().focused
    const from = current?.kind === 'node' ? (model.node(current.key)?.index ?? -1) : -1
    const seen = sight()
    let index = from >= 0 ? nodeToward(from, direction, scene.nodes, positions, seen) : -1
    if (from < 0) {
      const selected = registry.members('selected').nodes
      const last = selected[selected.length - 1]
      const center = store.get().view
      index =
        last !== undefined
          ? (model.node(last)?.index ?? -1)
          : nearestNode((current && focusPoint(current)) ?? center, scene.nodes, positions, seen)
    }
    const key = index >= 0 ? scene.nodes.keys[index] : undefined
    const next = key !== undefined ? target('node', key) : null
    if (next) setFocused(next, true)
  }

  function focusVisible(): boolean {
    try {
      return element.matches(':focus-visible')
    } catch {
      return true
    }
  }

  function onFocus(): void {
    if (!definition.interaction.keyboard || !focusVisible()) return
    const restored = remembered ? target(remembered.kind, remembered.key) : null
    remembered = null
    if (restored) setFocused(restored, true)
    else if (!store.get().focused) element.style.outline = focusOutline
  }

  function onBlur(): void {
    element.style.outline = 'none'
    const current = store.get().focused
    if (!current) return
    remembered = current
    setFocused(null)
  }

  function cancelLasso(): boolean {
    if (!gesture?.lasso) return false
    if (canvas.hasPointerCapture?.(gesture.id)) canvas.releasePointerCapture(gesture.id)
    gesture = null
    autoPanning = false
    surface?.claim(false)
    drawLasso(null)
    updateCursor()
    return true
  }

  function runKey(event: KeyboardEvent): boolean {
    const action = keyAction(event)
    if (!action) return false
    const { interaction } = definition
    const { focused, selection } = store.get()
    const view = baseView()
    const size = viewport()
    switch (action.type) {
      case 'move':
        moveFocus(action.direction)
        return true
      case 'pan': {
        if (!interaction.pan) return false
        const step = Math.min(size.width, size.height) * keyPan
        commitView(panBy(view, -action.direction.x * step, -action.direction.y * step))
        return true
      }
      case 'zoom': {
        if (!interaction.zoom) return false
        const point = focused ? focusPoint(focused) : null
        const anchor = point
          ? toScreen(view, size, point)
          : { x: size.width / 2, y: size.height / 2 }
        animateTo(zoomAround(view, size, anchor, action.factor, definition.view), keyDuration)
        return true
      }
      case 'fit':
        return fitTo(undefined, { duration: keyDuration })
      case 'activate':
        if (action.toggle && interaction.fold && focused?.kind === 'node' && isGroup(focused.key)) {
          toggleFold(focused.key)
          return true
        }
        if (!focused || interaction.select === false) return false
        selectTarget(focused, action.additive)
        return true
      case 'escape':
        if (cancelLasso()) return true
        if (interaction.select !== false && selection.nodes.length + selection.edges.length > 0) {
          requestSelection(noKeys)
          return true
        }
        if (!focused) return false
        setFocused(null)
        return true
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!definition.interaction.keyboard || event.target !== element) return
    if (runKey(event)) event.preventDefault()
  }

  function applyKeyboard(): void {
    if (definition.interaction.keyboard) {
      element.tabIndex = 0
      element.setAttribute('role', 'application')
      return
    }
    element.removeAttribute('tabindex')
    element.setAttribute('role', 'img')
    element.style.outline = 'none'
    setFocused(null)
  }

  let lassoLayer: SVGSVGElement | null = null

  function drawLasso(points: readonly Point[] | null): void {
    if (!points) {
      lassoLayer?.remove()
      lassoLayer = null
      return
    }
    if (!lassoLayer) {
      lassoLayer = document.createElementNS(svgNamespace, 'svg')
      lassoLayer.setAttribute('aria-hidden', 'true')
      lassoLayer.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible'
      const path = document.createElementNS(svgNamespace, 'path')
      path.style.cssText = lassoStyle
      lassoLayer.append(path)
      element.append(lassoLayer)
    }
    const path = points.map((point) => {
      const screen = screenAt(point)
      return `${screen.x} ${screen.y}`
    })
    lassoLayer.firstElementChild?.setAttribute('d', `M${path.join('L')}Z`)
  }

  function selectInside(polygon: readonly Point[]): void {
    const inside = nodesInside(polygon, scene.nodes, positions, sight()).filter(
      (key) =>
        !registry.has('selected', 'nodes', key) &&
        facing(model.node(key)?.index ?? -1) &&
        scene.nodes.shape[model.node(key)?.index ?? -1] !== containerShape,
    )
    if (inside.length === 0) return
    const current = registry.members('selected')
    requestSelection({ ...current, nodes: [...current.nodes, ...inside] })
  }

  function updateCursor(): void {
    const interactive = definition.interaction.select !== false || definition.interaction.drag
    if (gesture?.lasso) canvas.style.cursor = 'crosshair'
    else if (gesture?.moved) canvas.style.cursor = 'grabbing'
    else if (store.get().hovered && interactive) canvas.style.cursor = 'pointer'
    else canvas.style.cursor = ''
    surface?.hover(store.get().hovered !== null)
  }

  function selectOnClick(clicked: GraphTarget | null, event: MouseEvent): void {
    selectTarget(clicked, event.shiftKey || event.metaKey || event.ctrlKey)
  }

  function selectTarget(clicked: GraphTarget | null, modifier: boolean): void {
    const mode = definition.interaction.select
    if (mode === false) return
    const additive = mode === 'multiple' && modifier
    if (!clicked) {
      if (!additive) requestSelection(noKeys)
      return
    }
    const kind = kindOf[clicked.kind]
    const current = registry.members('selected')
    const merged = clicked.kind === 'edge' ? clicked.aggregate?.keys : undefined
    if (merged) {
      const all = merged.every((key) => registry.has('selected', 'edges', key))
      const others = additive ? current.edges.filter((key) => !merged.includes(key)) : []
      requestSelection({
        nodes: additive ? current.nodes : [],
        edges: additive && all ? others : [...others, ...merged],
      })
      return
    }
    if (!additive) requestSelection({ ...noKeys, [kind]: [clicked.key] })
    else if (registry.has('selected', kind, clicked.key))
      requestSelection({ ...current, [kind]: current[kind].filter((key) => key !== clicked.key) })
    else requestSelection({ ...current, [kind]: [...current[kind], clicked.key] })
  }

  function flushChanges(): void {
    const start = clock()
    const changes = model.flush()
    if (projection.grouping) foldNewGroups(changes)
    const carriers: GraphIssue[] = []
    const supported = support.apply(changes, carriers)
    const projected = projection.apply(changes)
    const flushed = clock()
    scene.apply(projection.view, projected.scene)
    const applied = clock()
    applyChanges(changes, projected)
    if (supported) lightSupport()
    const issues = projected.scene.issues
    probe?.flushed(
      flushed - start,
      applied - flushed,
      carriers.length > 0 ? [...issues, ...carriers] : issues,
    )
  }

  function foldNewGroups(changes: GraphChanges): void {
    const born: Key[] = []
    for (const { key, index } of changes.nodes.added) {
      const record = model.nodeAt(index)
      if (record && groupingOf(record.mark)?.folded) born.push(key)
    }
    if (born.length === 0) return
    const folded = [...new Set([...store.get().folded, ...born])]
    if (foldControlled) {
      onFoldChange?.({ folded })
      return
    }
    projection.setFolded(folded)
    patch({ folded })
    emitter.emit('foldchange', { folded })
  }

  function flushPending(): void {
    if (!needsFlush) return
    needsFlush = false
    flushChanges()
  }

  function placeFoldedGroups(
    changes: GraphChanges,
    projected: ProjectionChanges,
    tracked: (index: number) => boolean,
  ): Set<number> {
    const grouped = new Set<number>()
    let added: Set<number> | null = null
    const fresh = new Set(projected.fresh)
    for (const { index } of projected.scene.nodes.added) {
      if (hierarchy.folded[index] !== 1 || (hierarchy.childCount[index] ?? 0) === 0) continue
      added ??= new Set(changes.nodes.added.map((ref) => ref.index))
      if (!tracked(index) && (added.has(index) || fresh.has(index))) {
        let minX = Number.POSITIVE_INFINITY
        let minY = Number.POSITIVE_INFINITY
        let maxX = Number.NEGATIVE_INFINITY
        let maxY = Number.NEGATIVE_INFINITY
        hierarchy.forEachDescendant(index, (descendant) => {
          if (!tracked(descendant) && !projection.seen(descendant)) return
          const x = positions.x(descendant)
          const y = positions.y(descendant)
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        })
        if (maxX >= minX) {
          positions.set(index, (minX + maxX) / 2, (minY + maxY) / 2)
          grouped.add(index)
        }
      }
      if (!foldOrigins.has(index)) foldOrigins.set(index, [positions.x(index), positions.y(index)])
    }
    return grouped
  }

  function revealPositions(changes: GraphChanges, projected: ProjectionChanges): number[] {
    for (const { index } of changes.nodes.removed) foldOrigins.delete(index)
    for (const group of projected.folded) {
      foldOrigins.set(group, [positions.x(group), positions.y(group)])
    }
    const tracked = (index: number) => !Number.isNaN(positions.source[index * 2] ?? Number.NaN)
    const opened = new Set<number>()
    for (const group of projected.unfolded) {
      opened.add(group)
      const origin = foldOrigins.get(group)
      foldOrigins.delete(group)
      if (!origin) continue
      const dx = positions.x(group) - origin[0]
      const dy = positions.y(group) - origin[1]
      if (dx === 0 && dy === 0) continue
      hierarchy.forEachDescendant(group, (index) => {
        const nested = foldOrigins.get(index)
        if (nested) foldOrigins.set(index, [nested[0] + dx, nested[1] + dy])
        if (!tracked(index)) positions.set(index, positions.x(index) + dx, positions.y(index) + dy)
      })
    }
    const grouped = projection.active
      ? placeFoldedGroups(changes, projected, tracked)
      : new Set<number>()
    if (projected.revealed.length === 0) return []
    const fresh = new Set(projected.fresh)
    const anchorOf = (index: number): number => {
      for (let at = hierarchy.parent[index] ?? -1; at >= 0; at = hierarchy.parent[at] ?? -1) {
        if (opened.has(at)) return at
      }
      return -1
    }
    const indices: number[] = []
    const to: number[] = []
    const placed: number[] = []
    for (const index of projected.revealed) {
      const anchor = anchorOf(index)
      if (anchor < 0 || tracked(index) || scene.nodes.shape[index] === containerShape) continue
      const ax = positions.x(anchor)
      const ay = positions.y(anchor)
      if (fresh.has(index) && !grouped.has(index)) {
        const ring = positions.nextRing(anchor)
        const angle = ring * goldenAngle
        const radius = placementSpacing * Math.sqrt(ring + 1)
        positions.set(index, ax + radius * Math.cos(angle), ay + radius * Math.sin(angle))
        placed.push(index)
        continue
      }
      indices.push(index)
      to.push(positions.x(index), positions.y(index))
      positions.set(index, ax, ay)
    }
    movePositions(indices, to, definition.transitions.layout)
    if (definition.layout && indices.length > 0) makeRoom(indices, to)
    return placed
  }

  function makeRoom(moving: readonly number[], to: readonly number[]): void {
    const keep = new Set(moving)
    const dragged = gesture?.drag ? new Set(gesture.drag.indices) : null
    const graph = layoutGraph(
      scene.nodes,
      scene.edges,
      positions,
      store.get().view.zoom,
      (index) => !dragged?.has(index) && (keep.has(index) || (animationOwner[index] ?? 0) === 0),
      (key) => model.node(key)?.datum,
      undefined,
      { indices: projection.containers, hierarchy },
    )
    moving.forEach((index, at) => {
      graph.xy[index * 2] = to[at * 2] ?? 0
      graph.xy[index * 2 + 1] = to[at * 2 + 1] ?? 0
    })
    const xy = clearRoom(graph)
    if (!xy) return
    const indices: number[] = []
    const targets: number[] = []
    for (let index = 0; index < graph.capacity; index++) {
      if (graph.movable[index] !== 1) continue
      const x = xy[index * 2] ?? 0
      const y = xy[index * 2 + 1] ?? 0
      if (x === graph.xy[index * 2] && y === graph.xy[index * 2 + 1]) continue
      indices.push(index)
      targets.push(x, y)
    }
    movePositions(indices, targets, definition.transitions.layout)
  }

  function applyChanges(changes: GraphChanges, projected: ProjectionChanges): void {
    followPositions(placeNodes(model, positions, changes))
    const fresh = revealPositions(changes, projected)
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
    applyLayers()
    decorations.changed()
    if (result.selection) {
      publishSelection()
      if (controlled) onSelectionChange?.(registry.members('selected'))
    }
    const hovered = store.get().hovered
    if (hovered && !result.hovered && concealed(hovered)) {
      registry.set('hovered', {})
      patch({ hovered: null })
      updateCursor()
    } else if (result.hovered) {
      patch({ hovered: null })
      updateCursor()
    } else if (hovered) {
      const fresh = target(hovered.kind, hovered.key)
      if (fresh && (fresh.datum !== hovered.datum || fresh.mark !== hovered.mark)) {
        patch({ hovered: fresh })
      }
    }
    const focused = store.get().focused
    if (focused && !result.focused && concealed(focused)) {
      const index = focused.kind === 'node' ? (model.node(focused.key)?.index ?? -1) : -1
      const holder = index >= 0 ? hierarchy.keys[hierarchy.representative(index)] : undefined
      setFocused(holder !== undefined ? target('node', holder) : null)
    } else if (result.focused) {
      patch({ focused: null })
      emitter.emit('focuschange', { target: null })
    } else if (focused) {
      const fresh = target(focused.kind, focused.key)
      if (fresh && (fresh.datum !== focused.datum || fresh.mark !== focused.mark)) {
        patch({ focused: fresh })
      }
    }
    if (projected.reshaped && definition.relayout && laidOut) relayout = true
    followLayout(changes, fresh)
  }

  function concealed(element: GraphTarget): boolean {
    if (element.kind === 'node') {
      const index = model.node(element.key)?.index ?? -1
      return index >= 0 && !projection.nodeShown(index)
    }
    return model.edge(element.key) !== undefined && projection.edgeIndexOf(element.key) < 0
  }

  function followLayout(changes: GraphChanges, revealed: readonly number[]): void {
    const layout = definition.layout
    if (!layout) return
    const added = [
      ...changes.nodes.added.filter((ref) => projection.nodeShown(ref.index)),
      ...revealed.map((index) => ({ index })),
    ]
    if (relayout || !laidOut) {
      if (!relayout && added.length === 0) return
      relayout = false
      laidOut = true
      void beginLayout(layout, () => true, true, autoSettings())
      return
    }
    if (added.length === 0) return
    if (layout.incremental === false) {
      void beginLayout(layout, () => true, true, autoSettings())
      return
    }
    const fresh = new Set(added.map((ref) => ref.index))
    const current = session
    if (current) {
      current.run?.stop()
      session = null
      const movable = (index: number) => current.movable[index] === 1 || fresh.has(index)
      if (!launch(current.layout, movable, current))
        settleLayout(current.layout, current, current.resolve)
      return
    }
    void beginLayout(layout, (index) => fresh.has(index), true, autoSettings())
  }

  function autoSettings(): LayoutSettings {
    return { fit: null, duration: definition.transitions.layout }
  }

  function frameLayout(): void {
    if (!framing) return
    if (framed !== null && store.get().view !== framed) {
      framing = false
      return
    }
    pendingFit = { padding: defaultPadding }
  }

  function placeLayout(current: LayoutSession, xy: Float32Array): void {
    const dragged = gesture?.drag ? new Set(gesture.drag.indices) : null
    const limit = Math.min(current.movable.length, xy.length / 2, scene.nodes.capacity)
    for (let index = 0; index < limit; index++) {
      if (current.movable[index] !== 1 || scene.nodes.alive[index] !== 1) continue
      if (dragged?.has(index) || (animationOwner[index] ?? 0) !== 0) continue
      if (!Number.isNaN(positions.source[index * 2] ?? Number.NaN)) continue
      positions.set(index, xy[index * 2] ?? 0, xy[index * 2 + 1] ?? 0)
    }
  }

  function glideLayout(current: LayoutSession, xy: Float32Array): void {
    const dragged = gesture?.drag ? new Set(gesture.drag.indices) : null
    const indices: number[] = []
    const to: number[] = []
    const limit = Math.min(current.movable.length, xy.length / 2, scene.nodes.capacity)
    for (let index = 0; index < limit; index++) {
      if (current.movable[index] !== 1 || scene.nodes.alive[index] !== 1) continue
      if (dragged?.has(index)) continue
      if (!Number.isNaN(positions.source[index * 2] ?? Number.NaN)) continue
      indices.push(index)
      to.push(xy[index * 2] ?? 0, xy[index * 2 + 1] ?? 0)
    }
    patch({ layout: { running: true, progress: 1 } })
    let fit = current.fit
    if (framing) {
      if (framed === null || store.get().view === framed) fit = fit ?? { padding: defaultPadding }
      framing = false
    }
    if (fit) {
      const box = boundsAfter(indices, to)
      const size = viewport()
      if (box && size.width > 0 && size.height > 0) {
        pendingFit = null
        animateTo(frameBox(box, fit.padding ?? defaultPadding), fit.duration ?? current.duration)
        current.fitted = true
      } else if (box) {
        pendingFit = null
        pendingBounds = { box, padding: fit.padding ?? defaultPadding }
        current.fitted = true
      }
    }
    current.animation = movePositions(indices, to, current.duration, () =>
      finishLayout(current, true),
    )
  }

  function boundsAfter(indices: readonly number[], to: readonly number[]): Bounds | null {
    const nodes = scene.nodes
    const moving = new Uint8Array(nodes.capacity)
    for (const index of indices) moving[index] = 1
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    const include = (index: number, x: number, y: number) => {
      if (nodes.shape[index] === containerShape) return
      let radius = nodes.screenUnits[index] === 1 ? 0 : (nodes.size[index] ?? 0) / 2
      for (let at = hierarchy.parent[index] ?? -1; at >= 0; at = hierarchy.parent[at] ?? -1) {
        if (nodes.shape[at] === containerShape) radius += nodes.padding[at] ?? 0
      }
      minX = Math.min(minX, x - radius)
      minY = Math.min(minY, y - radius)
      maxX = Math.max(maxX, x + radius)
      maxY = Math.max(maxY, y + radius)
    }
    for (let index = 0; index < nodes.capacity; index++) {
      if (nodes.alive[index] === 1 && moving[index] !== 1)
        include(index, positions.x(index), positions.y(index))
    }
    indices.forEach((index, i) => {
      include(index, to[i * 2] ?? 0, to[i * 2 + 1] ?? 0)
    })
    return maxX < minX ? null : { minX, minY, maxX, maxY }
  }

  function finishLayout(current: LayoutSession, completed: boolean): void {
    if (session !== current) return
    session = null
    if (current.animation !== 0) cancelAnimation(current.animation)
    patch({ layout: { running: false, progress: completed ? 1 : store.get().layout.progress } })
    if (completed && emitter.has('positionchange')) {
      const moved = new Map<Key, Point>()
      const limit = Math.min(current.movable.length, scene.nodes.capacity)
      for (let index = 0; index < limit; index++) {
        const key = scene.nodes.keys[index]
        if (current.movable[index] !== 1 || scene.nodes.alive[index] !== 1 || key === undefined)
          continue
        moved.set(key, { x: positions.x(index), y: positions.y(index) })
      }
      if (moved.size > 0) emitter.emit('positionchange', { origin: 'layout', positions: moved })
    }
    if (completed && framing) {
      frameLayout()
      framing = false
    }
    if (completed && current.fit && !current.fitted) pendingFit = current.fit
    emitter.emit('layoutend', { name: current.layout.name, completed })
    current.resolve(completed)
    request()
  }

  function launch(
    layout: Layout,
    movable: (index: number) => boolean,
    previous: LayoutSettings & Pick<LayoutSession, 'auto' | 'resolve'>,
  ): boolean {
    const dragged = gesture?.drag ? new Set(gesture.drag.indices) : null
    const graph = layoutGraph(
      scene.nodes,
      scene.edges,
      positions,
      store.get().view.zoom,
      (index) => movable(index) && !dragged?.has(index),
      (key) => model.node(key)?.datum,
      projection.active ? groupLinks() : undefined,
      projection.active ? { indices: projection.containers, hierarchy } : undefined,
    )
    if (!graph.movable.includes(1)) return false
    let moving = 0
    for (const flag of graph.movable) moving += flag
    if (moving * 2 > countAlive(scene.nodes.alive, scene.nodes.capacity)) bundles.fade()
    for (let index = 0; index < Math.min(graph.capacity, animationOwner.length); index++) {
      if (graph.movable[index] === 1) animationOwner[index] = 0
    }
    const current: LayoutSession = {
      layout,
      movable: graph.movable,
      auto: previous.auto,
      resolve: previous.resolve,
      fit: previous.fit,
      duration: previous.duration,
      run: null,
      progressed: false,
      animation: 0,
      fitted: false,
    }
    session = current
    try {
      const run = layout.start(graph, {
        progress: (xy, progress) => {
          if (session !== current) return
          current.progressed = true
          placeLayout(current, xy)
          patch({ layout: { running: true, progress } })
          frameLayout()
          request()
        },
        end: (xy) => {
          if (session !== current) return
          if (current.progressed || current.duration <= 0) {
            placeLayout(current, xy)
            finishLayout(current, true)
          } else {
            glideLayout(current, xy)
          }
        },
      })
      if (session === current) current.run = run
    } catch (error) {
      finishLayout(current, false)
      throw error
    }
    return true
  }

  function beginLayout(
    layout: Layout,
    movable: (index: number) => boolean,
    auto: boolean,
    settings: LayoutSettings,
  ): Promise<boolean> {
    stopLayout()
    return new Promise<boolean>((resolve) => {
      patch({ layout: { running: true, progress: 0 } })
      emitter.emit('layoutstart', { name: layout.name })
      if (!launch(layout, movable, { ...settings, auto, resolve })) {
        settleLayout(layout, settings, resolve)
      }
    })
  }

  function settleLayout(
    layout: Layout,
    settings: LayoutSettings,
    resolve: (completed: boolean) => void,
  ): void {
    if (settings.fit) pendingFit = settings.fit
    patch({ layout: { running: false, progress: 1 } })
    emitter.emit('layoutend', { name: layout.name, completed: true })
    resolve(true)
  }

  function stopLayout(): void {
    const current = session
    if (!current) return
    current.run?.stop()
    finishLayout(current, false)
  }

  function pinLayout(indices: readonly number[]): void {
    const run = session?.run
    if (!run) return
    for (const index of indices) run.pin(index, positions.x(index), positions.y(index))
  }

  function cancelAnimation(id: number): void {
    positionAnimations = positionAnimations.filter((animation) => {
      if (animation.id !== id) return true
      for (const index of animation.indices) {
        if (animationOwner[index] === id) animationOwner[index] = 0
      }
      return false
    })
  }

  function movePositions(
    indices: readonly number[],
    to: readonly number[],
    duration: number,
    done: (() => void) | null = null,
  ): number {
    if (indices.length === 0) {
      done?.()
      return 0
    }
    const ms = reducedMotion() ? 0 : duration
    if (ms <= 0) {
      indices.forEach((index, i) => {
        if (index < animationOwner.length) animationOwner[index] = 0
        positions.set(index, to[i * 2] ?? 0, to[i * 2 + 1] ?? 0)
      })
      request()
      done?.()
      return 0
    }
    if (positions.capacity > animationOwner.length) {
      const owner = new Uint32Array(positions.capacity)
      owner.set(animationOwner)
      animationOwner = owner
    }
    const id = ++animationSerial
    const from = new Float32Array(indices.length * 2)
    indices.forEach((index, i) => {
      animationOwner[index] = id
      from[i * 2] = positions.x(index)
      from[i * 2 + 1] = positions.y(index)
    })
    positionAnimations.push({
      id,
      indices,
      from,
      to: Float32Array.from(to),
      start: performance.now(),
      duration: ms,
      done,
    })
    request()
    return id
  }

  function followPositions(moves: PositionMoves): void {
    if (moves.indices.length === 0) return
    const dragged = new Set(gesture?.drag?.indices)
    const indices: number[] = []
    const to: number[] = []
    moves.indices.forEach((index, i) => {
      if (dragged.has(index)) return
      indices.push(index)
      to.push(moves.to[i * 2] ?? 0, moves.to[i * 2 + 1] ?? 0)
    })
    movePositions(indices, to, definition.transitions.positions)
  }

  function stepPositions(now: number): void {
    const finished: (() => void)[] = []
    positionAnimations = positionAnimations.filter((animation) => {
      const t = Math.max(0, Math.min(1, (now - animation.start) / animation.duration))
      const k = easeInOut(t)
      animation.indices.forEach((index, i) => {
        if (animationOwner[index] !== animation.id) return
        const fromX = animation.from[i * 2] ?? 0
        const fromY = animation.from[i * 2 + 1] ?? 0
        const toX = animation.to[i * 2] ?? 0
        const toY = animation.to[i * 2 + 1] ?? 0
        positions.set(index, fromX + (toX - fromX) * k, fromY + (toY - fromY) * k)
      })
      if (t < 1) return true
      if (animation.done) finished.push(animation.done)
      return false
    })
    for (const done of finished) done()
  }

  function frame(now: number): void {
    frameRequest = 0
    if (destroyed || contextLost) return
    const start = clock()
    if (needsFlush) {
      needsFlush = false
      flushChanges()
    }
    const size = viewport()
    if (pendingBounds && size.width > 0 && size.height > 0) {
      animateTo(frameBox(pendingBounds.box, pendingBounds.padding))
      pendingBounds = null
      framed = store.get().view
    }
    if (pendingFit && fitTo(undefined, pendingFit)) {
      pendingFit = null
      framed = store.get().view
    }
    if (viewAnimation) {
      const t = Math.min(1, (now - viewAnimation.start) / viewAnimation.duration)
      const view = constrain(interpolateView(viewAnimation.from, viewAnimation.to, easeInOut(t)))
      if (t >= 1) viewAnimation = null
      proposeView(view)
    }
    if (autoPanning) stepAutoPan(now)
    sendView()
    if (positionAnimations.length > 0) stepPositions(now)
    if (wantedLens?.follow === 'focus') updateLens()
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
    registry.takeHighlighted()
    syncContainers()
    decorations.prepare()
    const dirty = scene.takeDirty()
    if (dirty.palette || scene.palette.colors.length !== paletteCount) resolvePalette(paletteCount)
    buffers.reserve(scene.nodes.capacity, scene.edges.capacity)
    if (!renderer) {
      decorations.place()
      for (const watcher of watchers) watcher.frame()
      if (viewAnimation || autoPanning || positionAnimations.length > 0 || easing) request()
      return
    }
    const positionsChanged = positions.version !== positionsVersion
    const syncStart = clock()
    renderer.sync({
      scene,
      dirty,
      positions,
      positionsChanged,
      states: buffers,
      full,
      grid: decorations.grid,
      hulls: decorations.hulls,
      ...(projection.active ? { containers: containerBoxes } : {}),
      bundles: bundles.paths,
      bridges: bridges.active ? bridges.set : null,
    })
    const synced = clock()
    full = false
    if (positionsChanged) {
      positionsVersion = positions.version
      patch({ positionsVersion })
    }
    const { view, width, height } = store.get()
    const renderStart = clock()
    const flowing = flows.moving(view, width, height)
    if (flowing) flowTime = flows.time(now)
    const time = flowTime
    const shown = lens ? lensFrame(view, { width, height }, lens) : null
    const wait = renderer.render({
      view,
      width,
      height,
      pixelRatio,
      time,
      lens: shown,
      window: filter,
      layers: layerFilter,
      globe,
    })
    decorations.place()
    const end = clock()
    probe?.framed(start, end - start, synced - syncStart, end - renderStart)
    for (const watcher of watchers) watcher.frame()
    if (viewAnimation || autoPanning || positionAnimations.length > 0 || easing || flowing) {
      request()
    } else if (wait >= 0) requestLater(wait)
  }

  function resize(width: number, height: number): void {
    let cleared = false
    if (!surface) {
      const side = Math.max(width, height, 1)
      pixelRatio = Math.min(window.devicePixelRatio || 1, ratioLimit, drawingLimit / side)
      const across = Math.min(drawingLimit, Math.max(1, Math.round(width * pixelRatio)))
      const down = Math.min(drawingLimit, Math.max(1, Math.round(height * pixelRatio)))
      cleared = canvas.width !== across || canvas.height !== down
      if (canvas.width !== across) canvas.width = across
      if (canvas.height !== down) canvas.height = down
    }
    if (dev && !warnedEmpty && (width === 0 || height === 0)) {
      warnedEmpty = true
      console.warn('graph: the container measures 0 px; give it a width and a height')
    }
    patch({ width, height })
    reconstrain()
    if (cleared && settled && renderer) {
      drawNow()
      return
    }
    request()
  }

  function drawNow(): void {
    if (frameRequest > 0) cancelAnimationFrame(frameRequest)
    frameRequest = 0
    frame(performance.now())
  }

  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[entries.length - 1]
    if (entry) resize(entry.contentRect.width, entry.contentRect.height)
  })
  let ratioQuery: MediaQueryList | null = null
  function watchRatio(): void {
    ratioQuery?.removeEventListener('change', onRatio)
    const ratio = window.devicePixelRatio || 1
    ratioQuery = surface ? null : (window.matchMedia?.(`(resolution: ${ratio}dppx)`) ?? null)
    ratioQuery?.addEventListener('change', onRatio)
  }
  function onRatio(): void {
    watchRatio()
    const { width, height } = store.get()
    resize(width, height)
  }
  reconstrain()
  resizeObserver.observe(element)
  watchRatio()
  const stopTheme = observeTheme(element, refreshTheme)
  const flows = createFlowWatch({
    scene,
    buffers,
    positions,
    element,
    version: () => sceneVersion,
    wake: () => request(),
    paths: bundles.paths,
  })

  function local(event: MouseEvent): Point {
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function pointerEvent(event: MouseEvent, hit: GraphTarget | null) {
    const point = local(event)
    return {
      target: hit,
      point,
      world: worldAt(point),
      originalEvent: event,
    }
  }

  function startDrag(hit: GraphTarget, point: Point): NodeDrag | null {
    if (hit.kind !== 'node' || !definition.interaction.drag) return null
    const group = registry.has('selected', 'nodes', hit.key)
      ? registry.members('selected').nodes
      : [hit.key]
    const inLens = lens !== null && lens.follow === null && lensContains(lens, point)
    const world = worldAt(point)
    const keys: Key[] = []
    const indices: number[] = []
    const taken = new Set<number>()
    const take = (index: number) => {
      const key = scene.nodes.keys[index]
      if (taken.has(index) || key === undefined || scene.nodes.alive[index] !== 1) return
      taken.add(index)
      if (scene.nodes.shape[index] === containerShape) {
        hierarchy.forEachDescendant(index, take)
        return
      }
      keys.push(key)
      indices.push(index)
    }
    for (const key of group) {
      const record = model.node(key)
      if (record) take(record.index)
    }
    const offsets = new Float32Array(indices.length * 2)
    indices.forEach((index, i) => {
      if (index < animationOwner.length) animationOwner[index] = 0
      offsets[i * 2] = positions.x(index) - world.x
      offsets[i * 2 + 1] = positions.y(index) - world.y
    })
    return { target: { ...hit, kind: 'node' }, indices, keys, offsets, inLens, started: false }
  }

  function dragEvent(drag: NodeDrag, event: PointerEvent) {
    const point = local(event)
    return {
      target: drag.target,
      keys: drag.keys,
      point,
      world: worldAt(point, dragView(drag)),
      originalEvent: event,
    }
  }

  function onPointerDown(event: PointerEvent): void {
    if (pinch) return
    if (gesture) {
      if (gesture.touch && event.pointerType === 'touch' && event.pointerId !== gesture.id) {
        beginPinch(gesture, event)
      }
      return
    }
    if (event.button !== 0) return
    viewAnimation = null
    remembered = null
    setFocused(null)
    const point = local(event)
    trackPointer(point)
    const hit = pickAt(point)
    const drag = hit ? startDrag(hit, point) : null
    const { lasso, select } = definition.interaction
    const lassoing = !hit && event.shiftKey && lasso && select === 'multiple'
    const moveLens = !hit && !lassoing && lens?.follow === null && lensContains(lens, point)
    gesture = {
      id: event.pointerId,
      touch: event.pointerType === 'touch',
      start: point,
      last: point,
      event,
      target: hit,
      drag,
      lasso: lassoing ? [worldAt(point, store.get().view)] : null,
      lens: moveLens && lens ? lens.at : null,
      moved: false,
    }
    canvas.setPointerCapture?.(event.pointerId)
    if (drag || lassoing) surface?.claim(true)
    if (lassoing) updateCursor()
  }

  function pinchShape(points: ReadonlyMap<number, Point>): { center: Point; distance: number } {
    const [a, b] = [...points.values()]
    if (!a || !b) return { center: a ?? { x: 0, y: 0 }, distance: 0 }
    return {
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      distance: Math.hypot(a.x - b.x, a.y - b.y),
    }
  }

  function beginPinch(current: Gesture, event: PointerEvent): void {
    gesture = null
    surface?.claim(false)
    autoPanning = false
    viewAnimation = null
    if (current.drag?.started) emitter.emit('dragend', dragEvent(current.drag, current.event))
    if (current.lasso) drawLasso(null)
    const points = new Map([
      [current.id, current.last],
      [event.pointerId, local(event)],
    ])
    pinch = { points, ...pinchShape(points) }
    canvas.setPointerCapture?.(event.pointerId)
    updateCursor()
  }

  function movePinch(current: Pinch): void {
    if (surface) return
    const { center, distance } = pinchShape(current.points)
    const { zoom, pan } = definition.interaction
    const size = viewport()
    let view = baseView()
    if (zoom && current.distance > 0 && distance > 0) {
      view = zoomAround(view, size, current.center, distance / current.distance, definition.view)
    }
    if (pan) view = panBy(view, center.x - current.center.x, center.y - current.center.y)
    current.center = center
    current.distance = distance
    commitView(view)
  }

  function endPinch(current: Pinch, event: PointerEvent): void {
    current.points.delete(event.pointerId)
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    pinch = null
    const [rest] = current.points
    if (rest) {
      const [id, point] = rest
      gesture = {
        id,
        touch: true,
        start: point,
        last: point,
        event,
        target: null,
        drag: null,
        lasso: null,
        lens: null,
        moved: true,
      }
    }
    updateCursor()
  }

  function moveDrag(drag: NodeDrag, point: Point, event: PointerEvent): void {
    if (!drag.started) {
      drag.started = true
      emitter.emit('dragstart', dragEvent(drag, event))
    }
    const camera = sphere()
    const world = camera
      ? globeWorld(camera, point.x, point.y)
      : toWorld(dragView(drag), viewport(), point)
    if (!world) return
    drag.indices.forEach((index, i) => {
      positions.set(
        index,
        world.x + (drag.offsets[i * 2] ?? 0),
        world.y + (drag.offsets[i * 2 + 1] ?? 0),
      )
    })
    pinLayout(drag.indices)
    emitter.emit('drag', dragEvent(drag, event))
    if (emitter.has('positionchange')) {
      const moved = new Map<Key, Point>()
      drag.keys.forEach((key, i) => {
        const index = drag.indices[i] ?? 0
        moved.set(key, { x: positions.x(index), y: positions.y(index) })
      })
      emitter.emit('positionchange', { origin: 'drag', positions: moved })
    }
    request()
  }

  function extendLasso(current: Gesture, lasso: Point[], point: Point): void {
    const end = lasso[lasso.length - 1]
    const last = end ? screenAt(end) : current.start
    if (current.moved && Math.hypot(point.x - last.x, point.y - last.y) >= lassoStep) {
      lasso.push(worldAt(point))
      drawLasso(lasso)
    }
  }

  function autoPanVelocity(): Point | null {
    const current = gesture
    const { autoPan, pan } = definition.interaction
    if (!current || !autoPan || !pan) return null
    if (!current.drag?.started && !(current.lasso && current.moved)) return null
    const { width, height } = viewport()
    const x = edgePush(current.last.x, width, autoPanZone)
    const y = edgePush(current.last.y, height, autoPanZone)
    if (x === 0 && y === 0) return null
    const speed = autoPanSpeed * autoPan.speed
    return { x: x * speed, y: y * speed }
  }

  function followEdge(): void {
    if (autoPanning || !autoPanVelocity()) return
    autoPanning = true
    autoPanTime = -1
    request()
  }

  function stepAutoPan(now: number): void {
    const velocity = autoPanVelocity()
    const current = gesture
    if (!velocity || !current) {
      autoPanning = false
      return
    }
    const elapsed =
      autoPanTime < 0
        ? autoPanFirstStep
        : Math.min(autoPanLongestStep, Math.max(0, now - autoPanTime))
    autoPanTime = now
    const moved = commitView(
      panBy(baseView(), (-velocity.x * elapsed) / 1000, (-velocity.y * elapsed) / 1000),
    )
    if (!moved) {
      if (elapsed > 0) autoPanning = false
      return
    }
    if (current.drag) moveDrag(current.drag, current.last, current.event)
    else if (current.lasso) extendLasso(current, current.lasso, current.last)
  }

  function onPointerMove(event: PointerEvent): void {
    if (pinch) {
      if (!pinch.points.has(event.pointerId)) return
      pinch.points.set(event.pointerId, local(event))
      movePinch(pinch)
      return
    }
    const point = local(event)
    if (!gesture || gesture.id === event.pointerId) trackPointer(point)
    if (!gesture) {
      setHovered(pickAt(point), event)
      return
    }
    if (gesture.id !== event.pointerId) return
    gesture.event = event
    const slop = gesture.touch ? touchSlop : clickSlop
    if (!gesture.moved && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > slop) {
      gesture.moved = true
      updateCursor()
    }
    const { lasso, drag } = gesture
    if (gesture.lens && wantedLens) {
      const from = gesture.lens
      const at = { x: from.x + point.x - gesture.start.x, y: from.y + point.y - gesture.start.y }
      wantedLens = { ...wantedLens, at }
      updateLens()
      gesture.last = point
      return
    }
    if (lasso) {
      extendLasso(gesture, lasso, point)
      gesture.last = point
      followEdge()
      return
    }
    if (drag) {
      gesture.last = point
      if (!gesture.moved) return
      moveDrag(drag, point, event)
      followEdge()
      return
    }
    if (definition.interaction.pan && !surface) {
      commitView(panBy(baseView(), point.x - gesture.last.x, point.y - gesture.last.y))
    }
    gesture.last = point
  }

  function endGesture(event: PointerEvent, cancelled: boolean): void {
    if (pinch?.points.has(event.pointerId)) {
      endPinch(pinch, event)
      return
    }
    if (!gesture || gesture.id !== event.pointerId) return
    const ended = gesture
    gesture = null
    autoPanning = false
    surface?.claim(false)
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    if (ended.drag?.started) emitter.emit('dragend', dragEvent(ended.drag, event))
    if (ended.lasso) {
      drawLasso(null)
      if (!cancelled && ended.moved) selectInside(ended.lasso)
    }
    if (!cancelled && !ended.moved) {
      emitter.emit('click', pointerEvent(event, ended.target))
      selectOnClick(ended.target, event)
    }
    if (!cancelled && !ended.touch) setHovered(pickAt(local(event)), event)
    updateCursor()
  }

  function onPointerUp(event: PointerEvent): void {
    endGesture(event, false)
  }

  function onPointerCancel(event: PointerEvent): void {
    endGesture(event, true)
  }

  function onPointerLeave(event: PointerEvent): void {
    if (gesture || pinch) return
    setHovered(null, event)
    pointer = null
    updateLens()
  }

  function onDoubleClick(event: MouseEvent): void {
    const hit = pickAt(local(event))
    emitter.emit('doubleclick', pointerEvent(event, hit))
    if (event.defaultPrevented || !definition.interaction.fold) return
    if (hit?.kind === 'node' && isGroup(hit.key)) toggleFold(hit.key)
  }

  function onContextMenu(event: MouseEvent): void {
    emitter.emit('contextmenu', pointerEvent(event, pickAt(local(event))))
  }

  function zoomKey(): ZoomKey {
    const agent = navigator as Navigator & { userAgentData?: { platform?: string } }
    const platform = agent.userAgentData?.platform || agent.platform || ''
    return /mac|iphone|ipad|ipod/i.test(platform) ? 'Meta' : 'Control'
  }

  function onWheel(event: WheelEvent): void {
    if (surface) return
    const { zoom, pan, wheel } = definition.interaction
    const command = event.ctrlKey || event.metaKey
    const { width, height } = store.get()
    const view = baseView()
    if (lens && wantedLens && (command || wheel === 'zoom') && lensContains(lens, local(event))) {
      event.preventDefault()
      const speed = zoom ? zoom.speed : 1
      const factor = wheelFactor(event.deltaY, event.deltaMode, height, speed, event.ctrlKey)
      wantedLens = { ...wantedLens, zoom: clampLensZoom(wantedLens.zoom * factor) }
      updateLens()
      return
    }
    if (zoom && (command || wheel === 'zoom')) {
      event.preventDefault()
      viewAnimation = null
      const factor = wheelFactor(event.deltaY, event.deltaMode, height, zoom.speed, event.ctrlKey)
      commitView(zoomAround(view, viewport(), local(event), factor, definition.view))
      return
    }
    if (command) return
    if (wheel === 'pan' && pan) {
      event.preventDefault()
      viewAnimation = null
      let dx = wheelPixels(event.deltaX, event.deltaMode, width)
      let dy = wheelPixels(event.deltaY, event.deltaMode, height)
      if (event.shiftKey && dx === 0) [dx, dy] = [dy, 0]
      commitView(panBy(view, -dx, -dy))
      return
    }
    if (wheel === 'page' && zoom) emitter.emit('zoomhint', { key: zoomKey(), originalEvent: event })
  }

  function onContextLost(event: Event): void {
    event.preventDefault()
    contextLost = true
    renderer?.destroy()
    renderer = null
  }

  function onContextRestored(): void {
    if (destroyed) return
    try {
      renderer = createRenderer(canvas, () => request())
    } catch (error) {
      if (dev) console.warn('graph: cannot restore the WebGL context', error)
      return
    }
    contextLost = false
    full = true
    adoptLimits()
    refreshTheme()
    const { width, height } = store.get()
    resize(width, height)
  }

  const listeners: ReadonlyArray<
    readonly [string, (event: never) => void, AddEventListenerOptions?]
  > = [
    ['pointerdown', onPointerDown],
    ['pointermove', onPointerMove],
    ['pointerup', onPointerUp],
    ['pointercancel', onPointerCancel],
    ['pointerleave', onPointerLeave],
    ['dblclick', onDoubleClick],
    ['contextmenu', onContextMenu],
    ['wheel', onWheel, { passive: false }],
    ...(surface
      ? []
      : ([
          ['webglcontextlost', onContextLost],
          ['webglcontextrestored', onContextRestored],
        ] as const)),
  ]
  for (const [name, listener, listenerOptions] of listeners) {
    canvas.addEventListener(name, listener as EventListener, listenerOptions)
  }
  const elementListeners: ReadonlyArray<readonly [string, (event: never) => void]> = [
    ['keydown', onKeyDown],
    ['focus', onFocus],
    ['blur', onBlur],
  ]
  for (const [name, listener] of elementListeners) {
    element.addEventListener(name, listener as EventListener)
  }
  const windowListeners: ReadonlyArray<readonly [string, (event: never) => void]> = [
    ['keydown', onLensKeyDown],
    ['keyup', onLensKeyUp],
    ['blur', onLensBlur],
  ]
  for (const [name, listener] of windowListeners) {
    window.addEventListener(name, listener as EventListener)
  }
  applyKeyboard()

  model.setMarks(definition.marks)
  projection.setMarks(definition.marks)
  support.setMarks(definition.marks)
  scene.setDefinition(definition)
  decorations.setDefinition(definition)
  bundles.setBundling(definition.bundling, definition.routing)
  bridges.setOptions(definition.bridges)
  applyLayers()
  refreshLayers()
  applyStyles()
  refreshTheme()
  request(true)

  function declared(name: string): string {
    if (isBuiltInState(name) || !Object.hasOwn(definition.states, name)) {
      throw new Error(`graph: unknown state "${name}"`)
    }
    return name
  }

  const view: GraphView = {
    get: () => store.get().view,
    set: (next, viewOptions = {}) => animateTo(next, viewOptions.duration),
    fit: (keys, fitOptions = {}) => {
      pendingFit = fitTo(keys, fitOptions) || keys ? null : fitOptions
    },
    zoomBy: (factor, viewOptions = {}) => {
      const size = viewport()
      const center = { x: size.width / 2, y: size.height / 2 }
      animateTo(zoomAround(baseView(), size, center, factor, definition.view), viewOptions.duration)
    },
    toScreen: (point) => screenAt(point),
    toWorld: (point) => worldAt(point, store.get().view),
  }

  const selection: GraphSelection = {
    get: () => store.get().selection,
    set: (keys) => requestSelection(toKeys(keys)),
    clear: () => requestSelection(noKeys),
  }

  const focus: GraphFocus = {
    get: () => store.get().focused,
    set: (next) => {
      const resolved = next ? target(next.kind, next.key) : null
      if (next && (!resolved || concealed(resolved))) return
      if (resolved && definition.interaction.keyboard) element.focus({ preventScroll: true })
      setFocused(resolved, true)
    },
  }

  const states: GraphStates = {
    set: (name, keys) => {
      if (registry.set(declared(name), keys)) publishState(name)
    },
    add: (name, keys) => {
      if (registry.add(declared(name), keys)) publishState(name)
    },
    remove: (name, keys) => {
      if (registry.remove(declared(name), keys)) publishState(name)
    },
    clear: (name) => {
      const names = name === undefined ? freeStateNames(definition.states) : [declared(name)]
      for (const each of names) if (registry.clear(each)) publishState(each)
    },
    has: (name, element) => registry.has(declared(name), kindOf[element.kind], element.key),
  }

  const positionsApi: GraphPositions = {
    get: (key) => {
      const record = model.node(key)
      return record ? { x: positions.x(record.index), y: positions.y(record.index) } : undefined
    },
    set: (entries, positionOptions = {}) => {
      const indices: number[] = []
      const to: number[] = []
      const moved = new Map<Key, Point>()
      for (const [key, point] of entries) {
        const record = model.node(key)
        if (!record) continue
        indices.push(record.index)
        to.push(point.x, point.y)
        moved.set(key, { x: point.x, y: point.y })
        projection.markSeen(record.index)
      }
      const run = session?.run
      if (run) {
        for (const [i, index] of indices.entries())
          run.pin(index, to[i * 2] ?? 0, to[i * 2 + 1] ?? 0)
      }
      movePositions(indices, to, positionOptions.duration ?? 0)
      if (moved.size > 0) emitter.emit('positionchange', { origin: 'api', positions: moved })
    },
  }

  const layoutApi: GraphLayout = {
    run: (layout, runOptions = {}) => {
      if (surface) return Promise.reject(new Error('graph: layouts do not run on a map'))
      const chosen = layout ?? definition.layout
      if (!chosen) return Promise.reject(new Error('graph: no layout to run'))
      if (needsFlush) {
        needsFlush = false
        flushChanges()
      }
      const fit = runOptions.fit === true ? {} : runOptions.fit || null
      const settings: LayoutSettings = {
        fit,
        duration: Math.max(0, runOptions.duration ?? definition.transitions.layout),
      }
      const keys = runOptions.keys
      if (!keys) return beginLayout(chosen, () => true, false, settings)
      const indices = new Set<number>()
      for (const key of keys) {
        const record = model.node(key)
        if (record) indices.add(record.index)
      }
      return beginLayout(chosen, (index) => indices.has(index), false, settings)
    },
    stop: () => stopLayout(),
  }

  const groups: GraphGroups = {
    folded: () => store.get().folded,
    isFolded: (key) => projection.folded.has(key),
    fold: (keys) => requestFolded([...store.get().folded, ...(keys ?? allGroups())]),
    unfold: (keys) => {
      if (!keys) return requestFolded([])
      const removed = new Set(keys)
      requestFolded(store.get().folded.filter((key) => !removed.has(key)))
    },
    toggle: (key) => toggleFold(key),
    set: (keys) => requestFolded(keys),
    parent: (key) => {
      const index = model.node(key)?.index ?? -1
      const parent = index >= 0 ? (hierarchy.parent[index] ?? -1) : -1
      return parent >= 0 ? hierarchy.keys[parent] : undefined
    },
    children: (key) => {
      const index = model.node(key)?.index ?? -1
      const children: Key[] = []
      if (index < 0) return children
      for (
        let child = hierarchy.firstChild[index] ?? -1;
        child >= 0;
        child = hierarchy.nextSibling[child] ?? -1
      ) {
        const childKey = hierarchy.keys[child]
        if (childKey !== undefined) children.push(childKey)
      }
      return children.reverse()
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
    prepare: () => {
      if (!needsFlush) return
      needsFlush = false
      flushChanges()
    },
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
    if (counted !== sceneVersion) {
      counted = sceneVersion
      counts = {
        nodes: countAlive(scene.nodes.alive, scene.nodes.capacity),
        edges: countAlive(scene.edges.alive, scene.edges.capacity),
        pendingEdges: model.pendingEdges().length,
      }
    }
    return {
      ...counts,
      layout: session?.layout.name ?? null,
      renderer: renderer?.stats?.() ?? null,
    }
  }

  const instance: GraphInstance<S> = {
    store: readonlyStore,
    view,
    selection,
    focus,
    states,
    positions: positionsApi,
    layout: layoutApi,
    anchors: decorations.anchors,
    groups,
    paths,
    time: {
      get: () => timeWindow,
      set: (next) => requestTime(readWindow(next)),
    },
    layers: {
      names: () => scene.markLayers.names,
      hidden: () => hiddenLayers,
      isHidden: (name) => hiddenLayers.includes(name),
      hide: (names) => requestHidden([...hiddenLayers, ...(names ?? scene.markLayers.names)]),
      show: (names) => {
        const shown = new Set<string>(names ?? [...scene.markLayers.names, ...hiddenLayers])
        requestHidden(hiddenLayers.filter((name) => !shown.has(name)))
      },
      toggle: (name) =>
        requestHidden(
          hiddenLayers.includes(name)
            ? hiddenLayers.filter((each) => each !== name)
            : [...hiddenLayers, name],
        ),
      set: (names) => requestHidden(names),
    },
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
        if (needsFlush) {
          needsFlush = false
          flushChanges()
        }
        return bundles.run('bundle')
      },
    },
    routing: {
      run: () => {
        if (needsFlush) {
          needsFlush = false
          flushChanges()
        }
        return bundles.run('route')
      },
    },
    element,
    lens: {
      get: () => lens,
      set: setLens,
      toWorld: (point) => toWorld(viewAt(point), viewport(), point),
    },
    pick: (point) => pickAt(point),
    neighbors: (key) => model.neighbors(key),
    edgesOf: (key) => model.edgesOf(key),
    endpoints: (key) => model.endpoints(key),
    on: (name, handler) => emitter.on(name, handler),
    update(next) {
      if (next.ariaLabel !== undefined) element.setAttribute('aria-label', next.ariaLabel)
      if (next.onSelectionChange !== undefined) onSelectionChange = next.onSelectionChange
      if (controlled && next.selection !== undefined && registry.set('selected', next.selection)) {
        publishSelection()
      }
      if (next.onFoldChange !== undefined) onFoldChange = next.onFoldChange
      if (foldControlled && next.folded !== undefined) applyFolded(next.folded)
      if (next.onViewChange !== undefined && !surface) onViewChange = next.onViewChange
      if (viewControlled && next.view !== undefined && !surface) applyView(next.view)
      if (next.onTimeChange !== undefined) onTimeChange = next.onTimeChange
      if (timeControlled && next.time !== undefined) applyTime(readWindow(next.time))
      if (next.onLayerChange !== undefined) onLayerChange = next.onLayerChange as LayerListener
      if (layersControlled && next.hiddenLayers !== undefined) applyHidden(next.hiddenLayers)
      if (next.definition && next.definition !== given) {
        const previous = definition.layout
        given = next.definition
        definition = surface ? surface.adapt(given) : given
        if (!sameLayout(previous, definition.layout)) {
          if (session?.auto) stopLayout()
          relayout = definition.layout !== null
        }
        model.setMarks(definition.marks)
        projection.setMarks(definition.marks)
        support.setMarks(definition.marks)
        scene.setDefinition(definition)
        decorations.setDefinition(definition)
        bundles.setBundling(definition.bundling, definition.routing)
        bridges.setOptions(definition.bridges)
        refreshFade()
        applyLayers()
        refreshLayers()
        if (registry.define(freeStateNames(definition.states))) patch({ states: freeStates() })
        lightSupport()
        applyStyles()
        applyKeyboard()
        updateCursor()
        reconstrain()
        request(true)
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      unregister()
      probe = null
      const current = session
      session = null
      current?.run?.stop()
      current?.resolve(false)
      if (frameRequest > 0) cancelAnimationFrame(frameRequest)
      clearTimeout(laterRequest)
      resizeObserver.disconnect()
      ratioQuery?.removeEventListener('change', onRatio)
      stopTheme()
      flows.destroy()
      bundles.destroy()
      bridges.destroy()
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
      renderer?.destroy()
      renderer = null
      themeResolver.destroy()
      decorations.destroy()
      for (const watcher of [...watchers]) watcher.destroy()
      watchers.clear()
      element.remove()
      surface?.release()
    },
  }

  const unregister = registerGraph({
    graph: instance as GraphInstance,
    inspect: inspection,
    probe: (next) => {
      probe = next
    },
  })

  exposeInternals(instance, {
    scene,
    positions,
    definition: () => definition,
    containers: () => (projection.active ? containerBoxes : null),
    palette: () => paletteColors,
    masks: () => buffers.nodeMask,
    sight: (except) => sight(except ?? null),
    stamp: () => ({
      scene: sceneVersion,
      positions: positions.version,
      palette: paletteStamp,
      containers: projection.active ? containerBoxes.version : -1,
      detail: detailStep(scene.nodes, scene.edges, sight()),
    }),
    watch(watcher) {
      if (destroyed) return () => {}
      watchers.add(watcher)
      request()
      return () => {
        watchers.delete(watcher)
      }
    },
  })

  exposeSnapshot(instance, () => {
    if (destroyed) throw new Error('graph: cannot export a destroyed graph')
    if (needsFlush) {
      needsFlush = false
      flushChanges()
    }
    registry.takeHighlighted()
    syncContainers()
    decorations.settle()
    if (scene.palette.colors.length !== paletteCount) resolvePalette(paletteCount)
    buffers.reserve(scene.nodes.capacity, scene.edges.capacity)
    request()
    const { view, width, height } = store.get()
    return {
      scene,
      positions,
      states: buffers,
      grid: decorations.grid,
      hulls: decorations.hulls,
      containers: projection.active ? containerBoxes : null,
      bundles: bundles.paths.bundled > 0 ? bundles.paths : null,
      bridges: bridges.active ? bridges.set : null,
      palette: paletteColors,
      theme: themeResolver.theme(),
      view,
      window: filter,
      layers: layerFilter,
      fade: filterFade,
      width,
      height,
      pixelRatio,
      globe: sphere(),
      title: element.getAttribute('aria-label'),
      color: (css) => themeResolver.color(css),
      createRenderer,
    }
  })

  surface?.bind({
    frame,
    follow: (next, ratio, width, height, camera = null) => {
      pixelRatio = ratio
      globe = camera
      hush(() => {
        const state = store.get()
        if (state.width !== width || state.height !== height) patch({ width, height })
        sentViews = []
        const far = Math.max(
          Math.abs(next.x - positions.originX),
          Math.abs(next.y - positions.originY),
        )
        if (far * next.zoom > rebaseDistance) {
          positions.rebase(next.x, next.y)
          request()
        }
        if (!sameView(next, state.view)) publishView(next)
      })
    },
    attach: (create) => {
      renderer?.destroy()
      renderer = create(() => request())
      full = true
      adoptLimits()
      refreshTheme()
    },
    detach: () => {
      renderer?.destroy()
      renderer = null
      full = true
    },
  })

  settled = true
  return instance as unknown as GraphInstance<S, M>
}

/**
 * Mounts a graph into `container` and returns its instance. The graph fills the container: give the
 * container a size.
 */
export function mountGraph<S extends string = string, M extends Mark = Mark>(
  container: HTMLElement,
  options: MountGraphOptions<S, M>,
): GraphInstance<S, M> {
  return createGraphHost(container, options, createWebglRenderer)
}
