import { containerShape, type EdgeColumns, type NodeColumns } from '../core/columns'
import { type Cubic, loopCurve, loopMinimum, loopReach } from '../core/edge-curve'
import { type EdgePaths, maxPathPoints } from '../core/edge-paths'
import { outlineStride } from '../core/hull-geometry'
import type { HullShape } from '../core/hull-layer'
import type { LayerFilter } from '../core/mark-layers'
import type { Positions } from '../core/positions'
import type { TimeFilter } from '../core/time-range'
import { edgeShown, nodeShown, type Sight } from '../core/visibility'
import type { View } from '../types'

export interface ExportFrame {
  readonly view: View
  readonly width: number
  readonly height: number
  readonly window?: TimeFilter | null
  readonly layers?: LayerFilter | null
}

export function frameSight(frame: ExportFrame): Sight {
  return { zoom: frame.view.zoom, time: frame.window ?? null, layers: frame.layers ?? null }
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
  readonly hulls?: readonly HullShape[]
  readonly bundles?: EdgePaths | null
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
    ...(source.window ? { window: source.window } : {}),
    ...(source.layers ? { layers: source.layers } : {}),
    ...(source.layers ? { layers: source.layers } : {}),
  }
  if (options.region === 'view') return viewFrame
  const sight: Sight = { zoom, time: source.window ?? null, layers: source.layers ?? null }
  const { nodes, positions, boxes } = source
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let index = 0; index < nodes.capacity; index++) {
    if (nodes.alive[index] !== 1 || !nodeShown(nodes, index, sight)) continue
    const outline = Math.max(0, nodes.outlineWidth[index] ?? 0)
    const reachX = screenExtent(nodes, boxes, index, zoom, 0) + outline
    const reachY = screenExtent(nodes, boxes, index, zoom, 1) + outline
    const x = positions.x(index) * zoom
    const y = positions.y(index) * zoom
    minX = Math.min(minX, x - reachX)
    minY = Math.min(minY, y - reachY)
    maxX = Math.max(maxX, x + reachX)
    maxY = Math.max(maxY, y + reachY)
  }
  if (maxX < minX) return viewFrame
  const { edges } = source
  for (let index = 0; index < edges.capacity; index++) {
    const node = edges.source[index] ?? 0
    if (edges.alive[index] !== 1 || edges.target[index] !== node) continue
    if (!edgeShown(nodes, edges, index, sight)) continue
    const radius = screenRadius(nodes, node, zoom)
    const width = Math.max(edges.width[index] ?? 0, 0.5)
    const reach = Math.max(
      width / 2,
      (edges.arrow[index] ?? 0) !== 0 ? Math.max(width * 1.6, 3) : 0,
    )
    const curve = loopCurve(
      positions.x(node) * zoom,
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
  if (bundles && bundles.bundled > 0) {
    const line = new Float64Array(maxPathPoints * 2)
    for (let index = 0; index < edges.capacity; index++) {
      if (edges.alive[index] !== 1 || bundles.count(index) < 2) continue
      if (!edgeShown(nodes, edges, index, sight)) continue
      const reach = Math.max(edges.width[index] ?? 0, 0.5) / 2
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
    ...(source.window ? { window: source.window } : {}),
    ...(source.layers ? { layers: source.layers } : {}),
  }
}
