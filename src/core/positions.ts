import type { Key } from '../types'
import { compileNodeMark } from './compile-mark'
import type { GraphChanges, GraphModel } from './graph-model'

const goldenAngle = Math.PI * (3 - Math.sqrt(5))

export const placementSpacing = 24

export class Positions {
  capacity = 0
  version = 0
  xy: Float32Array = new Float32Array(0)
  placed: Uint8Array = new Uint8Array(0)
  #spiral = 0
  readonly #rings = new Map<number, number>()

  reserve(index: number): void {
    if (index < this.capacity) return
    const capacity = Math.max(64, this.capacity * 2, index + 1)
    const xy = new Float32Array(capacity * 2)
    xy.set(this.xy)
    const placed = new Uint8Array(capacity)
    placed.set(this.placed)
    this.xy = xy
    this.placed = placed
    this.capacity = capacity
  }

  x(index: number): number {
    return this.xy[index * 2] ?? 0
  }

  y(index: number): number {
    return this.xy[index * 2 + 1] ?? 0
  }

  set(index: number, x: number, y: number): void {
    this.reserve(index)
    this.xy[index * 2] = x
    this.xy[index * 2 + 1] = y
    this.placed[index] = 1
    this.version++
  }

  release(index: number): void {
    if (index < this.capacity) this.placed[index] = 0
    this.#rings.delete(index)
  }

  nextSpiral(): readonly [number, number] {
    const n = this.#spiral++
    const radius = placementSpacing * Math.sqrt(n)
    return [radius * Math.cos(n * goldenAngle), radius * Math.sin(n * goldenAngle)]
  }

  nextRing(anchor: number): number {
    const count = this.#rings.get(anchor) ?? 0
    this.#rings.set(anchor, count + 1)
    return count
  }
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function placeNodes(model: GraphModel, positions: Positions, changes: GraphChanges): void {
  for (const { index } of changes.nodes.removed) positions.release(index)
  const batch = new Set<Key>(changes.nodes.added.map((ref) => ref.key))
  for (const { key, index } of changes.nodes.added) {
    const record = model.node(key)
    if (!record) continue
    const mark = compileNodeMark(record.mark)
    const x = finite(mark.x?.(record.datum))
    const y = finite(mark.y?.(record.datum))
    if (x !== null && y !== null) {
      positions.set(index, x, y)
      continue
    }
    let sumX = 0
    let sumY = 0
    let count = 0
    let anchor = -1
    for (const neighbor of model.neighbors(key)) {
      if (batch.has(neighbor)) continue
      const other = model.node(neighbor)
      if (!other || positions.placed[other.index] !== 1) continue
      sumX += positions.x(other.index)
      sumY += positions.y(other.index)
      count++
      if (anchor < 0) anchor = other.index
    }
    if (count === 0) {
      const [sx, sy] = positions.nextSpiral()
      positions.set(index, sx, sy)
      continue
    }
    const ring = positions.nextRing(anchor)
    const angle = ring * goldenAngle
    const radius = placementSpacing * 1.5 * Math.sqrt(ring + 1)
    positions.set(
      index,
      sumX / count + radius * Math.cos(angle),
      sumY / count + radius * Math.sin(angle),
    )
  }
}
