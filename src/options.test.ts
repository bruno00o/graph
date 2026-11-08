import { describe, expectTypeOf, it } from 'vitest'
import type { DensityBundlingOptions } from './bundling'
import type { CypherOptions } from './cypher'
import type { PersistPositionsOptions } from './db'
import type {
  GraphDevtoolsOptions,
  GraphDevtoolsPluginOptions,
  GraphDevtoolsProps,
} from './devtools'
import type { GraphDevtoolsPanelProps } from './devtools/react'
import type { ExportOptions, PngExportOptions, SvgExportOptions } from './export'
import type {
  AttributeDeclaration,
  CsvReadOptions,
  CsvTables,
  CsvTypes,
  CsvWriteOptions,
  EdgeFields,
  GexfWriteOptions,
  GraphInfoInput,
  GraphInput,
  JsonGraphReadOptions,
  JsonGraphWriteOptions,
  NodeFields,
  ReadOptions,
  SchemaInput,
  WriteOptions,
} from './formats'
import type {
  AggregateEdgeOptions,
  AnchorEdgeTarget,
  AnchorNodesTarget,
  AnchorNodeTarget,
  AnchorOptions,
  AnchorPlacement,
  AnchorPointTarget,
  AnchorStateTarget,
  AnchorTarget,
  BackgroundOptions,
  Badge,
  BridgeOptions,
  ColorScale,
  ContainerOptions,
  EdgeEndOptions,
  EdgeEndsOptions,
  EdgeLabelOptions,
  EdgeMark,
  EdgeMergeOptions,
  EdgeOptions,
  EdgeScalesOptions,
  EdgeTarget,
  ElementKeysInput,
  FitOptions,
  FitPadding,
  GraphDefinitionOptions,
  GraphEventOptions,
  GroupOptions,
  HullGroupOptions,
  HullKeysOptions,
  HullMarkOptions,
  HullOptions,
  HullStateOptions,
  HullStyle,
  InteractionOptions,
  LabelOptions,
  LabelTextOptions,
  Layout,
  LayoutRunOptions,
  LensInput,
  LensOptions,
  MountGraphOptions,
  NodeImage,
  NodeMark,
  NodeOptions,
  NodeScalesOptions,
  NumberScale,
  PathOptions,
  PositionSnapshotOptions,
  ReachOptions,
  ScalesOptions,
  StateKindStyles,
  StateLook,
  StateStyle,
  SupportStateOptions,
  SupportWalkOptions,
  TimeOptions,
  TimeSpan,
  TimeValue,
  TimeWindowInput,
  TransitionOptions,
  ViewLimitOptions,
  ViewOptions,
} from './index'
import type { GridOptions, LayersOptions, RadialOptions, RingsOptions } from './layouts'
import type { ForceOptions } from './layouts/force'
import type { LegendOptions, LegendViewOptions } from './legend'
import type { MapGraphOptions, MapPngOptions } from './map'
import type { MapGraphProps } from './map/react'
import type { MinimapOptions } from './minimap'
import type { ExplorationOptions } from './query'
import type {
  AnchorProps,
  GraphEventProps,
  GraphProps,
  LegendProps,
  MinimapProps,
  TimelineProps,
  UseGraphStateOptions,
  UseLegendOptions,
  UseTimelineOptions,
} from './react'
import type { OrthogonalRoutingOptions } from './routing'
import type { TimelineLabels, TimelineOptions, TimelineViewOptions } from './timeline'

