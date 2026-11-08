import { boxShape, containerShape, type NodeColumns, shapeCodes } from './columns'

export const squareReach = 0.86
export const diamondReach = 1.2
export const minimumNodeRadius = 1.25
export const maxShapeReach: number = Math.max(squareReach * Math.SQRT2, diamondReach)
export const boxCornerShare = 0.25
export const boxBadgeInset: number = 1 - Math.SQRT1_2

export interface NodeBox {
  halfWidth: number
  halfHeight: number
  corner: number
}

export function boxDistance(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  corner: number,
): number {
  const qx = Math.abs(x) - halfWidth + corner
  const qy = Math.abs(y) - halfHeight + corner
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - corner
}

export function boxReach(box: Readonly<NodeBox>, ux: number, uy: number): number {
  const dx = Math.abs(ux)
  const dy = Math.abs(uy)
  let t = Math.min(
    dx > 1e-9 ? box.halfWidth / dx : Number.POSITIVE_INFINITY,
    dy > 1e-9 ? box.halfHeight / dy : Number.POSITIVE_INFINITY,
  )
  if (!Number.isFinite(t)) return box.halfHeight
  const ix = box.halfWidth - box.corner
  const iy = box.halfHeight - box.corner
  if (dx * t > ix && dy * t > iy) {
    const b = dx * ix + dy * iy
    t = b + Math.sqrt(Math.max(b * b - ix * ix - iy * iy + box.corner * box.corner, 0))
  }
  return t
}

export function nodeShapeDistance(shape: number, x: number, y: number, radius: number): number {
  if (shape === shapeCodes.square) {
    const half = radius * squareReach
    const qx = Math.abs(x) - half
    const qy = Math.abs(y) - half
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
  }
  if (shape === shapeCodes.diamond) {
    return (Math.abs(x) + Math.abs(y) - radius * diamondReach) * Math.SQRT1_2
  }
  return Math.hypot(x, y) - radius
}

export function nodeShapeReach(shape: number): number {
  if (shape === shapeCodes.square) return squareReach * Math.SQRT2
  if (shape === shapeCodes.diamond) return diamondReach
  return 1
}

export function isBox(nodes: NodeColumns, index: number): boolean {
  return nodes.shape[index] === boxShape
}

export function nodeBox(nodes: NodeColumns, index: number, unit: number, out: NodeBox): NodeBox {
  const halfHeight = Math.max(((nodes.size[index] ?? 0) * unit) / 2, minimumNodeRadius)
  if (nodes.shape[index] !== boxShape) {
    out.halfWidth = halfHeight
    out.halfHeight = halfHeight
    out.corner = halfHeight
    return out
  }
  const halfWidth = Math.max(((nodes.width[index] ?? 0) * unit) / 2, minimumNodeRadius)
  out.halfWidth = halfWidth
  out.halfHeight = halfHeight
  out.corner = Math.min((nodes.corner[index] ?? 0) * unit, halfWidth, halfHeight)
  return out
}

export function nodeUnit(nodes: NodeColumns, index: number, zoom: number): number {
  return nodes.screenUnits[index] === 1 ? 1 : zoom
}

export function halfWidthOf(nodes: NodeColumns, index: number): number {
  return ((nodes.shape[index] === boxShape ? nodes.width[index] : nodes.size[index]) ?? 0) / 2
}

export function boundingRadius(nodes: NodeColumns, index: number): number {
  const half = (nodes.size[index] ?? 0) / 2
  if (nodes.shape[index] !== boxShape) return half * nodeShapeReach(nodes.shape[index] ?? 0)
  return Math.hypot((nodes.width[index] ?? 0) / 2, half)
}

const scratch: NodeBox = { halfWidth: 0, halfHeight: 0, corner: 0 }
const inscribed = [Math.SQRT1_2, squareReach, diamondReach / 2] as const

export function textInside(
  nodes: NodeColumns,
  index: number,
  zoom: number,
  width: number,
  height: number,
): boolean {
  if (nodes.shape[index] === boxShape) return true
  const box = nodeBox(nodes, index, nodeUnit(nodes, index, zoom), scratch)
  const side = box.halfHeight * 2 * (inscribed[nodes.shape[index] ?? 0] ?? 0)
  return width <= side && height <= side
}

export function trimsAsBox(nodes: NodeColumns, index: number): boolean {
  const shape = nodes.shape[index]
  return shape === boxShape || (shape === containerShape && nodes.containerBoxes !== null)
}

export function endBox(nodes: NodeColumns, index: number, zoom: number, out: NodeBox): NodeBox {
  const boxes = nodes.containerBoxes
  if (nodes.shape[index] !== containerShape || !boxes) {
    return nodeBox(nodes, index, nodeUnit(nodes, index, zoom), out)
  }
  const halfWidth = Math.max((boxes[index * 4] ?? 0) * zoom, minimumNodeRadius)
  const halfHeight = Math.max((boxes[index * 4 + 1] ?? 0) * zoom, minimumNodeRadius)
  out.halfWidth = halfWidth
  out.halfHeight = halfHeight
  out.corner = Math.min((boxes[index * 4 + 2] ?? 0) * zoom, halfWidth, halfHeight)
  return out
}

export function nodeTrim(
  nodes: NodeColumns,
  index: number,
  zoom: number,
  ux: number,
  uy: number,
): number {
  const box = endBox(nodes, index, zoom, scratch)
  return trimsAsBox(nodes, index) ? boxReach(box, ux, uy) : box.halfHeight
}

export function insideEndBox(
  nodes: NodeColumns,
  index: number,
  x: number,
  y: number,
  zoom: number,
): boolean {
  if (nodes.shape[index] !== containerShape || !nodes.containerBoxes) return false
  const box = endBox(nodes, index, zoom, scratch)
  return boxDistance(x * zoom, y * zoom, box.halfWidth, box.halfHeight, box.corner) < 0
}

export function loopShift(nodes: NodeColumns, index: number, zoom: number): number {
  if (nodes.shape[index] !== boxShape) return 0
  const box = nodeBox(nodes, index, nodeUnit(nodes, index, zoom), scratch)
  return Math.max(box.halfWidth - box.halfHeight, 0)
}

export function nodeDistance(
  nodes: NodeColumns,
  index: number,
  x: number,
  y: number,
  unit: number,
): number {
  const box = nodeBox(nodes, index, unit, scratch)
  if (nodes.shape[index] === boxShape) {
    return boxDistance(x, y, box.halfWidth, box.halfHeight, box.corner)
  }
  return nodeShapeDistance(nodes.shape[index] ?? 0, x, y, box.halfHeight)
}
