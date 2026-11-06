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

/** Options of `nodes()`. Channels go through a scale; styles are final values. */
export interface NodeOptions<T> {
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
}

/** Options of `edges()`. Channels go through a scale; styles are final values. */
export interface EdgeOptions<T> {
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
}

/** A layer of the graph, made by `nodes()` or `edges()`. Marks draw in the order given. */
export interface Mark {
  /** Kind of element the mark draws. */
  readonly type: 'nodes' | 'edges'
}

/** A mark that draws one node per item of its data. */
export interface NodeMark<T> extends Mark {
  readonly type: 'nodes'
  /** Items of the mark. */
  readonly data: GraphData<T>
  /** Options given to `nodes()`. */
  readonly options: NodeOptions<T>
}

/** A mark that draws one edge per item of its data. */
export interface EdgeMark<T> extends Mark {
  readonly type: 'edges'
  /** Items of the mark. */
  readonly data: GraphData<T>
  /** Options given to `edges()`. */
  readonly options: EdgeOptions<T>
}

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
 * node.
 */
export interface LayoutGraph {
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
  /** Key of each node, `undefined` for a free slot. */
  readonly keys: readonly (Key | undefined)[]
  /** Item a node comes from, as given to `nodes()`. `undefined` for a free slot. */
  datum(index: number): unknown
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
 * of `force()` or `grid()`.
 */
export interface Layout {
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
  start(graph: LayoutGraph, listener: LayoutListener): LayoutRun
}

/** Options of `defineGraph`. */
export interface GraphDefinitionOptions<S extends string = string> {
  /** Results of `nodes()` and `edges()`, drawn in this order. */
  readonly marks: readonly Mark[]
  /** `color`, `size` and `width` scales, shared by every mark. */
  readonly scales?: ScalesOptions
  /** Free states, and overrides of `selected`, `hovered` and `focused`. At most 29 free states. */
  readonly states?: StateStyles<S>
  /**
   * Places nodes that have no `x` and `y`, at the first data and when nodes arrive.
   * @default null
   */
  readonly layout?: Layout | null
  /** Pan, zoom, selection, drag, lasso and keyboard. */
  readonly interaction?: InteractionOptions
  /** Durations of animated node moves. */
  readonly transitions?: TransitionOptions
}

/** A frozen graph definition, made by `defineGraph`, with every option resolved. */
export interface GraphDefinition<S extends string = string> {
  /** Marks, drawn in this order. */
  readonly marks: readonly Mark[]
  /** Scales shared by every mark. */
  readonly scales: ScalesOptions
  /** Style of each declared state. */
  readonly states: StateStyles<S>
  /** Layout of the graph, or `null` for none. */
  readonly layout: Layout | null
  /** Interaction options, defaults applied. */
  readonly interaction: ResolvedInteraction
  /** Transition durations in milliseconds, defaults applied. */
  readonly transitions: ResolvedTransitions
}
