/** Key of a node or an edge: a string or a number, unique within each kind of element. */
export type Key = string | number

/** A point, in screen pixels or in world units depending on where it is used. */
export interface Point {
  /** Horizontal coordinate, growing to the right. */
  readonly x: number
  /** Vertical coordinate, growing downward. */
  readonly y: number
}

/** The camera: the world point at the center of the graph element, and a zoom factor. */
export interface View {
  /** Horizontal coordinate of the center, in world units. */
  readonly x: number
  /** Vertical coordinate of the center, in world units. */
  readonly y: number
  /** Screen pixels per world unit. At zoom 1, one world unit is one CSS pixel. */
  readonly zoom: number
}

/** A function that reads a value from an item of the data. */
export type Accessor<T, V> = (datum: T) => V

/** Names of the fields of `T` whose values are `V`, `null` or `undefined`. */
export type FieldOf<T, V> = {
  [K in keyof T]-?: T[K] extends V | null | undefined ? K : never
}[keyof T] &
  string

/** Names of the required fields of `T` whose values are keys. */
export type KeyFieldOf<T> = {
  [K in keyof T]-?: T[K] extends Key ? (Partial<Pick<T, K>> extends Pick<T, K> ? never : K) : never
}[keyof T] &
  string

/** A field name or a function. Its value goes through a scale. */
export type Channel<T, V> = FieldOf<T, V> | Accessor<T, V | null | undefined>

/** A field name or a function that gives the key of an item, or of a node it points to. */
export type KeyChannel<T> = KeyFieldOf<T> | Accessor<T, Key>

/** A constant or a function of the item, never a field name. Its value is final, with no scale. */
export type Style<T, V> = V | Accessor<T, V>

/** One change of a live source. */
export interface SourceChange<T> {
  /** What happened to the item. */
  readonly type: 'insert' | 'update' | 'delete'
  /** Key of the item. */
  readonly key: Key
  /** The item after the change, or as it was for a delete. */
  readonly value: T
}

/** What `subscribeChanges` returns. */
export interface SourceSubscription {
  /** Stops the calls to the callback. */
  unsubscribe(): void
}

/**
 * Data that streams its changes, such as a TanStack DB collection. A mark recognizes it by its
 * `subscribeChanges` method, before trying to iterate it.
 */
export interface LiveSource<T> {
  /**
   * Calls `callback` with each batch of changes. With `includeInitialState`, the current items
   * come first, as inserts.
   */
  subscribeChanges(
    callback: (changes: ReadonlyArray<SourceChange<T>>) => void,
    options?: { includeInitialState?: boolean },
  ): SourceSubscription
}

/** Data of a mark: an iterable, reconciled by key on each new definition, or a live source. */
export type GraphData<T> = Iterable<T> | LiveSource<T>

/** Shape of a node. */
export type NodeShape = 'circle' | 'square' | 'diamond'

/** Line pattern of an edge. */
export type EdgeDash = 'solid' | 'dashed' | 'dotted'

/** Ends of an edge that carry an arrow head. */
export type EdgeArrow = 'none' | 'source' | 'target' | 'both'

/** Corner of a node that holds a badge. */
export type BadgeCorner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

/** Side of the node where its label sits. `'center'` puts it on the node. */
export type LabelPlacement = 'bottom' | 'top' | 'right' | 'left' | 'center'

/** Font weight: `'normal'` (400), `'bold'` (700), or a number from 1 to 1000. */
export type LabelWeight = 'normal' | 'bold' | number

/**
 * A pill in a corner of a node. It hides while the node measures less than 10 pixels on screen, and
 * its text shows from 12.
 */
export interface Badge {
  /** Text or number in the pill. Without it, the badge is a dot. */
  readonly text?: string | number
  /**
   * Pill color.
   * @default --graph-badge-fill
   */
  readonly fill?: string
  /**
   * Text color.
   * @default --graph-badge-ink
   */
  readonly color?: string
}

/** A picture or an icon drawn inside a node, cropped to its shape. */
export interface NodeImage {
  /** Image URL: SVG, PNG, JPEG or anything the browser can draw. */
  readonly src: string
  /**
   * Size of the image relative to the node diameter.
   * @default 1
   */
  readonly scale?: number
  /** Draws the image as a mask of this color, such as an icon that follows the theme. */
  readonly color?: string
}