interface Item {
  readonly id: string
  readonly group: string
  readonly parent: string | null
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

type Marks = NodeMark<Item, 'items'> | EdgeMark<Link, 'links'>

type OptionalKeys<T> = {
  [K in keyof T]-?: Partial<Pick<T, K>> extends Pick<T, K> ? K : never
}[keyof T]

type Refused<T> = T extends object
  ? {
      [K in OptionalKeys<T>]-?: { readonly [P in K]: undefined } extends Pick<T, K> ? never : K
    }[OptionalKeys<T>]
  : never

interface Inputs {
  AggregateEdgeOptions: AggregateEdgeOptions<Link>
  AnchorEdgeTarget: AnchorEdgeTarget<'muted'>
  AnchorNodesTarget: AnchorNodesTarget<'muted'>
  AnchorNodeTarget: AnchorNodeTarget<'muted'>
  AnchorOptions: AnchorOptions<'muted'>
  AnchorPlacement: AnchorPlacement
  AnchorPointTarget: AnchorPointTarget
  AnchorProps: AnchorProps<'muted'>
  AnchorStateTarget: AnchorStateTarget<'muted'>
  AnchorTarget: AnchorTarget<'muted'>
  AttributeDeclaration: AttributeDeclaration
  AutoPan: Exclude<InteractionOptions['autoPan'], boolean | undefined>
  BackgroundOptions: BackgroundOptions
  Badge: Badge
  Badges: NonNullable<NodeOptions<Item>['badges']>
  BridgeOptions: BridgeOptions
  ColorScale: ColorScale
  ContainerOptions: ContainerOptions<Item>
  CsvReadOptions: CsvReadOptions
  CsvTables: CsvTables
  CsvTypes: CsvTypes
  CsvWriteOptions: CsvWriteOptions<Item, Link>
  CypherOptions: CypherOptions
  DensityBundlingOptions: DensityBundlingOptions
  DevtoolsMessages: NonNullable<GraphDevtoolsOptions['messages']>
  EdgeEndOptions: EdgeEndOptions<Link>
  EdgeEndsOptions: EdgeEndsOptions<Link>
  EdgeFields: EdgeFields<Link>
  EdgeLabelOptions: EdgeLabelOptions<Link>
  EdgeMergeOptions: EdgeMergeOptions<Link>
  EdgeOptions: EdgeOptions<Link>
  EdgeScalesOptions: EdgeScalesOptions
  ElementKeysInput: ElementKeysInput
  ExplorationOptions: ExplorationOptions<Item, Link>
  ExportOptions: ExportOptions
  FitOptions: FitOptions
  FitPadding: FitPadding
  ForceOptions: ForceOptions
  GexfWriteOptions: GexfWriteOptions<Item, Link>
  GraphDefinitionOptions: GraphDefinitionOptions<'muted', Marks>
  GraphDevtoolsOptions: GraphDevtoolsOptions
  GraphDevtoolsPanelProps: GraphDevtoolsPanelProps
  GraphDevtoolsPluginOptions: GraphDevtoolsPluginOptions
  GraphDevtoolsProps: GraphDevtoolsProps
  GraphEventOptions: GraphEventOptions
  GraphEventProps: GraphEventProps<Marks>
  GraphInfoInput: GraphInfoInput
  GraphInput: GraphInput<Item, Link>
  GraphProps: GraphProps<'muted', Marks>
  GridOptions: GridOptions<Item>
  GroupOptions: GroupOptions<Item>
  HullGroupOptions: HullGroupOptions<Item>
  HullKeysOptions: HullKeysOptions
  HullMarkOptions: HullMarkOptions<Item>
  HullOptions: HullOptions<Item, 'muted'>
  HullStateOptions: HullStateOptions<'muted'>
  HullStyle: HullStyle<string>
  InteractionOptions: InteractionOptions
  JsonGraphReadOptions: JsonGraphReadOptions
  JsonGraphWriteOptions: JsonGraphWriteOptions<Item, Link>
  LabelOptions: LabelOptions<Item>
  LabelTextOptions: LabelTextOptions<Item>
  LayersOptions: LayersOptions
  Layout: Layout<Item>
  LayoutRunOptions: LayoutRunOptions
  LegendOptions: LegendOptions<'muted'>
  LegendProps: LegendProps<'muted'>
  LegendTitles: NonNullable<LegendViewOptions['titles']>
  LegendViewOptions: LegendViewOptions<Marks>
  LensInput: LensInput
  LensOptions: LensOptions
  MapGraphOptions: MapGraphOptions<'muted', Marks>
  MapGraphProps: MapGraphProps<'muted', Marks>
  MapPngOptions: MapPngOptions
  MinimapOptions: MinimapOptions
  MinimapProps: MinimapProps
  MountGraphOptions: MountGraphOptions<'muted', Marks>
  NodeFields: NodeFields<Item>
  NodeImage: NodeImage
  NodeOptions: NodeOptions<Item>
  NodeScalesOptions: NodeScalesOptions
  NumberScale: NumberScale
  OrthogonalRoutingOptions: OrthogonalRoutingOptions
  PathOptions: PathOptions<Marks>
  PersistPositionsOptions: PersistPositionsOptions<Item, string, 'muted'>
  PngExportOptions: PngExportOptions
  PositionSnapshotOptions: PositionSnapshotOptions
  RadialOptions: RadialOptions
  ReachOptions: ReachOptions<Marks>
  ReadOptions: ReadOptions
  RingsOptions: RingsOptions<Item>
  ScalesOptions: ScalesOptions
  SchemaInput: SchemaInput
  StateKindStyles: StateKindStyles
  StateLook: StateLook
  StateStyle: StateStyle
  SupportStateOptions: SupportStateOptions<'muted'>
  SupportWalkOptions: SupportWalkOptions
  SvgExportOptions: SvgExportOptions
  TimelineLabels: TimelineLabels
  TimelineOptions: TimelineOptions
  TimelineProps: TimelineProps
  TimelineViewOptions: TimelineViewOptions
  TimeOptions: TimeOptions
  TimeSpan: TimeSpan
  TimeValue: TimeValue
  TimeWindowInput: TimeWindowInput
  TransitionOptions: TransitionOptions
  UseGraphStateOptions: UseGraphStateOptions<number>
  UseLegendOptions: UseLegendOptions<'muted', Marks>
  UseTimelineOptions: UseTimelineOptions
  ViewLimitOptions: ViewLimitOptions
  ViewOptions: ViewOptions
  WriteOptions: WriteOptions<Item, Link>
  Zoom: Exclude<InteractionOptions['zoom'], boolean | undefined>
}

describe('input types', () => {
  it('accept undefined on every optional property', () => {
    expectTypeOf<{ [K in keyof Inputs]: Refused<Inputs[K]> }>().toEqualTypeOf<{
      [K in keyof Inputs]: never
    }>()
  })

  it('catch an optional property that refuses undefined', () => {
    expectTypeOf<
      Refused<{ readonly a?: number; readonly b?: number | undefined }>
    >().toEqualTypeOf<'a'>()
    expectTypeOf<Refused<EdgeTarget<Link>>>().toEqualTypeOf<'aggregate' | 'end'>()
  })
})
