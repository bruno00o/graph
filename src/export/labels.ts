import type { EdgeColumns, NodeColumns } from '../core/columns'
import type { EdgePaths } from '../core/edge-paths'
import type { Positions } from '../core/positions'
import type { StateBuffers } from '../core/state-buffers'
import type { LabelMode } from '../host/renderer'
import { atlasFontSize } from '../webgl/glyph-atlas'
import {
  type EdgeAnchor,
  LabelLayer,
  type LabelSink,
  type PlacedLabel,
  sortBySize,
  sortEdgesByWidth,
  type TextMeasure,
} from '../webgl/label-layer'
import { edgeLabelGap, labelGap } from '../webgl/shaders'
import { type ExportFrame, frameSight, screenExtent } from './frame'

export interface LabelSource {
  readonly nodes: NodeColumns
  readonly edges: EdgeColumns
  readonly positions: Positions
  readonly states: StateBuffers
  readonly boxes?: Float32Array | null
  readonly bundles?: EdgePaths | null
}

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

const haloUnits = 1.6

export const placementDirections: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [0, 0],
]

export function selectLabels(
  source: LabelSource,
  frame: ExportFrame,
  mode: LabelMode,
  measure: TextMeasure,
  sink: LabelSink,
): void {
  if (mode === 'none') return
  const { nodes, edges, positions, states } = source
  const order = new Uint32Array(nodes.capacity)
  const sorted = sortBySize(nodes, order)
  const edgeOrder = new Uint32Array(edges.capacity)
  const sortedEdges = sortEdgesByWidth(edges, edgeOrder)
  new LabelLayer().select(
    {
      nodes,
      positions,
      boxes: source.boxes ?? null,
      view: frame.view,
      sight: frameSight(frame),
      width: frame.width,
      height: frame.height,
      nodeMask: states.nodeMask,
      labelFlags: states.labelFlags,
      highlighted: states.highlightedNodes,
      order,
      orderLength: sorted.length,
      screenLabels: sorted.screenLabels,
      largestLabel: sorted.largest,
      edges,
      edgeMask: states.edgeMask,
      edgeLabelFlags: states.edgeLabelFlags,
      highlightedEdges: states.highlightedEdges,
      edgeOrder,
      edgeOrderLength: sortedEdges.length,
      largestEdgeLabel: sortedEdges.largest,
      mode,
      sink,
      paths: source.bundles ?? null,
    },
    measure,
  )
}

export function labelBox(label: PlacedLabel, out: Box): Box {
  const plate = label.plate
  if (plate) {
    out.left = plate.cx - plate.hx
    out.right = plate.cx + plate.hx
    out.top = plate.cy - plate.hy
    out.bottom = plate.cy + plate.hy
    return out
  }
  const half = label.block.width / 2
  out.left = label.shift + (label.align - 1) * half - haloUnits
  out.right = label.shift + (label.align + 1) * half + haloUnits
  out.top = label.top - haloUnits
  out.bottom = label.top + label.block.height + haloUnits
  return out
}

function grow(box: Box, x: number, y: number): void {
  box.left = Math.min(box.left, x)
  box.right = Math.max(box.right, x)
  box.top = Math.min(box.top, y)
  box.bottom = Math.max(box.bottom, y)
}

export function fitLabels(
  source: LabelSource,
  frame: ExportFrame,
  mode: LabelMode,
  measure: TextMeasure,
  padding: number,
): ExportFrame {
  const { nodes, edges } = source
  const { view, width, height } = frame
  const zoom = view.zoom
  const shrink = Math.min(1, zoom)
  const bounds: Box = {
    left: padding,
    top: padding,
    right: width - padding,
    bottom: height - padding,
  }
  const local: Box = { left: 0, top: 0, right: 0, bottom: 0 }
  const x = (index: number) => (source.positions.x(index) - view.x) * zoom + width / 2
  const y = (index: number) => (source.positions.y(index) - view.y) * zoom + height / 2
  selectLabels(source, frame, mode, measure, {
    node: (index, label) => {
      const pixels = label.size * (nodes.screenUnits[index] === 1 ? 1 : shrink)
      const scale = pixels / atlasFontSize
      const [dx, dy] = placementDirections[label.placement] ?? [0, 1]
      const reach =
        label.placement === 4
          ? 0
          : screenExtent(nodes, source.boxes, index, zoom, dx !== 0 ? 0 : 1) +
            Math.max(0, nodes.outlineWidth[index] ?? 0) +
            labelGap
      const ox = x(index) + dx * reach
      const oy = y(index) + dy * reach
      labelBox(label, local)
      grow(bounds, ox + local.left * scale, oy + local.top * scale)
      grow(bounds, ox + local.right * scale, oy + local.bottom * scale)
    },
    edge: (index, label, anchor: Readonly<EdgeAnchor>) => {
      const scale = (label.size * shrink) / atlasFontSize
      const lift = label.plate ? 0 : Math.max(edges.width[index] ?? 0, 0.5) / 2 + edgeLabelGap
      labelBox(label, local)
      for (const along of [local.left, local.right]) {
        for (const across of [local.top, local.bottom]) {
          const u = along * scale
          const v = across * scale - lift
          grow(
            bounds,
            anchor.x + anchor.ax * u - anchor.ay * v,
            anchor.y + anchor.ay * u + anchor.ax * v,
          )
        }
      }
    },
  })
  const left = bounds.left - padding
  const top = bounds.top - padding
  const right = bounds.right + padding
  const bottom = bounds.bottom + padding
  return {
    view: {
      x: view.x + ((left + right) / 2 - width / 2) / zoom,
      y: view.y + ((top + bottom) / 2 - height / 2) / zoom,
      zoom,
    },
    width: right - left,
    height: bottom - top,
  }
}