/** Text and style of a label, shared by node and edge labels. */
export interface LabelTextOptions<T> {
  /** Main text, where `\n` starts a new line. Anything but a non-empty string draws no label. */
  readonly text: Channel<T, string>
  /**
   * Plate behind the label: a CSS color, `true` for `--graph-label-background`, `false` or `null`
   * for none. A plated label has no halo.
   */
  readonly background?: Style<T, string | boolean | null>
  /**
   * Color of the main text.
   * @default --graph-ink
   */
  readonly color?: Style<T, string>
  /**
   * Font size in pixels at zoom 1: 12 for nodes and 11 for edges by default. Labels shrink when
   * you zoom out, not when you zoom in.
   */
  readonly size?: Style<T, number>
  /**
   * Font weight: `'normal'` (400), `'bold'` (700), or a number from 1 to 1000.
   * @default 500
   */
  readonly weight?: Style<T, LabelWeight>
  /**
   * CSS font family. Load web fonts before mounting the graph.
   * @default --graph-font
   */
  readonly font?: Style<T, string>
  /** Width in pixels at zoom 1 past which each line ends with an ellipsis. */
  readonly maxWidth?: Style<T, number>
}

/** Text and style of a node label. */
export interface LabelOptions<T> extends LabelTextOptions<T> {
  /** Second line, at eleven twelfths of the size, in normal weight and `--graph-ink-muted`. */
  readonly secondary?: Channel<T, string>
  /**
   * Side of the node where the label sits, or `'center'` on the node.
   * @default 'bottom'
   */
  readonly placement?: Style<T, LabelPlacement>
  /**
   * Smallest diameter of the node on screen, in pixels, for its label to show. Hovered and focused
   * nodes ignore it.
   */
  readonly minScreenSize?: Style<T, number>
}

/** Text and style of an edge label, which sits halfway along the edge and turns with it. */
export interface EdgeLabelOptions<T> extends LabelTextOptions<T> {}

/** Name of a mark: a string chosen in its options, or `undefined` for a mark without one. */
export type MarkName = string | undefined

/**
 * Options of `nodes()`. Channels go through a scale; styles are final values. `N` is the type of
 * `name`.
 */
export interface NodeOptions<T, N extends MarkName = MarkName> {
  /**
   * Name of the mark, reported as `mark` by the targets of its nodes. Compare it in event handlers
   * to tell marks apart and narrow `datum` to the items of one mark.
   */
  readonly name?: N
  /**
   * Node key, unique across node marks. Required for an iterable whose items have no `id` field.
   * @default 'id'
   */
  readonly key?: KeyChannel<T>
  /**
   * Value passed to the `color` scale: a category or a number.
   * @default --graph-node
   */
  readonly color?: Channel<T, string | number | boolean>
  /**
   * Value passed to the `size` scale. The size is a diameter.
   * @default 16
   */
  readonly size?: Channel<T, number>
  /** Label text, or the text with its style. */
  readonly label?: Channel<T, string> | LabelOptions<T>
  /** Horizontal position in world units. The node follows it, and layouts leave it in place. */
  readonly x?: Channel<T, number>
  /** Vertical position in world units. The node follows it, and layouts leave it in place. */
  readonly y?: Channel<T, number>
  /**
   * Node shape: `'circle'`, `'square'` or `'diamond'`.
   * @default 'circle'
   */
  readonly shape?: Style<T, NodeShape>
  /** Fill color. Wins over `color`. */
  readonly fill?: Style<T, string>
  /**
   * Color of the contour drawn inside the shape.
   * @default --graph-node-ring
   */
  readonly stroke?: Style<T, string>
  /**
   * Width of the inner contour, in screen pixels.
   * @default 1
   */
  readonly strokeWidth?: Style<T, number>
  /** Color of a ring outside the shape, or `null` for none. Alone, it draws a 2 pixel ring. */
  readonly outline?: Style<T, string | null>
  /**
   * Width of the ring outside the shape, in screen pixels. Alone, it draws the ring in
   * `--graph-node-ring`.
   */
  readonly outlineWidth?: Style<T, number>
  /**
   * Opacity from 0 to 1.
   * @default 1
   */
  readonly opacity?: Style<T, number>
  /** Picture or icon inside the node: a URL, an image with options, or `null` for none. */
  readonly image?: Style<T, string | NodeImage | null>
  /** A function per corner that returns the badge of an item, or `null` for none. */
  readonly badges?: Readonly<Partial<Record<BadgeCorner, Accessor<T, Badge | null | undefined>>>>
  /**
   * `'screen'` keeps the size of the node, in pixels, the same at every zoom.
   * @default 'world'
   */
  readonly units?: 'world' | 'screen'
  /**
   * Key of the group that contains the node, `null` for a top-level node. A node with children is a
   * group: unfolded, it draws as a container behind them; folded, it hides them and draws as a node.
   */
  readonly parent?: Channel<T, Key>
  /** Look of the node while it is an unfolded group, drawn as a container behind its children. */
  readonly container?: ContainerOptions<T>
}

