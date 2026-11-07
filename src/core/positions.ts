import type { Key, NodeMark } from '../types'
import { type CompiledNodeMark, compileNodeMark } from './compile-mark'
import { projectLatitude, projectLongitude } from './geo'
import type { GraphChanges, GraphModel } from './graph-model'

export const goldenAngle: number = Math.PI * (3 - Math.sqrt(5))

export const placementSpacing = 24

const blockShift = 10

export interface PositionMoves {
  readonly indices: readonly number[]
  readonly to: readonly number[]
  readonly held: readonly number[]
}

export interface PositionReader {
  readonly source: Float64Array
  x(index: number): number
  y(index: number): number
}

export class Positions implements PositionReader {
  capacity = 0
  version = 0
  xy: Float32Array = new Float32Array(0)
  placed: Uint8Array = new Uint8Array(0)
  source: Float64Array = new Float64Array(0)
  blocks: Float64Array = new Float64Array(0)
  originX = 0
  originY = 0
  #spiral = 0
  readonly #rings = new Map<number, number>()

  reserve(index: number): void {
    if (index < this.capacity) return
    const capacity = Math.max(64, this.capacity * 2, index + 1)
    const xy = new Float32Array(capacity * 2)
    xy.set(this.xy)
    const placed = new Uint8Array(capacity)
    placed.set(this.placed)
    const source = new Float64Array(capacity * 2).fill(Number.NaN)
    source.set(this.source)
    const blocks = new Float64Array(((capacity - 1) >>> blockShift) + 1)
    blocks.set(this.blocks)
    this.xy = xy
    this.placed = placed
    this.source = source
    this.blocks = blocks
    this.capacity = capacity
  }

  x(index: number): number {
    return (this.xy[index * 2] ?? 0) + this.originX
  }

  y(index: number): number {
    return (this.xy[index * 2 + 1] ?? 0) + this.originY
  }

  set(index: number, x: number, y: number): void {
    this.reserve(index)
    this.xy[index * 2] = x - this.originX
    this.xy[index * 2 + 1] = y - this.originY
    this.placed[index] = 1
    this.version++
    this.blocks[index >>> blockShift] = this.version
  }

  holds(index: number, x: number, y: number): boolean {
    return (
      this.xy[index * 2] === Math.fround(x - this.originX) &&
      this.xy[index * 2 + 1] === Math.fround(y - this.originY)
    )
  }

  rebase(x: number, y: number): void {
    const { xy, source, placed } = this
    for (let index = 0; index < this.capacity; index++) {
      if (placed[index] !== 1) continue
      const sx = source[index * 2] ?? Number.NaN
      const sy = source[index * 2 + 1] ?? Number.NaN
      if (!Number.isNaN(sx) && this.holds(index, sx, sy)) {
        xy[index * 2] = sx - x
        xy[index * 2 + 1] = sy - y
      } else {
        xy[index * 2] = (xy[index * 2] ?? 0) + this.originX - x
        xy[index * 2 + 1] = (xy[index * 2 + 1] ?? 0) + this.originY - y
      }
    }
    this.originX = x
    this.originY = y
    this.version++
    this.blocks.fill(this.version)
  }

  changedSince(version: number, visit: (first: number, last: number) => void): void {
    const blocks = this.blocks
    let start = -1
    for (let block = 0; block <= blocks.length; block++) {
      if (block < blocks.length && (blocks[block] ?? 0) > version) {
        if (start < 0) start = block
      } else if (start >= 0) {
        visit(start << blockShift, Math.min(this.capacity, block << blockShift) - 1)
        start = -1
      }
    }
  }

  release(index: number): void {
    if (index < this.capacity) this.placed[index] = 0
    this.follow(index, null)
    this.#rings.delete(index)
  }

  follow(index: number, point: readonly [number, number] | null): boolean {
    this.reserve(index)
    const x = point ? point[0] : Number.NaN
    const y = point ? point[1] : Number.NaN
    const changed =
      point !== null && (this.source[index * 2] !== x || this.source[index * 2 + 1] !== y)
    this.source[index * 2] = x
    this.source[index * 2 + 1] = y
    return changed
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

function pointReader(): (
  mark: NodeMark<unknown>,
  datum: unknown,
) => readonly [number, number] | null {
  let lastMark: NodeMark<unknown> | null = null
  let compiled: CompiledNodeMark | null = null
  return (mark, datum) => {
    if (mark !== lastMark) {
      lastMark = mark
      compiled = compileNodeMark(mark)
    }
    if (!compiled) return null
    if (compiled.x && compiled.y) {
      const x = finite(compiled.x(datum))
      const y = finite(compiled.y(datum))
      return x !== null && y !== null ? [x, y] : null
    }
    if (!compiled.longitude || !compiled.latitude) return null
    const longitude = finite(compiled.longitude(datum))
    const latitude = finite(compiled.latitude(datum))
    if (longitude === null || latitude === null) return null
    return [projectLongitude(longitude), projectLatitude(latitude)]
  }
}

export function placeNodes(
  model: GraphModel,
  positions: Positions,
  changes: GraphChanges,
): PositionMoves {
  for (const { index } of changes.nodes.removed) positions.release(index)
  const channelPoint = pointReader()
  const indices: number[] = []
  const to: number[] = []
  const held: number[] = []
  for (const { index } of changes.nodes.updated) {
    const record = model.nodeAt(index)
    if (!record) continue
    const point = channelPoint(record.mark, record.datum)
    if (!positions.follow(index, point) || !point) continue
    if (positions.holds(index, point[0], point[1])) {
      held.push(index)
      continue
    }
    indices.push(index)
    to.push(point[0], point[1])
  }
  const added = changes.nodes.added
  const last = added[added.length - 1]
  if (last) positions.reserve(last.index)
  const batch = model.nodeCount === added.length ? null : new Set<Key>(added.map((ref) => ref.key))
  for (const { key, index } of added) {
    const record = model.nodeAt(index)
    if (!record) continue
    const point = channelPoint(record.mark, record.datum)
    positions.follow(index, point)
    if (point) {
      positions.set(index, point[0], point[1])
      continue
    }
    let sumX = 0
    let sumY = 0
    let count = 0
    let anchor = -1
    if (batch !== null) {
      for (const neighbor of model.neighbors(key)) {
        if (batch.has(neighbor)) continue
        const other = model.node(neighbor)
        if (!other || positions.placed[other.index] !== 1) continue
        sumX += positions.x(other.index)
        sumY += positions.y(other.index)
        count++
        if (anchor < 0) anchor = other.index
      }
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
  return { indices, to, held }
}
