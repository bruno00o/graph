import { containerShape, type EdgeColumns, type NodeColumns } from '../core/columns'
import { type Cubic, loopCurve, loopMinimum, loopReach } from '../core/edge-curve'
import { type EdgePaths, maxPathPoints } from '../core/edge-paths'
import { outlineStride } from '../core/hull-geometry'
import type { HullShape } from '../core/hull-layer'
import type { LayerFilter } from '../core/mark-layers'
import { halfWidthOf, isBox, loopShift, nodeUnit } from '../core/node-shape'
import type { Positions } from '../core/positions'
import { isDrawn } from '../core/shape-engine'
import type { ShapeStore } from '../core/shape-store'
import type { HideFilter, StateBuffers } from '../core/state-buffers'
import type { TimeFilter } from '../core/time-range'
import { edgeShown, nodeShown, type Sight, shapeShown } from '../core/visibility'
import type { View } from '../types'
import { stateOutline, stateStroke } from '../webgl/label-layer'
import { shapeLook } from './look'

export interface ExportFrame {
  readonly view: View
  readonly width: number
  readonly height: number
  readonly window?: TimeFilter | null | undefined
  readonly layers?: LayerFilter | null | undefined
  readonly hide?: HideFilter | null | undefined
}

export function frameSight(frame: ExportFrame): Sight {
  return {
    zoom: frame.view.zoom,
    time: frame.window ?? null,
    layers: frame.layers ?? null,
    hide: frame.hide ?? null,
  }
}

export interface FrameSource {
  readonly nodes: NodeColumns
  readonly edges: EdgeColumns
  readonly positions: Positions
  readonly boxes?: Float32Array | null
  readonly view: View
  readonly width: number
  readonly height: number
  readonly window?: TimeFilter | null
  readonly layers?: LayerFilter | null
  readonly hide?: HideFilter | null
  readonly hulls?: readonly HullShape[]
  readonly bundles?: EdgePaths | null
  readonly states?: StateBuffers | null
  readonly shapes?: ShapeStore | null
}

export interface FrameOptions {
  readonly region: 'view' | 'graph'
  readonly zoom: number | undefined
  readonly padding: number
}

export function screenRadius(nodes: NodeColumns, index: number, zoom: number): number {
  const size = nodes.size[index] ?? 0
  return Math.max((nodes.screenUnits[index] === 1 ? size : size * zoom) / 2, 1.25)
}

export function screenExtent(
  nodes: NodeColumns,
  boxes: Float32Array | null | undefined,
  index: number,
  zoom: number,
  axis: 0 | 1,
): number {
  if (axis === 0 && isBox(nodes, index)) {
    return Math.max(halfWidthOf(nodes, index) * nodeUnit(nodes, index, zoom), 1.25)
  }
  if (!boxes || nodes.shape[index] !== containerShape) return screenRadius(nodes, index, zoom)
  return Math.max((boxes[index * 4 + axis] ?? 0) * zoom, 1.25)
}

function point(curve: Cubic, t: number): [number, number] {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return [
    a * curve.ax + b * curve.bx + c * curve.cx + d * curve.dx,
    a * curve.ay + b * curve.by + c * curve.cy + d * curve.dy,
  ]
}

const loopSamples = 16