/** Outline of an unfolded group: `'rectangle'`, with rounded corners, or `'circle'`. */
export type ContainerShape = 'rectangle' | 'circle'

/**
 * Options of the `container` option of `nodes()`: the look of a group while it is unfolded. The
 * container fits its children and follows them as they move.
 */
export interface ContainerOptions<T> {
  /**
   * Outline around the children: `'rectangle'`, with rounded corners, or `'circle'`.
   * @default 'rectangle'
   */
  readonly shape?: Style<T, ContainerShape>
  /**
   * Space between the children and the outline, in world units.
   * @default 16
   */
  readonly padding?: Style<T, number>
  /**
   * Fill color.
   * @default --graph-group-fill
   */
  readonly fill?: Style<T, string>
  /**
   * Outline color.
   * @default --graph-group-line
   */
  readonly stroke?: Style<T, string>
  /**
   * Outline width, in screen pixels.
   * @default 1
   */
  readonly strokeWidth?: Style<T, number>
}

/**
 * Options of `edges()`. Channels go through a scale; styles are final values. `N` is the type of
 * `name`.
 */
export interface EdgeOptions<T, N extends MarkName = MarkName> {
  /**
   * Name of the mark, reported as `mark` by the targets of its edges. Compare it in event handlers
   * to tell marks apart and narrow `datum` to the items of one mark.
   */
  readonly name?: N
  /**
   * Edge key, unique across edge marks. Required for an iterable whose items have no `id` field.
   * @default 'id'
   */
  readonly key?: KeyChannel<T>
  /** Key of the source node. The edge waits until both of its ends exist. */
  readonly source: KeyChannel<T>
  /** Key of the target node. */
  readonly target: KeyChannel<T>
  /**
   * Value passed to the `color` scale: a category or a number.
   * @default --graph-edge
   */
  readonly color?: Channel<T, string | number | boolean>
  /**
   * Value passed to the `width` scale, in screen pixels.
   * @default 1.5
   */
  readonly width?: Channel<T, number>
  /** Label text, or the text with its style. */
  readonly label?: Channel<T, string> | EdgeLabelOptions<T>
  /**
   * Line pattern: `'solid'`, `'dashed'` or `'dotted'`.
   * @default 'solid'
   */
  readonly dash?: Style<T, EdgeDash>
  /**
   * Ends that carry an arrow head: `'none'`, `'source'`, `'target'` or `'both'`.
   * @default 'none'
   */
  readonly arrow?: Style<T, EdgeArrow>
  /** Line color. Wins over `color`. */
  readonly stroke?: Style<T, string>
  /**
   * Opacity from 0 to 1.
   * @default 1
   */
  readonly opacity?: Style<T, number>
  /**
   * Look of the edges drawn in place of the edges of this mark that end in a folded group, one per
   * pair of visible ends and direction.
   */
  readonly aggregate?: AggregateEdgeOptions<T>
}

/**
 * Edges of one mark drawn as a single edge because an end lies in a folded group: the datum of the
 * `aggregate` channels and styles, and of a picked aggregated edge.
 */
export interface AggregateEdge<T = unknown> {
  /** Key of the visible node or folded group the merged edges start from. */
  readonly source: Key
  /** Key of the visible node or folded group the merged edges end at. */
  readonly target: Key
  /** Number of merged edges. */
  readonly count: number
  /** Keys of the merged edges. */
  readonly keys: readonly Key[]
  /** Data of the merged edges, in the order of `keys`. */
  readonly data: readonly T[]
}

