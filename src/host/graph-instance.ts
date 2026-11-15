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
  HasShapes,
  HistoryEntry,
  HistoryValues,
  Key,
  KeyList,
  LayerName,
  Layout,
  Mark,
  NodeDatum,
  Point,
  ShapeDatum,
  TimeWindow,
  TimeWindowInput,
  View,
} from '../types'
import type { GraphAnchors } from './anchors'
import type {
  ElementKeys,
  ElementKeysInput,
  GraphDataStatus,
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
  /** Selected nodes, edges and shapes. */
  readonly selection: ElementKeys<M>
  /** Members of each free state, by name. */
  readonly states: { readonly [K in FreeState<S>]: ElementKeys<M> }
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
  /** Loading of the live sources of the current definition. */
  readonly data: GraphDataStatus
  /**
   * Name of the surface the graph draws on: `'canvas'` for its own canvas, `'map'` for a surface
   * made by `mapSurface`. The view is in the units of that surface.
   */
  readonly surface: string
  /**
   * `true` while the graph is suspended: it holds no WebGL context for its own canvas and draws
   * nothing there, and everything else goes on.
   */
  readonly suspended: boolean
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
  readonly nodes?: KeyList | undefined
  /** Keys of the edges to frame, by their two ends as drawn. */
  readonly edges?: KeyList | undefined
  /** Keys of the shapes to frame, by the box of their geometry. */
  readonly shapes?: KeyList | undefined
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

/**
 * The selection of a graph. In controlled mode, changes go to `onSelectionChange` instead. `M` is
 * the union of the marks.
 */
export interface GraphSelection<M extends Mark = Mark> {
  /** Selected nodes, edges and shapes. */
  get(): ElementKeys<M>
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
 * state before its element exists. `M` is the union of the marks.
 */
export interface GraphStates<N extends string = string, M extends Mark = Mark> {
  /** Replaces the members of a state. */
  set(name: N, keys: ElementKeysInput): void
  /** Adds members to a state. */
  add(name: N, keys: ElementKeysInput): void
  /** Removes members from a state. */
  remove(name: N, keys: ElementKeysInput): void
  /** Empties a state, or every free state without a name. */
  clear(name?: N): void
  /** Whether a node, an edge or a shape is a member of a state. */
  has(name: N, element: GraphElement | { readonly kind: 'shape'; readonly key: Key }): boolean
  /** Keys of the members of a state, as `store.get().states[name]` holds them. */
  get(name: N): ElementKeys<M>
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
  fold(keys?: KeyList): void
  /** Unfolds the given groups, or every group without argument. */
  unfold(keys?: KeyList): void
  /** Folds the group if it is unfolded, unfolds it otherwise. */
  toggle(key: Key): void
  /** Replaces the folded groups. */
  set(keys: KeyList): void
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
  hide(names?: KeyList<L>): void
  /** Shows the given layers, or every layer without argument. */
  show(names?: KeyList<L>): void
  /** Hides the layer if it shows, shows it otherwise. */
  toggle(name: L): void
  /** Replaces the hidden layers. */
  set(hidden: KeyList<L>): void
}

/**
 * What a layout run makes of the nodes left out of its `keys`: `'anchors'` keeps them in the
 * graph it lays out, still, so moving nodes settle around them; `'ignored'` leaves them out, with
 * their edges, so the keys are laid out as a whole graph of their own.
 */
export type LayoutOthers = 'anchors' | 'ignored'

/** Options of `layout.run`. */
export interface LayoutRunOptions {
  /** Nodes to lay out. The others stay still and act as anchors, unless `others` is `'ignored'`. */
  readonly keys?: KeyList | undefined
  /**
   * What the nodes left out of `keys` are to the run: `'anchors'` or `'ignored'`. With
   * `'ignored'`, a force run on the keys starts with full energy and its pull to the center, as a
   * run on the whole graph does.
   * @default 'anchors'
   */
  readonly others?: LayoutOthers | undefined
  /**
   * Frames the result: every node and shape with `true`, or the `nodes`, `edges` and `shapes` of
   * fit options, every node and shape when they name none. A result reported at once is framed
   * where nodes land, while they glide.
   */
  readonly fit?: boolean | FitOptions | undefined
  /**
   * Glide to a result reported at once, in milliseconds, `transitions.layout` by default. `0`
   * places nodes at once.
   */
  readonly duration?: number | undefined
}

/** Options of `layout.compute`. */
export interface LayoutComputeOptions {
  /** Nodes to lay out. Defaults to every free node. */
  readonly keys?: KeyList | undefined
  /**
   * What the nodes left out of `keys` are to the layout: `'anchors'` or `'ignored'`, as for a run.
   * @default 'anchors'
   */
  readonly others?: LayoutOthers | undefined
  /** Stops the computation when aborted: the promise then rejects with the reason of the signal. */
  readonly signal?: AbortSignal | undefined
}

/** Layout runs of a graph. `M` is the union of the marks, whose node items layouts read. */
export interface GraphLayout<M extends Mark = Mark> {
  /**
   * Applies pending data changes, then lays out every free node, or only `keys`, with `layout` or
   * the layout of the definition. Resolves to `true` when the run ends and `false` when it is
   * stopped or replaced. Rejects when there is no layout to run, the graph is on a map, an option
   * holds a number that is not finite, or `others` is not one of its values.
   */
  run(layout?: Layout<NodeDatum<M>>, options?: LayoutRunOptions): Promise<boolean>
  /**
   * Applies pending data changes, then computes `layout`, or the layout of the definition, from
   * the current positions, and resolves to the positions it gives the nodes it lays out, by key.
   * Moves nothing and emits nothing; a run in progress goes on. Rejects when there is no layout,
   * on a map, for an unknown `others`, when `signal` aborts, or when the graph is destroyed.
   */
  compute(layout?: Layout<NodeDatum<M>>, options?: LayoutComputeOptions): Promise<Map<Key, Point>>
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

/** Item type of the elements of kind `K` among the marks `M`. */
export type ElementDatum<
  M extends Mark,
  K extends GraphElement['kind'] | 'shape',
> = K extends 'node' ? NodeDatum<M> : K extends 'edge' ? EdgeDatum<M> : ShapeDatum<M>

/**
 * The history of the elements, from the `history` option of their marks: the values they show are
 * those read at the end of the time window.
 */
export interface GraphHistory<M extends Mark = Mark> {
  /**
   * Entries of the history of a node, an edge or a shape, sorted by time, with `time` in
   * milliseconds. Empty for an element without history or an unknown key.
   */
  of<K extends GraphElement['kind'] | 'shape'>(element: {
    readonly kind: K
    readonly key: Key
  }): readonly HistoryEntry<HistoryValues<ElementDatum<M, K>>>[]
  /**
   * Moment the values are read at: the end of the time window, `Infinity` without a window or with
   * an open end. Entries at that moment count only for a single-moment window.
   */
  instant(): number
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

/** Options of `positions.reset`. */
export interface PositionResetOptions {
  /**
   * Animation duration in milliseconds, zero with `prefers-reduced-motion`. A duration that is not
   * finite throws a `RangeError`. Defaults to `transitions.positions` of the definition.
   */
  readonly duration?: number | undefined
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
   * Puts nodes back where their data places them, through the `x` and `y` channels or the
   * `longitude` and `latitude` ones, after a drag or a `positions.set`. Takes the keys to put back,
   * or every node without them. A node with no position in its data, or already there, stays,
   * and so does a node a layout spread inside a group. Animates over `duration`, pins the nodes in
   * a running layout and emits `positionchange` with the origin `'api'` for the nodes that moved.
   */
  reset(keys?: KeyList<Key>, options?: PositionResetOptions): void
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

/** Element counts of a graph that has a shape mark, from `graph.count()`. */
export interface GraphShapeCount extends GraphCount {
  /**
   * Shapes of the data: one per key, the first item of a duplicate key only, without the shapes
   * that wait for the node they follow.
   */
  readonly shapes: number
  /** Shapes of the data that follow a node missing from the data. */
  readonly pendingShapes: number
  /** Nodes, edges and shapes drawn now. */
  readonly shown: GraphShownShapeCount
}

/** Nodes, edges and shapes drawn now, whether in the view or not. */
export interface GraphShownShapeCount extends GraphShownCount {
  /** Shapes drawn: those whose geometry can be read. */
  readonly shapes: number
}

/**
 * Counts that `graph.count()` returns for `M`, a union of marks: `GraphShapeCount` when `M` has a
 * shape mark, else `GraphCount`.
 */
export type GraphCountOf<M extends Mark> = HasShapes<M> extends true ? GraphShapeCount : GraphCount

/**
 * Options of `graph.update`: the options of `mountGraph` that can change after the mount, each one
 * left out to keep its current value.
 */
export type GraphUpdateOptions<S extends string = string, M extends Mark = Mark> = {
  readonly [K in Exclude<
    keyof MountGraphOptions<S, M>,
    | 'initialView'
    | 'initialFolded'
    | 'initialPositions'
    | 'initialTime'
    | 'initialHiddenLayers'
    | 'suspended'
    | 'signal'
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
  readonly onSelectionChange?: ((event: GraphSelectionEvent<M>) => void) | undefined
  /**
   * Groups folded at mount, by key, or a function that decides, once for each group, whether it
   * folds when it first has a child: at mount, and for groups that arrive later, before they are
   * drawn. With controlled `folded`, the function folds the group at once and asks `onFoldChange`
   * to keep it. Later changes go through `groups`.
   */
  readonly initialFolded?:
    | KeyList
    | ((group: Extract<GraphTarget<M>, { readonly kind: 'node' }>) => boolean)
    | undefined
  /**
   * Folded groups. Passing it makes folding controlled for the life of the graph: requests go to
   * `onFoldChange` and only `update({ folded })` applies them.
   */
  readonly folded?: KeyList | undefined
  /**
   * Receives every fold request in controlled mode, instead of the folded groups changing. Each
   * request starts from the last one that `update({ folded })` has not answered yet.
   */
  readonly onFoldChange?: ((event: GraphFoldEvent) => void) | undefined
  /**
   * Positions at mount, by key, in world units: what `positions.snapshot` returns or
   * `positions.set` takes. A node with an entry is drawn there and counts as laid out: no layout
   * runs for it, nothing is emitted and `persistPositions` writes nothing. A node without one is
   * placed by the layout next to its placed neighbors, as when data arrives later. Positions from
   * the data win, and entries that are not finite are skipped. The entries serve the nodes that
   * arrive while the data loads, then are dropped.
   */
  readonly initialPositions?: Iterable<readonly [Key, Point]> | undefined
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
  readonly initialHiddenLayers?: KeyList<LayerName<M>> | undefined
  /**
   * Hidden layers. Passing it makes their visibility controlled for the life of the graph:
   * requests go to `onLayerChange` and only `update({ hiddenLayers })` applies them.
   */
  readonly hiddenLayers?: KeyList<LayerName<M>> | undefined
  /**
   * Receives every layer request in controlled mode, instead of the hidden layers changing. Each
   * request starts from the last one that `update({ hiddenLayers })` has not answered yet.
   */
  readonly onLayerChange?: ((event: GraphLayerEvent<M>) => void) | undefined
  /**
   * Where the graph draws: a surface made by `mapSurface` of `@bruno00o/graph/map`, or `null` for
   * its own canvas in the container. Given to `update` with a new `definition`, both apply
   * together. Each surface keeps its own node positions and view: back on a surface, the graph is
   * where it was left, without a layout run.
   * @default null
   */
  readonly surface?: GraphSurface | null | undefined
  /**
   * Mounts the graph suspended: it creates no WebGL context until `resume` is called. Data, layouts
   * and the store work as usual. Read at the mount only: `update` ignores it.
   * @default false
   */
  readonly suspended?: boolean | undefined
  /**
   * Keeps a copy of the last frame over the graph while it is suspended, so that the page shows it
   * instead of an empty box until `resume` draws again. The copy costs width × height × pixel
   * ratio² × 4 bytes for each suspended graph: `false` keeps none. It can change with `update`.
   * @default true
   */
  readonly keepFrame?: boolean | undefined
  /**
   * Destroys the graph when it aborts. A signal already aborted mounts nothing: the graph comes
   * back destroyed, and a warning is logged in development.
   */
  readonly signal?: AbortSignal | undefined
}

/**
 * A place a graph can draw on other than its own canvas, made by `mapSurface`. It holds one graph
 * at a time, and keeps what it needs to draw it again quickly after the graph leaves.
 */
export interface GraphSurface {
  /** Name the store gives while a graph draws on the surface, such as `'map'`. */
  readonly name: string
  /**
   * Frees what the surface holds for its graph, such as the layer and the renderer kept on a map.
   * A graph on the surface goes back to its own canvas. The surface can be used again afterwards.
   */
  release(): void
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
  readonly selection: GraphSelection<M>
  /** The keyboard focus. */
  readonly focus: GraphFocus<M>
  /** Members of the free states. */
  readonly states: GraphStates<FreeState<S>, M>
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
  /** The history of the elements, read at the end of the time window. */
  readonly history: GraphHistory<M>
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
   * `true` while the graph draws on a map: mounted by `mountMapGraph` or `<MapGraph>`, or moved to a
   * surface made by `mapSurface`.
   */
  readonly drawsOnMap: boolean
  /**
   * Element under a point in screen pixels, nodes before edges and edges before shapes, or `null`.
   * Inside the lens, the element it shows there.
   */
  pick(point: Point): GraphTarget<M> | null
  /** Keys of the nodes connected to a node. */
  neighbors(key: Key): Key[]
  /** Keys of the edges of a node. */
  edgesOf(key: Key): Key[]
  /** Source and target keys of an edge, or `undefined` for an unknown or waiting edge. */
  endpoints(key: Key): Endpoints | undefined
  /**
   * Item of a node, an edge or a shape, as given to its mark, or `undefined` for an unknown key.
   * With a `history`, a copy with the values read at `history.instant()`. The key of a group made
   * by `groups()` gives its `NodeGroup`.
   */
  datumOf<K extends GraphElement['kind'] | 'shape'>(element: {
    readonly kind: K
    readonly key: Key
  }):
    | (K extends 'node' ? NodeDatum<M> : K extends 'edge' ? EdgeDatum<M> : ShapeDatum<M>)
    | undefined
  /**
   * Problems present in the data now, after pending data changes are applied: a problem goes away
   * once fixed. The same array is returned until the problems change, and `issueschange` fires
   * when they do.
   */
  issues(): readonly GraphIssue<M>[]
  /**
   * Counts the elements of the data and those drawn now, after pending data changes are applied.
   * The same object is returned until the counts can change.
   */
  count(): GraphCountOf<M>
  /**
   * Keys of the elements drawn now, whether in the view or not, after pending data changes are
   * applied: the elements that `count().shown` counts. A folded group gives its key, not those of
   * the nodes it hides, and an edge drawn for several merged edges gives the key of each of them.
   * The same object is returned until it can change.
   */
  shown(): ElementKeys<M>
  /**
   * Whether a node, an edge or a shape is drawn now, by the rules of `shown`. A node hidden in a
   * folded group, an unknown key and an edge that waits for an end are not.
   */
  isShown(element: GraphElement | { readonly kind: 'shape'; readonly key: Key }): boolean
  /**
   * Reads the given nodes, edges and shapes again from their items at the next frame, every
   * channel and style, as if their items had changed. Unknown keys are ignored. Use it when a
   * function of a mark reads data that changed outside the item.
   */
  refresh(keys: ElementKeysInput): void
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
   * Resolves once no live source of the definition is loading and what they delivered is applied,
   * at once when none is. A source that failed counts as done: `store.state.data.failed` lists it.
   * Rejects with the reason of `signal` once the graph is destroyed.
   */
  loaded(): Promise<void>
  /**
   * Frees the WebGL context of the own canvas, its textures and buffers, and keeps everything else:
   * data, positions, view, selection, states, layouts, events and companions go on, and the canvas
   * shows the last frame drawn until the theme changes, unless `keepFrame` is `false`. It also
   * works on a graph whose context the browser took away. Calls while suspended do nothing.
   */
  suspend(): void
  /**
   * Takes a WebGL context again and draws the graph as it is now, from the scene kept on the CPU.
   * `await drawn()` waits for that frame, and a context the browser took away comes back first.
   * Called on a graph that is not suspended, it only brings back a context the browser took away.
   */
  resume(): void
  /**
   * Applies a new `definition`, `surface`, `ariaLabel`, `onSelectionChange`, `onFoldChange`,
   * `onViewChange`, `onTimeChange`, `onLayerChange`, controlled `selection`, controlled `folded`,
   * controlled `view`, controlled `time` or controlled `hiddenLayers`. Positions, view and
   * selection stay. With a new `surface`, a `view` given alongside is the view to take there,
   * controlled or not. Throws a `RangeError`, and applies nothing, for a controlled `view` or a
   * `view` given with a new `surface` that is not finite.
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
  evict(): void
}

export interface SurfaceCapabilities {
  readonly name: string
  readonly ownCanvas: boolean
  readonly ownCamera: boolean
  readonly viewGestures: boolean
  readonly layouts: boolean
  readonly lens: boolean
  readonly minimap: boolean
  readonly onMap: boolean
  readonly screenPadding: boolean
  readonly groupFillOpacity: number | null
}

export interface SurfaceCamera {
  readonly view: View
  readonly width: number
  readonly height: number
}

export interface HostSurface extends SurfaceCapabilities {
  readonly events: HTMLCanvasElement
  place(element: HTMLElement, container: HTMLElement): void
  unplace(element: HTMLElement): void
  camera(): SurfaceCamera | null
  schedule(frame: (now: number) => void): number
  cancel(request: number): void
  claim(active: boolean): void
  hover(active: boolean): void
  move(view: View): void
  adapt(definition: GraphDefinition): GraphDefinition
  bind(driver: HostDriver): void
  release(): void
}
