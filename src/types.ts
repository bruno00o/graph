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
  /** Key of the group node that contains this node; `null` or absent for a top-level node. */
  readonly parent?: Channel<T, Key>
  /** Look of the node while it is an unfolded group drawn as a container behind its children. */
  readonly container?: ContainerOptions<T>
}

/** Outline of an unfolded group. */
export type ContainerShape = 'rectangle' | 'circle'

/** Look of a group node while it is unfolded. */
export interface ContainerOptions<T> {
  /** Outline drawn around the children. @default 'rectangle' */
  readonly shape?: Style<T, ContainerShape>
  /** Space between the children and the outline, in world units. @default 16 */
  readonly padding?: Style<T, number>
  /** Fill color. @default 'var(--graph-group-fill)' */
  readonly fill?: Style<T, string>
  /** Outline color. @default 'var(--graph-group-line)' */
  readonly stroke?: Style<T, string>
  /** Outline width in screen pixels. @default 1 */
  readonly strokeWidth?: Style<T, number>
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
  /** Look of the edges that stand for several edges of this mark between folded groups. */
  readonly aggregate?: AggregateEdgeOptions<T>
}

/** Edges of one mark merged into a single drawn edge because an end lies in a folded group. */
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
 * Channels and styles of an aggregated edge, read from its {@link AggregateEdge}. Without them, an
 * aggregated edge looks like its first merged edge, and keeps its label only when it merges one edge.
 */
export type AggregateEdgeOptions<T> = Omit<
  EdgeOptions<AggregateEdge<T>>,
  'key' | 'source' | 'target' | 'aggregate'
>

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
  /** Double-click on a group, or Enter on a focused group, folds or unfolds it. @default true */
  readonly fold?: boolean
}

export interface ResolvedInteraction {
  readonly pan: boolean
  readonly zoom: false | { readonly speed: number }
  readonly select: SelectMode
  readonly drag: boolean
  readonly lasso: boolean
  readonly keyboard: boolean
  readonly fold: boolean
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
  /**
   * Pairs of node indices that share an unfolded group, for layouts that keep groups together: each
   * member is paired with one other member of its group.
   */
  readonly groupLinks?: Uint32Array
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
}

export interface GraphDefinition<S extends string = string> {
  readonly marks: readonly Mark[]
  readonly scales: ScalesOptions
  readonly states: StateStyles<S>
  readonly layout: Layout | null
  readonly interaction: ResolvedInteraction
  readonly transitions: ResolvedTransitions
}