/**
 * Options of the `aggregate` option of `edges()`: channels and styles read from an `AggregateEdge`.
 * Without them, an aggregated edge looks like its first merged edge, and keeps its label only when
 * it merges one edge.
 */
export type AggregateEdgeOptions<T> = Omit<
  EdgeOptions<AggregateEdge<T>>,
  'name' | 'key' | 'source' | 'target' | 'aggregate'
>

/** A layer of the graph, made by `nodes()` or `edges()`. Marks draw in the order given. */
export interface Mark {
  /** Kind of element the mark draws. */
  readonly type: 'nodes' | 'edges'
}

/** A mark that draws one node per item of its data. `N` is the type of its `name`. */
export interface NodeMark<T, N extends MarkName = MarkName> extends Mark {
  readonly type: 'nodes'
  /** Name given in the options, or `undefined`. */
  readonly name: N
  /** Items of the mark. */
  readonly data: GraphData<T>
  /** Options given to `nodes()`. */
  readonly options: NodeOptions<T, N>
}

/** A mark that draws one edge per item of its data. `N` is the type of its `name`. */
export interface EdgeMark<T, N extends MarkName = MarkName> extends Mark {
  readonly type: 'edges'
  /** Name given in the options, or `undefined`. */
  readonly name: N
  /** Items of the mark. */
  readonly data: GraphData<T>
  /** Options given to `edges()`. */
  readonly options: EdgeOptions<T, N>
}

/**
 * Union of the item types of the node marks among `M`, a union of marks. `unknown` when `M` is the
 * plain `Mark` type.
 */
export type NodeDatum<M extends Mark> =
  M extends NodeMark<infer T, MarkName> ? T : M extends { readonly type: 'edges' } ? never : unknown

/**
 * Union of the item types of the edge marks among `M`, a union of marks. `unknown` when `M` is the
 * plain `Mark` type.
 */
export type EdgeDatum<M extends Mark> =
  M extends EdgeMark<infer T, MarkName> ? T : M extends { readonly type: 'nodes' } ? never : unknown

/**
 * Turns `color` channel values into CSS colors: a function, a categorical scale (the default) or
 * a sequential scale.
 */
export type ColorScale =
  | ((value: unknown) => string)
  | {
      /** Gives each category a color, in order of appearance, cycling through the range. */
      readonly type?: 'categorical'
      /** Categories that take the first colors, in this order. Others follow as they appear. */
      readonly domain?: readonly unknown[]
      /** CSS colors. Defaults to `--graph-cat-1` to `--graph-cat-8`. */
      readonly range?: readonly string[]
    }
  | {
      /** Interpolates colors along a numeric domain, in steps of one percent. */
      readonly type: 'sequential'
      /** Values at both ends, outside which values are clamped. Defaults to the data extent. */
      readonly domain?: readonly [number, number]
      /** Color stops, spread evenly. Defaults to `--graph-cat-5` then `--graph-cat-1`. */
      readonly range?: readonly string[]
    }

/** Interpolation of a number scale. `'sqrt'` makes the area of a node follow its value. */
export type NumberScaleType = 'linear' | 'sqrt'

/** Turns `size` or `width` channel values into numbers: a function, a linear or a root scale. */
export type NumberScale =
  | ((value: number) => number)
  | {
      /** Interpolation: `'sqrt'` for `size` and `'linear'` for `width` by default. */
      readonly type?: NumberScaleType
      /** Values at both ends, outside which values are clamped. Defaults to the data extent. */
      readonly domain?: readonly [number, number]
      /** Output at both ends: `[8, 32]` for `size` and `[1, 6]` for `width` by default. */
      readonly range?: readonly [number, number]
    }

/** The three scales, shared by every mark of a definition. */
export interface ScalesOptions {
  /** Scale of the `color` channel of nodes and edges. Categorical by default. */
  readonly color?: ColorScale
  /**
   * Scale of the node `size` channel, a diameter. Square root from the data extent to `[8, 32]` by
   * default.
   */
  readonly size?: NumberScale
  /**
   * Scale of the edge `width` channel, in screen pixels. Linear from the data extent to `[1, 6]` by
   * default.
   */
  readonly width?: NumberScale
}

/**
 * Style of a state. A property left out keeps the value of the element, or of the next state that
 * sets it.
 */
