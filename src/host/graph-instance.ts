import type { ReadonlyStore } from '@tanstack/store'
import type { GlobeCamera } from '../core/globe'
import type { Endpoints } from '../core/graph-model'
import type { GraphIssue } from '../core/issues'
import type {
  BuiltInState,
  EdgeDatum,
  FitPadding,
  FreeState,
  GraphDefinition,
  GraphPaths,
  GraphSupport,
  Key,
  LayerName,
  Layout,
  Mark,
  NodeDatum,
  Point,
  TimeWindow,
  TimeWindowInput,
  View,
} from '../types'
import type { GraphAnchors } from './anchors'
import type {
  ElementKeys,
  ElementKeysInput,
  GraphEventHandler,
  GraphEventName,
  GraphEventOptions,
  GraphFoldEvent,
  GraphLayerEvent,
  GraphSelectionEvent,
  GraphTarget,
  GraphTimeEvent,
  GraphViewEvent,
} from './events'
import type { GraphLens, GraphLensState } from './lens'
import type { Renderer } from './renderer'

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

/**
 * Read-only TanStack Store of the graph state, written through the methods of the instance. A
 * subscriber that throws stops neither the others nor the graph: its error goes to `reportError`.
 */
export type GraphStore<S extends string = string, M extends Mark = Mark> = ReadonlyStore<
  GraphState<S, M>
>

/** Options of an animated view change. */
export interface ViewOptions {
  /**
   * Animation duration in milliseconds, zero with `prefers-reduced-motion`. A duration that is not
   * finite throws a `RangeError`.
   * @default 0
   */
  readonly duration?: number | undefined
}

/**
 * Options of `view.fit`: what to frame and how. A selection, a path or the result of `paths.reach`
 * has the `{ nodes, edges }` shape and frames as given.
 */
export interface FitOptions extends ViewOptions {
  /** Keys of the nodes to frame. A node hidden in a folded group frames that group. */
  readonly nodes?: Iterable<Key> | undefined
  /** Keys of the edges to frame, by their two ends as drawn. */
  readonly edges?: Iterable<Key> | undefined
  /**
   * Margin around the framed area, in screen pixels: a number for every side, or a margin per
   * side, where a side left out takes the `padding` of the `view` of the definition. Defaults to
   * that `padding`.
   */
  readonly padding?: number | FitPadding | undefined
  /**
   * Largest zoom of this fit, so that a single node or a close group does not fill the view. The
   * `maxZoom` of the definition still applies, and gestures keep it as their only limit.
   */
  readonly maxZoom?: number | undefined
}

/**
 * The camera of a graph. The last animated call wins, and every call stays within the `view`
 * limits of the definition. In controlled mode, changes go to `onViewChange` instead.
 */
export interface GraphView {
  /** Current view. */
  get(): View
  /**
   * Moves the view, at once or over `duration`. Throws a `RangeError` for an `x`, a `y` or a `zoom`
   * that is not finite.
   */
  set(view: View, options?: ViewOptions): void
  /**
   * Frames the given nodes and edges, or every node when the options name neither. Called before
   * the element has a size, it waits for one. While automatic fits follow a layout run, they frame
   * these nodes and edges instead of every node. Throws a `TypeError` for keys given as a list,
   * pass `{ nodes }`, and a `RangeError` for a `padding`, a `maxZoom` or a `duration` that is not
   * finite.
   */
  fit(options?: FitOptions): void
  /**
   * Multiplies the zoom around the center of the view, up to the zoom limits. Throws a `RangeError`
   * for a factor that is not a positive finite number.
   */
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
  /** Keys of the members of a state, as `store.get().states[name]` holds them. */
  get(name: N): ElementKeys
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
  /**
   * Key of the group node that `groups()` makes for a value, whether it exists yet or not.
   * `name` is the `name` of that mark, or the field of its `by` option when it has no name, and
   * `parent` the value of its `parent` option, for a group nested in a group of the data.
   */
  keyOf(name: string, value: Key, parent?: Key): Key
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
  readonly keys?: Iterable<Key> | undefined
  /**
   * Frames the result: every node with `true`, or the `nodes` and `edges` of fit options, every
   * node when they name neither. A result reported at once is framed where nodes land, while they
   * glide.
   */
  readonly fit?: boolean | FitOptions | undefined
  /**
   * Glide to a result reported at once, in milliseconds, `transitions.layout` by default. `0`
   * places nodes at once.
   */
  readonly duration?: number | undefined
}

