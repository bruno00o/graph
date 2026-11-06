import type { EdgeColumns, NodeColumns } from '../core/columns'
import { type Cubic, loopCurve, loopMinimum, loopReach } from '../core/edge-curve'
import type { Positions } from '../core/positions'
import type { View } from '../types'

export interface ExportFrame {
  readonly view: View
  readonly width: number
  readonly height: number
}

export interface FrameSource {
  readonly nodes: NodeColumns
  readonly edges: EdgeColumns
  readonly positions: Positions
  readonly view: View
  readonly width: number
  readonly height: number
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
  }
  if (options.region === 'view') return viewFrame
  const { nodes, positions } = source
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (let index = 0; index < nodes.capacity; index++) {
    if (nodes.alive[index] !== 1) continue
    const reach = screenRadius(nodes, index, zoom) + Math.max(0, nodes.outlineWidth[index] ?? 0)
    const x = positions.x(index) * zoom
    const y = positions.y(index) * zoom
    minX = Math.min(minX, x - reach)
    minY = Math.min(minY, y - reach)
    maxX = Math.max(maxX, x + reach)
    maxY = Math.max(maxY, y + reach)
  }
  if (maxX < minX) return viewFrame
  const { edges } = source
  for (let index = 0; index < edges.capacity; index++) {
    const node = edges.source[index] ?? 0
    if (edges.alive[index] !== 1 || edges.target[index] !== node) continue
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
  const padding = Math.max(0, options.padding)
  return {
    view: { x: (minX + maxX) / 2 / zoom, y: (minY + maxY) / 2 / zoom, zoom },
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
}