export interface StateStyle {
  /** Multiplies the opacity of the element. */
  readonly opacity?: number
  /** Fill color of a node. */
  readonly fill?: string
  /** Inner contour color of a node, line color of an edge. */
  readonly stroke?: string
  /** Inner contour width of a node, line width of an edge, in screen pixels. */
  readonly strokeWidth?: number
  /** Color of a ring outside a node, 2 pixels wide without `outlineWidth`. Nodes only. */
  readonly outline?: string
  /** Width of the ring outside a node, in screen pixels. Nodes only. */
  readonly outlineWidth?: number
  /** Draws the soft `--graph-halo` glow behind the element. */
  readonly halo?: boolean
  /** Shows or hides the label while the state applies. */
  readonly label?: boolean
  /** Color of the main text of the label, for nodes and edges. */
  readonly labelColor?: string
}

/** How clicks select: one element, several with a modifier key, or nothing. */
export type SelectMode = 'single' | 'multiple' | false

/** What the user can do with the pointer and the keyboard. */
export interface InteractionOptions {
  /**
   * Drag the background to move the view.
   * @default true
   */
  readonly pan?: boolean
  /**
   * Wheel and pinch zoom. `{ speed }` multiplies the wheel zoom speed, 1 by default.
   * @default true
   */
  readonly zoom?: boolean | { readonly speed?: number }
  /**
   * Selection mode, `false` for none. In `'multiple'` mode, Shift, Cmd or Ctrl adds to the
   * selection.
   * @default 'multiple'
   */
  readonly select?: SelectMode
  /**
   * Drag nodes. Dragging a selected node moves the whole selection.
   * @default true
   */
  readonly drag?: boolean
  /**
   * Shift and drag from the background draws a lasso that adds the nodes inside to the selection.
   * Needs `select: 'multiple'`.
   * @default false
   */
  readonly lasso?: boolean
  /**
   * Focus, select and move the view from the keyboard. The graph element becomes focusable.
   * @default true
   */
  readonly keyboard?: boolean
  /**
   * Double-click on a group, or Enter on a focused group, folds or unfolds it.
   * @default true
   */
  readonly fold?: boolean
}

/** Interaction options with every default applied, as `defineGraph` resolves them. */
export interface ResolvedInteraction {
  /** Whether dragging the background moves the view. */
  readonly pan: boolean
  /** `false`, or the wheel zoom speed. */
  readonly zoom: false | { readonly speed: number }
  /** Selection mode. */
  readonly select: SelectMode
  /** Whether nodes can be dragged. */
  readonly drag: boolean
  /** Whether Shift and drag draws a lasso. */
  readonly lasso: boolean
  /** Whether the keyboard drives the graph. */
  readonly keyboard: boolean
  /** Whether double-click and Enter fold and unfold groups. */
  readonly fold: boolean
}

/** Durations of animated moves, in milliseconds. Negative values count as 0. */
export interface TransitionOptions {
  /**
   * Moves of nodes whose `x` or `y` changes in the data.
   * @default 120
   */
  readonly positions?: number
  /**
   * Glide of nodes to a layout result reported at once.
   * @default 400
   */
  readonly layout?: number
}

/** Transition durations in milliseconds, with every default applied. */
export interface ResolvedTransitions {
  /** Moves of nodes whose `x` or `y` changes in the data. */
  readonly positions: number
  /** Glide of nodes to a layout result reported at once. */
  readonly layout: number
}

/** Names of the states every graph has. Declare one in `states` to change its style. */
export type BuiltInState = 'selected' | 'hovered' | 'focused'

/** State names of `S` that are not built in: the states you fill from code. */
export type FreeState<S extends string> = Exclude<S, BuiltInState>

/** Style of each state, by name. */
export type StateStyles<S extends string> = { readonly [K in S]: StateStyle }

/**
 * What a layout reads: copies of the graph in typed arrays, indexed by the internal index of each
 * node. `T` is the type of the items of the nodes.
 */
