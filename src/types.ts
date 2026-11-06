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

export interface LabelOptions<T> {
  readonly text: Channel<T, string>
  readonly secondary?: Channel<T, string>
}

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
  readonly label?: Channel<T, string>
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
  readonly halo?: boolean
  readonly label?: boolean
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
}

export interface ResolvedTransitions {
  readonly positions: number
}

export type BuiltInState = 'selected' | 'hovered' | 'focused'

export type FreeState<S extends string> = Exclude<S, BuiltInState>

export type StateStyles<S extends string> = { readonly [K in S]: StateStyle }

export interface GraphDefinitionOptions<S extends string = string> {
  readonly marks: readonly Mark[]
  readonly scales?: ScalesOptions
  readonly states?: StateStyles<S>
  readonly interaction?: InteractionOptions
  readonly transitions?: TransitionOptions
}

export interface GraphDefinition<S extends string = string> {
  readonly marks: readonly Mark[]
  readonly scales: ScalesOptions
  readonly states: StateStyles<S>
  readonly interaction: ResolvedInteraction
  readonly transitions: ResolvedTransitions
}
