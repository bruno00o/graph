import type { Point } from '../types'
import type { InvalidShapeReason } from './issues'
import type { LayerFilter } from './mark-layers'
import type { ShapeStore } from './shape-store'
import type { StateBuffers } from './state-buffers'

export const shapeKinds = { polygon: 0, line: 1, circle: 2, rectangle: 3 } as const

export const shapePicks = { none: 0, painted: 1, stroke: 2 } as const

export type ShapeKind = (typeof shapeKinds)[keyof typeof shapeKinds]

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
}

export interface ShapeLayerInput {
  readonly store: ShapeStore
  readonly states: StateBuffers
  readonly originX: number
  readonly originY: number
}

export interface ShapeLayer {
  sync(input: ShapeLayerInput): boolean
  draw(layers: LayerFilter | null): void
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
  paint(id: number): ShapePaint
  look(index: number): ShapeLook | null
  raised(index: number): boolean
}

export interface ShapePickQuery {
  readonly x: number
  readonly y: number
  readonly scale: number
  readonly tolerance: number
  shown(index: number): boolean
  raised(index: number): boolean
}

export interface ShapePicker {
  pick(query: ShapePickQuery): number
  inside(polygon: readonly Point[], shown: (index: number) => boolean): number[]
}

export interface ShapeEngine {
  read(value: unknown): ShapeGeometryData | null
  layer(gl: WebGL2RenderingContext, blocks: Readonly<Record<string, number>>): ShapeLayer
  svg(store: ShapeStore, pen: ShapeSvgPen): string
  picker(store: ShapeStore): ShapePicker
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

const noPoints = new Float64Array(0)
const noIndices = new Uint32Array(0)

export function emptyShape(): ShapeGeometryData {
  return {
    kind: shapeKinds.polygon,
    points: noPoints,
    rings: noIndices,
    closed: true,
    triangles: noIndices,
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
    round: null,
    invalid: 'empty',
  }
}