export function exportFrame(source: FrameSource, options: FrameOptions): ExportFrame {
  const zoom = options.zoom ?? source.view.zoom
  if (!(zoom > 0) || !Number.isFinite(zoom)) {
    throw new RangeError('graph: the export zoom must be a positive number')
  }
  const viewFrame = {
    view: { x: source.view.x, y: source.view.y, zoom },
    width: (source.width * zoom) / source.view.zoom,
    height: (source.height * zoom) / source.view.zoom,
    window: source.window,
    layers: source.layers,
    hide: source.hide,
  }
  if (options.region === 'view') return viewFrame
  const sight = frameSight(viewFrame)
  const { nodes, edges, positions, boxes } = source
  const states = source.states ?? null
  const others = states?.others('nodes') ?? 0
  const edgeOthers = states?.others('edges') ?? 0
  const outlineOf = (index: number): number =>
    stateOutline(
      states?.paint,
      states?.nodeMask[index] ?? 0,
      others,
      nodes.outlineWidth[index] ?? 0,
    )
  const widthOf = (index: number): number =>
    stateStroke(states?.numbers, states?.edgeMask[index] ?? 0, edgeOthers, edges.width[index] ?? 0)
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let index = 0; index < nodes.capacity; index++) {
    if (nodes.alive[index] !== 1 || !nodeShown(nodes, index, sight)) continue
    const outline = outlineOf(index)
    const reachX = screenExtent(nodes, boxes, index, zoom, 0) + outline
    const reachY = screenExtent(nodes, boxes, index, zoom, 1) + outline
    const x = positions.x(index) * zoom
    const y = positions.y(index) * zoom
    minX = Math.min(minX, x - reachX)
    minY = Math.min(minY, y - reachY)
    maxX = Math.max(maxX, x + reachX)
    maxY = Math.max(maxY, y + reachY)
  }
  const shapes = source.shapes
  for (let index = 0; shapes?.any && index < shapes.capacity; index++) {
    const geometry = shapes.alive[index] === 1 ? shapes.geometry[index] : null
    if (!isDrawn(geometry) || !shapeShown(shapes, index, sight)) continue
    const width = states
      ? shapeLook(shapes, states, index).strokeWidth
      : (shapes.strokeWidth[index] ?? 0)
    const reach = Math.max(width, 0) / 2
    const node = shapes.pinNode?.[index] ?? -1
    const ox = node >= 0 ? positions.x(node) * zoom : 0
    const oy = node >= 0 ? positions.y(node) * zoom : 0
    minX = Math.min(minX, geometry.minX * zoom + ox - reach)
    minY = Math.min(minY, geometry.minY * zoom + oy - reach)
    maxX = Math.max(maxX, geometry.maxX * zoom + ox + reach)
    maxY = Math.max(maxY, geometry.maxY * zoom + oy + reach)
  }
  if (maxX < minX) return viewFrame
  for (let index = 0; index < edges.capacity; index++) {
    const node = edges.source[index] ?? 0
    if (edges.alive[index] !== 1 || edges.target[index] !== node) continue
    if (!edgeShown(nodes, edges, index, sight)) continue
    const radius = screenRadius(nodes, node, zoom)
    const width = Math.max(widthOf(index), 0.5)
    const reach = Math.max(
      width / 2,
      (edges.arrow[index] ?? 0) !== 0 ? Math.max(width * 1.6, 3) : 0,
    )
    const curve = loopCurve(
      positions.x(node) * zoom + loopShift(nodes, node, zoom),
      positions.y(node) * zoom,
      loopReach(radius, edges.bend[index] ?? 0, loopMinimum),
    )
    for (let step = 0; step <= loopSamples; step++) {
      const [x, y] = point(curve, step / loopSamples)
      minX = Math.min(minX, x - reach)
      minY = Math.min(minY, y - reach)
      maxX = Math.max(maxX, x + reach)
      maxY = Math.max(maxY, y + reach)
    }
  }
  const bundles = source.bundles
  if (bundles?.any) {
    const line = new Float64Array(Math.max(maxPathPoints, bundles.longest) * 2)
    for (let index = 0; index < edges.capacity; index++) {
      if (edges.alive[index] !== 1 || bundles.count(index) < 2) continue
      if (!edgeShown(nodes, edges, index, sight)) continue
      const reach = Math.max(widthOf(index), 0.5) / 2
      const count = bundles.polyline(index, edges, positions, bundles.mix, line)
      for (let k = 1; k < count - 1; k++) {
        const x = (line[k * 2] ?? 0) * zoom
        const y = (line[k * 2 + 1] ?? 0) * zoom
        minX = Math.min(minX, x - reach)
        minY = Math.min(minY, y - reach)
        maxX = Math.max(maxX, x + reach)
        maxY = Math.max(maxY, y + reach)
      }
    }
  }
  for (const shape of source.hulls ?? []) {
    const { data, length } = shape.outline
    const reach = shape.padding / zoom
    const stroke = shape.strokeWidth / 2
    for (let k = 0; k < length; k++) {
      const at = k * outlineStride
      const extent = (data[at + 4] ?? 0) + reach
      const x = ((data[at] ?? 0) + (data[at + 2] ?? 0) * extent) * zoom
      const y = ((data[at + 1] ?? 0) + (data[at + 3] ?? 0) * extent) * zoom
      minX = Math.min(minX, x - stroke)
      minY = Math.min(minY, y - stroke)
      maxX = Math.max(maxX, x + stroke)
      maxY = Math.max(maxY, y + stroke)
    }
  }
  const padding = Math.max(0, options.padding)
  return {
    view: { x: (minX + maxX) / 2 / zoom, y: (minY + maxY) / 2 / zoom, zoom },
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
    window: source.window,
    layers: source.layers,
    hide: source.hide,
  }
}