export interface LayoutGraph<T = unknown> {
  /** Length of the per-node arrays. */
  readonly capacity: number
  /** `1` for a node that exists, `0` for a free slot. */
  readonly alive: Uint8Array
  /** `1` for a node the layout may move. */
  readonly movable: Uint8Array
  /** Current positions in world units, `x` then `y` for each index. */
  readonly xy: Float32Array
  /** Radius of each node, in world units. */
  readonly radius: Float32Array
  /** Pairs of node indices, one pair per edge, loops left out. */
  readonly edges: Uint32Array
  /**
   * Pairs of node indices that share an unfolded group, for layouts that keep groups together: each
   * member is paired with one other member of its group.
   */
  readonly groupLinks?: Uint32Array
  /** Key of each node, `undefined` for a free slot. */
  readonly keys: readonly (Key | undefined)[]
  /** Item a node comes from, as given to `nodes()`. `undefined` for a free slot. */
  datum(index: number): T | undefined
}

/** Receives the positions a layout computes. Every array holds `capacity × 2` numbers. */
export interface LayoutListener {
  /** Reports intermediate positions, and the progress from 0 to 1. */
  progress(xy: Float32Array, progress: number): void
  /** Reports the final positions, once. Without a `progress` before it, nodes glide there. */
  end(xy: Float32Array): void
}

/** A layout run in progress, as `Layout.start` returns it. */
export interface LayoutRun {
  /** Called when a node is dragged or set during the run: keep it at this position. */
  pin(index: number, x: number, y: number): void
  /** Called when the run is stopped or replaced. Do not call the listener after it. */
  stop(): void
}

/**
 * Places the nodes that have no `x` and `y`. Any object of this shape works, such as the result
 * of `force()` or `grid()`. `T` is the type of the items of the nodes it reads.
 */
export interface Layout<T = unknown> {
  /**
   * Name reported by layout events. With `options`, decides whether a new definition lays out
   * again.
   */
  readonly name: string
  /** Settings, compared one by one with those of the previous definition. */
  readonly options: object
  /**
   * `false` lays out every free node again when nodes arrive. Otherwise only the new nodes run.
   * @default true
   */
  readonly incremental?: boolean
  /** Starts a run. Nodes that are not movable must keep their place in every array it reports. */
  start(graph: LayoutGraph<T>, listener: LayoutListener): LayoutRun
}

/**
 * Options of `defineGraph`. `S` is the union of the state names and `M` the union of the marks,
 * both inferred.
 */
export interface GraphDefinitionOptions<S extends string = string, M extends Mark = Mark> {
  /**
   * Results of `nodes()` and `edges()`, drawn in this order. Their item types and names type the
   * targets of events and of the state.
   */
  readonly marks: readonly M[]
  /** `color`, `size` and `width` scales, shared by every mark. */
  readonly scales?: ScalesOptions
  /** Free states, and overrides of `selected`, `hovered` and `focused`. At most 29 free states. */
  readonly states?: StateStyles<S>
  /**
   * Places nodes that have no `x` and `y`, at the first data and when nodes arrive.
   * @default null
   */
  readonly layout?: Layout<NodeDatum<M>> | null
  /** Pan, zoom, selection, drag, lasso and keyboard. */
  readonly interaction?: InteractionOptions
  /** Durations of animated node moves. */
  readonly transitions?: TransitionOptions
  /**
   * Grid drawn under everything, which follows the view and adapts its spacing to the zoom.
   * @default null
   */
  readonly background?: BackgroundOptions | null
  /** Results of `hull()`: shapes around sets of nodes, drawn under edges and nodes, in order. */
  readonly hulls?: readonly Hull<NoInfer<S> | BuiltInState>[]
}

/**
 * A frozen graph definition, made by `defineGraph`, with every option resolved. `S` is the union of
 * the state names and `M` the union of the marks.
 */
export interface GraphDefinition<S extends string = string, M extends Mark = Mark> {
  /** Marks, drawn in this order. */
  readonly marks: readonly M[]
  /** Scales shared by every mark. */
  readonly scales: ScalesOptions
  /** Style of each declared state. */
  readonly states: StateStyles<S>
  /** Layout of the graph, or `null` for none. */
  readonly layout: Layout<NodeDatum<M>> | null
  /** Interaction options, defaults applied. */
  readonly interaction: ResolvedInteraction
  /** Transition durations in milliseconds, defaults applied. */
  readonly transitions: ResolvedTransitions
  /** Grid drawn under the graph, or `null` for none. */
  readonly background: ResolvedBackground | null
  /** Hulls drawn under edges and nodes. */
  readonly hulls: readonly Hull[]
}

