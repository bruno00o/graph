import type {
  AutoFit,
  BackgroundGrid,
  BridgeShape,
  EdgeBundling,
  EdgeDatum,
  EdgeRouting,
  GraphDefinition,
  Hull,
  Layout,
  Mark,
  NodeDatum,
  PixelRatioOption,
  ScalesOptions,
  SelectMode,
  StateStyles,
  ViewBounds,
  WheelMode,
} from './types'

export interface ResolvedLens {
  readonly radius: number
  readonly zoom: number
  readonly key: string | null
}

export interface ResolvedInteraction {
  readonly pan: boolean
  readonly zoom: false | { readonly speed: number }
  readonly wheel: WheelMode
  readonly wheelGlide: number
  readonly autoPan: false | { readonly speed: number }
  readonly select: SelectMode
  readonly drag: boolean
  readonly lasso: boolean
  readonly lassoModifier: 'Shift' | null
  readonly lassoEdges: boolean
  readonly keyboard: boolean
  readonly fold: boolean
  readonly lens: ResolvedLens
}

export interface ResolvedPadding {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

export interface ResolvedViewLimits {
  readonly minZoom: number
  readonly maxZoom: number
  readonly bounds: ViewBounds | null
  readonly padding: ResolvedPadding
  readonly autoFit: AutoFit
}

export interface ResolvedTransitions {
  readonly positions: number
  readonly layout: number
}

export interface ResolvedSpread {
  readonly gap: number
}

export interface ResolvedBridges {
  readonly shape: BridgeShape
  readonly size: number
  readonly maxEdges: number
}

export interface ResolvedDefinition<S extends string = string, M extends Mark = Mark>
  extends GraphDefinition<S, M> {
  readonly scales: ScalesOptions
  readonly states: StateStyles<S>
  readonly layout: Layout<NodeDatum<M>> | null
  readonly relayout: boolean
  readonly waitForData: number
  readonly interaction: ResolvedInteraction
  readonly view: ResolvedViewLimits
  readonly transitions: ResolvedTransitions
  readonly background: ResolvedBackground | null
  readonly hulls: readonly Hull[]
  readonly bundling: EdgeBundling<EdgeDatum<M>> | null
  readonly routing: EdgeRouting<EdgeDatum<M>> | null
  readonly bridges: ResolvedBridges | null
  readonly spread: ResolvedSpread | null
  readonly time: ResolvedTimeOptions
  readonly support: ResolvedSupportStates | null
  readonly pixelRatio: PixelRatioOption
}

export interface ResolvedTimeOptions {
  readonly fade: number
}

export interface ResolvedBackground {
  readonly grid: BackgroundGrid
  readonly spacing: number
  readonly color: string
  readonly majorColor: string
  readonly adaptive: boolean
}

export interface ResolvedSupportStates {
  readonly carriers: string | null
  readonly carried: string | null
}

export function resolvedOf<S extends string, M extends Mark>(
  definition: GraphDefinition<S, M>,
): ResolvedDefinition<S, M> {
  return definition as ResolvedDefinition<S, M>
}
