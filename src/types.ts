export type Key = string | number

export interface Point {
  readonly x: number
  readonly y: number
}

export interface View {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

export type Accessor<T, V> = (datum: T) => V

export type FieldOf<T, V> = {
  [K in keyof T]-?: T[K] extends V | null | undefined ? K : never
}[keyof T] &
  string

export type KeyFieldOf<T> = {
  [K in keyof T]-?: T[K] extends Key ? (Partial<Pick<T, K>> extends Pick<T, K> ? never : K) : never
}[keyof T] &
  string

export type Channel<T, V> = FieldOf<T, V> | Accessor<T, V | null | undefined>

export type KeyChannel<T> = KeyFieldOf<T> | Accessor<T, Key>

export type Style<T, V> = V | Accessor<T, V>

export interface SourceChange<T> {
  readonly type: 'insert' | 'update' | 'delete'
  readonly key: Key
  readonly value: T
}

export interface SourceSubscription {
  unsubscribe(): void
}

export interface LiveSource<T> {
  subscribeChanges(
    callback: (changes: ReadonlyArray<SourceChange<T>>) => void,
    options?: { includeInitialState?: boolean },
  ): SourceSubscription
}

export type GraphData<T> = Iterable<T> | LiveSource<T>

export type NodeShape = 'circle' | 'square' | 'diamond'

export type EdgeDash = 'solid' | 'dashed' | 'dotted'

export type EdgeArrow = 'none' | 'source' | 'target' | 'both'

export type BadgeCorner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

export type LabelPlacement = 'bottom' | 'top' | 'right' | 'left' | 'center'

export type LabelWeight = 'normal' | 'bold' | number

export interface Badge {
  readonly text?: string | number
  readonly fill?: string
  readonly color?: string
}

export interface NodeImage {
  readonly src: string
  readonly scale?: number
  readonly color?: string
}

export interface LabelTextOptions<T> {
  readonly text: Channel<T, string>
  readonly background?: Style<T, string | boolean | null>
  readonly color?: Style<T, string>
  readonly size?: Style<T, number>
  readonly weight?: Style<T, LabelWeight>
  readonly font?: Style<T, string>
  readonly maxWidth?: Style<T, number>
}

export interface LabelOptions<T> extends LabelTextOptions<T> {
  readonly secondary?: Channel<T, string>
  readonly placement?: Style<T, LabelPlacement>
  readonly minScreenSize?: Style<T, number>
}

export interface EdgeLabelOptions<T> extends LabelTextOptions<T> {}

export interface NodeOptions<T> {
  readonly key?: KeyChannel<T>
  readonly color?: Channel<T, string | number | boolean>
  readonly size?: Channel<T, number>
  readonly label?: Channel<T, string> | LabelOptions<T>
  readonly x?: Channel<T, number>
  readonly y?: Channel<T, number>
  readonly shape?: Style<T, NodeShape>
  readonly fill?: Style<T, string>
  readonly stroke?: Style<T, string>
  readonly strokeWidth?: Style<T, number>
  readonly outline?: Style<T, string | null>
  readonly outlineWidth?: Style<T, number>
  readonly opacity?: Style<T, number>
  readonly image?: Style<T, string | NodeImage | null>
  readonly badges?: Readonly<Partial<Record<BadgeCorner, Accessor<T, Badge | null | undefined>>>>
  readonly units?: 'world' | 'screen'
}

export interface EdgeOptions<T> {
  readonly key?: KeyChannel<T>
  readonly source: KeyChannel<T>
  readonly target: KeyChannel<T>
  readonly color?: Channel<T, string | number | boolean>
  readonly width?: Channel<T, number>
  readonly label?: Channel<T, string> | EdgeLabelOptions<T>
  readonly dash?: Style<T, EdgeDash>
  readonly arrow?: Style<T, EdgeArrow>
  readonly stroke?: Style<T, string>
  readonly opacity?: Style<T, number>
}

export interface Mark {
  readonly type: 'nodes' | 'edges'
}

export interface NodeMark<T> extends Mark {
  readonly type: 'nodes'
  readonly data: GraphData<T>
  readonly options: NodeOptions<T>
}

export interface EdgeMark<T> extends Mark {
  readonly type: 'edges'
  readonly data: GraphData<T>
  readonly options: EdgeOptions<T>
}

export type ColorScale =
  | ((value: unknown) => string)
  | {
      readonly type?: 'categorical'
      readonly domain?: readonly unknown[]
      readonly range?: readonly string[]
    }
  | {
      readonly type: 'sequential'
      readonly domain?: readonly [number, number]
      readonly range?: readonly string[]
    }

export type NumberScaleType = 'linear' | 'sqrt'

export type NumberScale =
  | ((value: number) => number)
  | {
      readonly type?: NumberScaleType
      readonly domain?: readonly [number, number]
      readonly range?: readonly [number, number]
    }

export interface ScalesOptions {
  readonly color?: ColorScale
  readonly size?: NumberScale
  readonly width?: NumberScale
}

export interface StateStyle {
  readonly opacity?: number
  readonly fill?: string
  readonly stroke?: string
  readonly strokeWidth?: number
  readonly outline?: string
  readonly outlineWidth?: number
  readonly halo?: boolean
  readonly label?: boolean
  readonly labelColor?: string
}

export type SelectMode = 'single' | 'multiple' | false

export interface InteractionOptions {
  readonly pan?: boolean
  readonly zoom?: boolean | { readonly speed?: number }
  readonly select?: SelectMode
  readonly drag?: boolean
  readonly lasso?: boolean
  readonly keyboard?: boolean
}

export interface ResolvedInteraction {
  readonly pan: boolean
  readonly zoom: false | { readonly speed: number }
  readonly select: SelectMode
  readonly drag: boolean
  readonly lasso: boolean
  readonly keyboard: boolean
}

export interface TransitionOptions {
  readonly positions?: number
  readonly layout?: number
}

export interface ResolvedTransitions {
  readonly positions: number
  readonly layout: number
}

export type BuiltInState = 'selected' | 'hovered' | 'focused'

export type FreeState<S extends string> = Exclude<S, BuiltInState>

export type StateStyles<S extends string> = { readonly [K in S]: StateStyle }

export interface LayoutGraph {
  readonly capacity: number
  readonly alive: Uint8Array
  readonly movable: Uint8Array
  readonly xy: Float32Array
  readonly radius: Float32Array
  readonly edges: Uint32Array
  readonly keys: readonly (Key | undefined)[]
  datum(index: number): unknown
}

export interface LayoutListener {
  progress(xy: Float32Array, progress: number): void
  end(xy: Float32Array): void
}

export interface LayoutRun {
  pin(index: number, x: number, y: number): void
  stop(): void
}

export interface Layout {
  readonly name: string
  readonly options: object
  readonly incremental?: boolean
  start(graph: LayoutGraph, listener: LayoutListener): LayoutRun
}

export interface GraphDefinitionOptions<S extends string = string> {
  readonly marks: readonly Mark[]
  readonly scales?: ScalesOptions
  readonly states?: StateStyles<S>
  readonly layout?: Layout | null
  readonly interaction?: InteractionOptions
  readonly transitions?: TransitionOptions
  /** Grid drawn under the graph. */
  readonly background?: BackgroundOptions | null
  /** Shapes drawn under edges and nodes around sets of nodes, in this order. */
  readonly hulls?: readonly Hull<NoInfer<S> | BuiltInState>[]
}

export interface GraphDefinition<S extends string = string> {
  readonly marks: readonly Mark[]
  readonly scales: ScalesOptions
  readonly states: StateStyles<S>
  readonly layout: Layout | null
  readonly interaction: ResolvedInteraction
  readonly transitions: ResolvedTransitions
  /** Grid drawn under the graph, or `null` for none. */
  readonly background: ResolvedBackground | null
  /** Hulls drawn under edges and nodes. */
  readonly hulls: readonly Hull[]
}

/** Pattern of the background grid: thin lines, or dots where lines would cross. */
export type BackgroundGrid = 'lines' | 'dots'

/** Background grid options. Lines fall on world multiples of `spacing` times a power of 4 chosen from the zoom: the finest lines fade in as they grow from 4 to 16 pixels apart, and every fourth line takes `majorColor`. */
export interface BackgroundOptions {
  /** Draws lines or dots. */
  readonly grid: BackgroundGrid
  /** Distance between lines in world units, before the zoom picks a power of 4 of it. @default 16 */
  readonly spacing?: number
  /** Color of the grid, any CSS color. @default 'var(--graph-grid)' */
  readonly color?: string
  /** Color of every fourth line, where the next coarser level of the grid falls. @default 'var(--graph-grid-major)' */
  readonly majorColor?: string
}

/** Background grid with its defaults applied. */
export interface ResolvedBackground {
  readonly grid: BackgroundGrid
  readonly spacing: number
  readonly color: string
  readonly majorColor: string
}

/** Outline of a hull: `rounded` follows the convex hull of the nodes with round corners, `smooth` also bends the sides into curves. */
export type HullShape = 'rounded' | 'smooth'

/** Drawing options of a hull. `C` is the type of a color option. */
export interface HullStyle<C> {
  /** Outline shape. @default 'rounded' */
  readonly shape?: HullShape
  /** Space between the outline and the edge of the nodes, in screen pixels. @default 16 */
  readonly padding?: number
  /** Color of the outline, also used at 12% for the fill. Without it, the hull takes `--graph-group-fill` and `--graph-group-line`. */
  readonly color?: C
  /** Fill color. Defaults to `color` at 12%, or `var(--graph-group-fill)`. */
  readonly fill?: C
  /** Outline color. Defaults to `color`, or `var(--graph-group-line)`. */
  readonly stroke?: C
  /** Width of the outline in screen pixels, `0` for none. @default 1 */
  readonly strokeWidth?: number
}

/** A hull around the nodes of a list of keys. Keys of missing nodes are skipped. */
export interface HullKeysOptions extends HullStyle<string> {
  /** Keys of the nodes to enclose. */
  readonly nodes: Iterable<Key>
}

/** A hull around the nodes in a state, updated when the state changes. */
export interface HullStateOptions<N extends string> extends HullStyle<string> {
  /** A free state of the definition, or `selected`, `hovered` or `focused`. */
  readonly state: N
}

/** A hull around every node of a mark. */
export interface HullMarkOptions<T> extends HullStyle<string> {
  /** The mark whose nodes are enclosed, as passed to `marks`. */
  readonly nodes: NodeMark<T>
  readonly by?: undefined
}

/** One hull per value of a channel, around the nodes of a mark that share it. */
export interface HullGroupOptions<T> extends HullStyle<Style<Key, string>> {
  /** The mark whose nodes are grouped, as passed to `marks`. */
  readonly nodes: NodeMark<T>
  /** Field or function giving the group of a node. Nodes without a value are left out. Color functions receive this value. */
  readonly by: Channel<T, Key>
}

/** Options of any hull. */
export type HullOptions<T = unknown, N extends string = string> =
  | HullKeysOptions
  | HullStateOptions<N>
  | HullMarkOptions<T>
  | HullGroupOptions<T>

/** A hull definition, made by `hull()` and passed to `hulls`. `N` is the state it follows, if any. */
export interface Hull<N extends string = string> {
  readonly type: 'hull'
  /** The state the hull follows, or `null`. */
  readonly state: N | null
  readonly options: HullOptions<unknown, string>
}