/** Pattern of the background grid: `'lines'`, or `'dots'` where the lines would cross. */
export type BackgroundGrid = 'lines' | 'dots'

/**
 * Options of the `background` of `defineGraph`. Lines fall on world multiples of `spacing` times
 * a power of 4 chosen from the zoom: the finest lines fade in as they grow from 4 to 16 pixels
 * apart, and every fourth line takes `majorColor`.
 */
export interface BackgroundOptions {
  /** Draws `'lines'` or `'dots'`. */
  readonly grid: BackgroundGrid
  /**
   * Distance between lines in world units, before the zoom picks a power of 4 of it.
   * @default 16
   */
  readonly spacing?: number
  /**
   * Color of the grid, any CSS color.
   * @default 'var(--graph-grid)'
   */
  readonly color?: string
  /**
   * Color of every fourth line, where the next coarser level of the grid falls.
   * @default 'var(--graph-grid-major)'
   */
  readonly majorColor?: string
}

/** Background grid with every default applied, as `defineGraph` resolves it. */
export interface ResolvedBackground {
  /** `'lines'` or `'dots'`. */
  readonly grid: BackgroundGrid
  /** Distance between lines in world units, before the zoom picks a power of 4 of it. */
  readonly spacing: number
  /** Color of the grid. */
  readonly color: string
  /** Color of every fourth line. */
  readonly majorColor: string
}

/**
 * Outline of a hull: `'rounded'` follows the convex hull of the nodes with round corners,
 * `'smooth'` also bends the sides outward into arcs.
 */
export type HullShape = 'rounded' | 'smooth'

/** Drawing options shared by every hull. `C` is the type of a color option. */
export interface HullStyle<C> {
  /**
   * Outline shape, `'rounded'` or `'smooth'`.
   * @default 'rounded'
   */
  readonly shape?: HullShape
  /**
   * Space between the outline and the edge of the nodes, in screen pixels.
   * @default 16
   */
  readonly padding?: number
  /**
   * Color of the outline, also used at 12% for the fill. Without it, the hull takes
   * `--graph-group-fill` and `--graph-group-line`.
   */
  readonly color?: C
  /** Fill color. Defaults to `color` at 12%, or to `var(--graph-group-fill)`. */
  readonly fill?: C
  /** Outline color. Defaults to `color`, or to `var(--graph-group-line)`. */
  readonly stroke?: C
  /**
   * Width of the outline in screen pixels, `0` for none.
   * @default 1
   */
  readonly strokeWidth?: number
}

/** Options of `hull()` around a list of keys. Keys of missing nodes are skipped. */
export interface HullKeysOptions extends HullStyle<string> {
  /** Keys of the nodes to enclose. */
  readonly nodes: Iterable<Key>
}

/** Options of `hull()` around the nodes in a state, updated when the state changes. */
export interface HullStateOptions<N extends string> extends HullStyle<string> {
  /** A free state of the definition, or `'selected'`, `'hovered'` or `'focused'`. */
  readonly state: N
}

/** Options of `hull()` around every node of a mark. */
export interface HullMarkOptions<T> extends HullStyle<string> {
  /** The mark whose nodes are enclosed, as passed to `marks`. */
  readonly nodes: NodeMark<T>
  /** Leave out to draw a single hull. */
  readonly by?: undefined
}

/** Options of `hull()` with one hull per value of a channel. */
export interface HullGroupOptions<T> extends HullStyle<Style<Key, string>> {
  /** The mark whose nodes are grouped, as passed to `marks`. */
  readonly nodes: NodeMark<T>
  /**
   * Field or function giving the group of a node. Nodes without a value are left out, and color
   * functions receive the value.
   */
  readonly by: Channel<T, Key>
}

/** Options of `hull()`, in any of its four forms. */
export type HullOptions<T = unknown, N extends string = string> =
  | HullKeysOptions
  | HullStateOptions<N>
  | HullMarkOptions<T>
  | HullGroupOptions<T>

/** A hull definition, made by `hull()` and passed to `hulls`. `N` is the state it follows. */
export interface Hull<N extends string = string> {
  /** Always `'hull'`. */
  readonly type: 'hull'
  /** The state the hull follows, or `null`. */
  readonly state: N | null
  /** The options given to `hull()`. */
  readonly options: HullOptions<unknown, string>
}
