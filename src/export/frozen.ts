import { Outline, outlineStride } from '../core/hull-geometry'
import { HullLabel, type HullShape } from '../core/hull-layer'
import { Positions } from '../core/positions'
import type { ShapeStore } from '../core/shape-store'
import type { ContainerFrame, HullInput } from '../host/renderer'

const noDrafts = new Uint8Array(0)

export function frozenPositions(positions: Positions): Positions {
  const copy = new Positions()
  copy.capacity = positions.capacity
  copy.version = positions.version
  copy.xy = positions.xy.slice()
  copy.placed = positions.placed.slice()
  copy.source = positions.source.slice()
  copy.blocks = positions.blocks.slice()
  copy.originX = positions.originX
  copy.originY = positions.originY
  return copy
}

export function frozenContainers(frame: ContainerFrame | null): ContainerFrame | null {
  if (!frame) return null
  return {
    boxes: frame.boxes.slice(),
    order: frame.order.slice(),
    count: frame.count,
    version: frame.version,
  }
}

function frozenHull(shape: HullShape): HullShape {
  const outline = new Outline()
  outline.data = shape.outline.data.slice(0, shape.outline.length * outlineStride)
  outline.length = shape.outline.length
  const label = shape.label ? Object.assign(new HullLabel(shape.label.id), shape.label) : null
  return {
    outline,
    fill: shape.fill,
    stroke: shape.stroke,
    strokeWidth: shape.strokeWidth,
    padding: shape.padding,
    label,
  }
}

export function frozenHulls(hulls: HullInput): HullInput {
  return {
    data: hulls.data.slice(0),
    count: hulls.count,
    version: hulls.version,
    labelVersion: hulls.labelVersion ?? 0,
    shapes: (hulls.shapes ?? []).map(frozenHull),
  }
}

export function withoutDrafts<T>(shapes: ShapeStore, run: () => T): T {
  const drafts = shapes.draft
  shapes.draft = noDrafts
  try {
    return run()
  } finally {
    shapes.draft = drafts
  }
}
