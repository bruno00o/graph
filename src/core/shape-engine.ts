import type { Key, Point, View } from '../types'
import type { GlobeCamera } from './globe'
import type { ElementChanges, ShapeRecord } from './graph-model'
import type { AnyIssue, InvalidShapeReason } from './issues'
import type { LabelTextColumns } from './label-text'
import type { LayerFilter } from './mark-layers'
import type { PositionReader, Positions } from './positions'
import type { ShapeStore } from './shape-store'
import type { StateBuffers } from './state-buffers'
import type { Sight } from './visibility'

export const shapeKinds = { polygon: 0, line: 1, circle: 2, rectangle: 3 } as const

export const shapePicks = { none: 0, painted: 1, stroke: 2 } as const

export type ShapeKind = (typeof shapeKinds)[keyof typeof shapeKinds]

export interface ShapeLevel {
  readonly area: number
  readonly points: Float64Array
  readonly rings: Uint32Array
  readonly triangles: Uint32Array
}

export interface ShapeGeometryData {
  readonly kind: ShapeKind
  readonly points: Float64Array
  readonly rings: Uint32Array
  readonly closed: boolean
  readonly triangles: Uint32Array
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
  readonly round: Float64Array | null
  readonly invalid: InvalidShapeReason | null
  readonly geo?: boolean
  readonly polygons?: Uint32Array
  readonly pending?: boolean
  readonly levels?: readonly ShapeLevel[]
}

export interface ShapeLayerInput {
  readonly store: ShapeStore
  readonly states: StateBuffers
  readonly originX: number
  readonly originY: number
}

export interface ShapeGlyphs {
  readonly data: ArrayBuffer
  readonly count: number
}

export interface ShapeLayer {
  sync(input: ShapeLayerInput): boolean
  draw(layers: LayerFilter | null, globe?: boolean, zoom?: number): void
  labels(set: object, main: ShapeGlyphs, highlight: ShapeGlyphs): void
  drawLabels(set: object, pass: number, layers: LayerFilter | null): void
  forget(set: object): void
  destroy(): void
}

export interface ShapePaint {
  readonly hex: string
  readonly alpha: number
}

export interface ShapeLook {
  readonly fill: number
  readonly stroke: number
  readonly strokeWidth: number
  readonly opacity: number
}

export interface ShapeSvgPen {
  readonly zoom: number
  readonly offsetX: number
  readonly offsetY: number
  readonly positions: PositionReader | null
  paint(id: number): ShapePaint
  look(index: number): ShapeLook | null
  raised(index: number): boolean
}

export interface ShapePickQuery {
  readonly x: number
  readonly y: number
  readonly scale: number
  readonly tolerance: number
  readonly current: boolean
  shown(index: number): boolean
  raised(index: number): boolean
}

export interface ShapePicker {
  pick(query: ShapePickQuery): number
  inside(polygon: readonly Point[], shown: (index: number) => boolean): number[]
}

export interface ShapeSource {
  shapeAt?(index: number): ShapeRecord | undefined
  shapes?(): Iterable<ShapeRecord>
  node?(key: Key): { readonly index: number } | undefined
}

export interface ShapeWriter {
  apply(model: ShapeSource, changes: ElementChanges | undefined, nodes: ElementChanges | null): void
  collect(into: AnyIssue[]): void
  drawOrder(): Uint32Array
  settled(): Promise<void>
  destroy(): void
}

export interface ShapeLabelColumns extends LabelTextColumns {
  readonly text: readonly (string | null)[]
  readonly labelBackground: Uint32Array
  readonly anchor: Float64Array
  readonly count: number
}

export interface ShapeLabelFrame {
  readonly store: ShapeStore
  readonly mask: Uint32Array
  readonly flags: Int8Array
  readonly highlighted: readonly number[]
  readonly raise: number
  readonly others: number
  readonly always: readonly number[]
}

export interface ShapeTextBlock {
  readonly width: number
  readonly height: number
}

export interface ShapeLabelSelection {
  readonly view: View
  readonly width: number
  readonly height: number
  readonly globe: GlobeCamera | null
  readonly positions: Positions
  readonly sight: Sight
  readonly all: boolean
  readonly shrink: number
  readonly minimum: number
  readonly generation: number
  room(): boolean
  claim(left: number, top: number, right: number, bottom: number, force: boolean): boolean
  taken(left: number, top: number, right: number, bottom: number): boolean
  measure(
    text: string,
    weight: number,
    font: string | null,
    maxWidth: number,
    size: number,
  ): ShapeTextBlock
  write(
    index: number,
    highlight: boolean,
    block: ShapeTextBlock,
    size: number,
    pixels: number,
    x: number,
    y: number,
  ): void
}

export interface ShapeLabeler {
  place(selection: ShapeLabelSelection, frame: ShapeLabelFrame, phase: number): void
}

export interface ShapeEngine {
  writer(store: ShapeStore): ShapeWriter
  layer(gl: WebGL2RenderingContext, blocks: Readonly<Record<string, number>>): ShapeLayer
  svg(store: ShapeStore, pen: ShapeSvgPen): string
  picker(store: ShapeStore, positions: PickPositions): ShapePicker
  labeler(): ShapeLabeler
}

export interface PickPositions extends PositionReader {
  readonly version: number
}

const engines = new WeakMap<object, ShapeEngine>()

export function registerShapeEngine(mark: object, engine: ShapeEngine): void {
  engines.set(mark, engine)
}

export function shapeEngineOf(mark: object): ShapeEngine | undefined {
  return engines.get(mark)
}

export function isDrawn(data: ShapeGeometryData | null | undefined): data is ShapeGeometryData {
  return data != null && (data.round !== null || data.points.length > 0)
}