/** Layout runs of a graph. `M` is the union of the marks, whose node items layouts read. */
export interface GraphLayout<M extends Mark = Mark> {
  /**
   * Applies pending data changes, then lays out every free node, or only `keys`, with `layout` or
   * the layout of the definition. Resolves to `true` when the run ends and `false` when it is
   * stopped or replaced. Rejects when there is no layout to run, the graph is on a map, or an
   * option holds a number that is not finite.
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

/** Options of `positions.snapshot`. */
export interface PositionSnapshotOptions {
  /**
   * Where to read a node that glides: `true` for where its glide ends, `false` for where it is
   * drawn now. A node that a layout run moves step by step is where the run has brought it either
   * way.
   * @default true
   */
  readonly settled?: boolean | undefined
}

/** Node positions, in world units. */
export interface GraphPositions {
  /** Position of a node, as drawn now, or `undefined` for an unknown key. */
  get(key: Key): Point | undefined
  /**
   * Moves nodes, at once or over `duration`, pinned in a running layout until it ends, and emits
   * `positionchange` with the origin `'api'`. An entry whose `x` or `y` is not finite is skipped,
   * with a warning in development.
   */
  set(entries: Iterable<readonly [Key, Point]>, options?: ViewOptions): void
  /**
   * Positions of every node of the data, by key, groups and nodes hidden in folded groups
   * included. Gliding nodes give where their glide ends, unless `settled` is `false`. A new map
   * each call, that `set` takes back as is.
   */
  snapshot(options?: PositionSnapshotOptions): Map<Key, Point>
}

/** Element counts of a graph, from `graph.count()`. */
export interface GraphCount {
  /**
   * Nodes of the data: one per key, the first item of a duplicate key only, group nodes made by
   * `groups()` included.
   */
  readonly nodes: number
  /** Edges of the data whose two ends are nodes of the data. */
  readonly edges: number
  /** Edges of the data that wait for an end node, or name none. */
  readonly pending: number
  /** Nodes and edges drawn now. */
  readonly shown: GraphShownCount
}

/**
 * Nodes and edges drawn now, whether in the view or not: after folding and merging, without the
 * elements out of their zoom range or of the time window, in a hidden layer or hidden by a state.
 */
export interface GraphShownCount {
  /** Nodes drawn: a folded group counts once, an unfolded group once for its box. */
  readonly nodes: number
  /** Edges drawn: an edge drawn for several merged edges counts once. */
  readonly edges: number
}

/**
 * Options of `graph.update`: the options of `mountGraph` that can change after the mount, each one
 * left out to keep its current value.
 */
export type GraphUpdateOptions<S extends string = string, M extends Mark = Mark> = {
  readonly [K in Exclude<
    keyof MountGraphOptions<S, M>,
    'initialView' | 'initialFolded' | 'initialTime' | 'initialHiddenLayers' | 'signal'
  >]?: MountGraphOptions<S, M>[K] | undefined
}

/** Options of `mountGraph`. `S` and `M` come from the definition. */
export interface MountGraphOptions<S extends string = string, M extends Mark = Mark> {
  /** What to draw: the result of `defineGraph`. */
  readonly definition: GraphDefinition<S, M>
  /** Accessible name of the graph element. */
  readonly ariaLabel: string
  /**
   * View at mount, within the `view` limits of the definition. Without it and without `view`, the
   * first data is fitted with the `padding` of the `view` of the definition, unless its `autoFit`
   * is `'never'`.
   */
  readonly initialView?: View | undefined
  /**
   * Current view, applied as given. Passing it makes the view controlled for the life of the graph:
   * gestures, keys, `view` calls and animation steps go to `onViewChange`, and only
   * `update({ view })` moves the view.
   */
  readonly view?: View | undefined
  /**
   * Receives the view requests in controlled mode, within the `view` limits of the definition, at
   * most once per frame and before drawing: call `update({ view })` in it to draw the request in
   * the same frame.
   */
  readonly onViewChange?: ((event: GraphViewEvent) => void) | undefined
  /** Initial selection. Passing it makes the selection controlled for the life of the graph. */
  readonly selection?: ElementKeysInput | undefined
  /**
   * Receives every selection request in controlled mode, instead of the selection changing. Each
   * request starts from the last one that `update({ selection })` has not answered yet.
   */
  readonly onSelectionChange?: ((event: GraphSelectionEvent) => void) | undefined
  /** Groups folded at mount, by key. Later changes go through `groups`. */
  readonly initialFolded?: Iterable<Key> | undefined
  /**
   * Folded groups. Passing it makes folding controlled for the life of the graph: requests go to
   * `onFoldChange` and only `update({ folded })` applies them.
   */
  readonly folded?: Iterable<Key> | undefined
  /**
   * Receives every fold request in controlled mode, instead of the folded groups changing. Each
   * request starts from the last one that `update({ folded })` has not answered yet.
   */
  readonly onFoldChange?: ((event: GraphFoldEvent) => void) | undefined
  /** Time window at mount, or `null` for none. Later changes go through `time`. */
  readonly initialTime?: TimeWindowInput | null | undefined
  /**
   * Time window, or `null` for none. Passing it makes the window controlled for the life of the
   * graph: `time.set` calls go to `onTimeChange`, and only `update({ time })` moves the window.
   */
  readonly time?: TimeWindowInput | null | undefined
  /** Receives every window request in controlled mode, instead of the window changing. */
  readonly onTimeChange?: ((event: GraphTimeEvent) => void) | undefined
  /** Layers hidden at mount, by name. Later changes go through `layers`. */
  readonly initialHiddenLayers?: Iterable<LayerName<M>> | undefined
  /**
   * Hidden layers. Passing it makes their visibility controlled for the life of the graph:
   * requests go to `onLayerChange` and only `update({ hiddenLayers })` applies them.
   */
  readonly hiddenLayers?: Iterable<LayerName<M>> | undefined
  /**
   * Receives every layer request in controlled mode, instead of the hidden layers changing. Each
   * request starts from the last one that `update({ hiddenLayers })` has not answered yet.
   */
  readonly onLayerChange?: ((event: GraphLayerEvent<M>) => void) | undefined
  /**
   * Destroys the graph when it aborts. A signal already aborted mounts nothing: the graph comes
   * back destroyed, and a warning is logged in development.
   */
  readonly signal?: AbortSignal | undefined
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
   * Aborted when the graph is destroyed, with an `AbortError` `DOMException`, or with the reason of
   * the `signal` of the mount when it destroyed the graph. Pass it to `fetch`, `addEventListener`
   * or `on` to stop the work tied to the graph.
   */
  readonly signal: AbortSignal
  /** `true` once the graph is destroyed. */
  readonly destroyed: boolean
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
  /**
   * Item of a node or an edge, as given to its mark, or `undefined` for an unknown key. The key of
   * a group made by `groups()` gives its `NodeGroup`.
   */
  datumOf<K extends GraphElement['kind']>(element: {
    readonly kind: K
    readonly key: Key
  }): (K extends 'node' ? NodeDatum<M> : EdgeDatum<M>) | undefined
  /**
   * Problems present in the data now, after pending data changes are applied: a problem goes away
   * once fixed. The same array is returned until the problems change, and `issueschange` fires
   * when they do.
   */
  issues(): readonly GraphIssue[]
  /**
   * Counts the elements of the data and those drawn now, after pending data changes are applied.
   * The same object is returned until the counts can change.
   */
  count(): GraphCount
  /**
   * Subscribes to an event until the returned function is called or the `signal` of the options
   * aborts, and subscribes nothing once the graph is destroyed. A handler that throws stops neither
   * the others nor the graph: its error goes to `reportError`.
   */
  on<K extends GraphEventName>(
    name: K,
    handler: GraphEventHandler<K, M>,
    options?: GraphEventOptions,
  ): () => void
  /**
   * Resolves after the next frame is drawn, the first one included. When no frame is due, it
   * resolves on the next animation frame, without drawing one. Rejects with the reason of `signal`
   * once the graph is destroyed.
   */
  drawn(): Promise<void>
  /**
   * Applies a new `definition`, `ariaLabel`, `onSelectionChange`, `onFoldChange`, `onViewChange`,
   * `onTimeChange`, `onLayerChange`, controlled `selection`, controlled `folded`, controlled
   * `view`, controlled `time` or controlled `hiddenLayers`. Positions, view and selection stay.
   * Throws a `RangeError`, and applies nothing, for a controlled `view` that is not finite.
   */
  update(options: GraphUpdateOptions<S, M>): void
  /**
   * Removes the element, frees every resource and aborts `signal`. A layout run in progress
   * resolves to `false`. Afterwards, reads return the last state or nothing, and actions do
   * nothing.
   */
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
