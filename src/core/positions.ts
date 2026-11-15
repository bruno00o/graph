import type { Key, NodeMark, Point } from '../types'
import { isKey } from './accessor'
import { type CompiledNodeMark, compileNodeMark } from './compile-mark'
import { projectLatitude, projectLongitude } from './geo'
import { type GraphChanges, type GraphModel, linkStride } from './graph-model'

export const goldenAngle: number = Math.PI * (3 - Math.sqrt(5))

export const placementSpacing = 24

const ringSpacing = placementSpacing * 1.5

export type PlacementUnit = (index: number, y: number) => number

const worldUnit: PlacementUnit = () => 1

interface NodeRef {
  readonly key: Key
  readonly index: number
}

const blockShift = 10

export interface PositionMoves {
  readonly indices: readonly number[]
  readonly to: readonly number[]
  readonly held: readonly number[]
  readonly restored: readonly number[]
}

export class RestoredPositions {
  readonly #points = new Map<Key, Point>()
  skipped = 0

  constructor(entries: Iterable<readonly [Key, Point]>) {
    for (const entry of entries) {
      const key: unknown = entry?.[0]
      const point: Point | undefined = entry?.[1]
      if (
        !isKey(key) ||
        !point ||
        typeof point.x !== 'number' ||
        typeof point.y !== 'number' ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y)
      ) {
        this.skipped++
        continue
      }
      this.#points.set(key, point)
    }
  }

  get size(): number {
    return this.#points.size
  }

  take(key: Key): Point | undefined {
    const point = this.#points.get(key)
    if (point) this.#points.delete(key)
    return point
  }
}

interface PositionPlane {
  readonly capacity: number
  readonly xy: Float32Array
  readonly placed: Uint8Array
  readonly restored: Uint8Array
  readonly source: Float64Array
  readonly originX: number
  readonly originY: number
  readonly spiral: number
  readonly rings: Map<number, number>
}

function grownPlane(plane: PositionPlane, capacity: number): PositionPlane {
  if (plane.capacity >= capacity) return plane
  const xy = new Float32Array(capacity * 2)
  xy.set(plane.xy)
  const placed = new Uint8Array(capacity)
  placed.set(plane.placed)
  const restored = new Uint8Array(capacity)
  restored.set(plane.restored)
  const source = new Float64Array(capacity * 2).fill(Number.NaN)
  source.set(plane.source)
  return { ...plane, capacity, xy, placed, restored, source }
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
  restored: Uint8Array = new Uint8Array(0)
  source: Float64Array = new Float64Array(0)
  blocks: Float64Array = new Float64Array(0)
  originX = 0
  originY = 0
  followed = 0
  #spiral = 0
  #rings = new Map<number, number>()
  readonly #planes = new Map<object, PositionPlane>()

  reserve(index: number): void {
    if (index < this.capacity) return
    const capacity = Math.max(64, this.capacity * 2, index + 1)
    const xy = new Float32Array(capacity * 2)
    xy.set(this.xy)
    const placed = new Uint8Array(capacity)
    placed.set(this.placed)
    const restored = new Uint8Array(capacity)
    restored.set(this.restored)
    const source = new Float64Array(capacity * 2).fill(Number.NaN)
    source.set(this.source)
    const blocks = new Float64Array(((capacity - 1) >>> blockShift) + 1)
    blocks.set(this.blocks)
    this.xy = xy
    this.placed = placed
    this.restored = restored
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
    if (index < this.capacity) {
      this.placed[index] = 0
      this.restored[index] = 0
    }
    this.follow(index, null)
    this.#rings.delete(index)
    for (const plane of this.#planes.values()) {
      plane.rings.delete(index)
      if (index >= plane.capacity) continue
      plane.placed[index] = 0
      plane.restored[index] = 0
      plane.source[index * 2] = Number.NaN
      plane.source[index * 2 + 1] = Number.NaN
    }
  }

  swap(from: object, to: object): number[] {
    if (from === to) return []
    this.#planes.set(from, {
      capacity: this.capacity,
      xy: this.xy,
      placed: this.placed,
      restored: this.restored,
      source: this.source,
      originX: this.originX,
      originY: this.originY,
      spiral: this.#spiral,
      rings: this.#rings,
    })
    const kept = this.#planes.get(to)
    this.#planes.delete(to)
    const capacity = this.capacity
    const plane = kept
      ? grownPlane(kept, capacity)
      : grownPlane(
          {
            capacity: 0,
            xy: new Float32Array(0),
            placed: new Uint8Array(0),
            restored: new Uint8Array(0),
            source: new Float64Array(0),
            originX: 0,
            originY: 0,
            spiral: 0,
            rings: new Map(),
          },
          capacity,
        )
    const stale: number[] = []
    const fresh = this.source
    const known = plane.source
    for (let index = 0; index < capacity; index++) {
      if (plane.placed[index] !== 1) continue
      const x = fresh[index * 2] ?? Number.NaN
      const y = fresh[index * 2 + 1] ?? Number.NaN
      const was = known[index * 2] ?? Number.NaN
      const wasY = known[index * 2 + 1] ?? Number.NaN
      if (!Object.is(x, was) || !Object.is(y, wasY)) stale.push(index)
    }
    known.set(fresh.subarray(0, known.length))
    this.capacity = plane.capacity
    this.xy = plane.xy
    this.placed = plane.placed
    this.restored = plane.restored
    this.source = plane.source
    this.originX = plane.originX
    this.originY = plane.originY
    this.#spiral = plane.spiral
    this.#rings = plane.rings
    this.version++
    this.blocks =
      this.capacity === 0
        ? new Float64Array(0)
        : new Float64Array(((this.capacity - 1) >>> blockShift) + 1).fill(this.version)
    return stale
  }

  follow(index: number, point: readonly [number, number] | null): boolean {
    this.reserve(index)
    const x = point ? point[0] : Number.NaN
    const y = point ? point[1] : Number.NaN
    const was = this.source[index * 2] ?? Number.NaN
    const changed = point !== null && (was !== x || this.source[index * 2 + 1] !== y)
    if (Number.isNaN(was) !== (point === null)) this.followed += point === null ? -1 : 1
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
  restore: RestoredPositions | null = null,
  unit: PlacementUnit = worldUnit,
): PositionMoves {
  for (const { index } of changes.nodes.removed) positions.release(index)
  const channelPoint = pointReader()
  const indices: number[] = []
  const to: number[] = []
  const held: number[] = []
  const restored: number[] = []
  for (const { index } of changes.nodes.updated) {
    const record = model.nodeAt(index)
    if (!record) continue
    const point = channelPoint(record.mark, record.datum)
    if (!positions.follow(index, point) || !point || positions.placed[index] !== 1) continue
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
  const restoring = restore !== null && restore.size > 0
  const rest: NodeRef[] = []
  for (const ref of added) {
    const record = model.nodeAt(ref.index)
    if (!record) continue
    const point = channelPoint(record.mark, record.datum)
    positions.follow(ref.index, point)
    if (point) {
      restore?.take(ref.key)
      positions.set(ref.index, point[0], point[1])
      continue
    }
    const kept = restoring ? restore.take(ref.key) : undefined
    if (!kept) {
      rest.push(ref)
      continue
    }
    positions.set(ref.index, kept.x, kept.y)
    positions.restored[ref.index] = 1
    restored.push(ref.index)
  }
  const batch = restoring
    ? rest.length === model.nodeCount
      ? null
      : new Set<Key>(rest.map((ref) => ref.key))
    : model.nodeCount === added.length
      ? null
      : new Set<Key>(added.map((ref) => ref.key))
  placeRest(model, positions, rest, batch, unit)
  return { indices, to, held, restored }
}

function placeRest(
  model: GraphModel,
  positions: Positions,
  rest: readonly NodeRef[],
  batch: ReadonlySet<Key> | null,
  unit: PlacementUnit,
): void {
  if (rest.length === 0) return
  if (positions.followed === 0) {
    for (const { key, index } of rest) placeNear(model, positions, key, index, batch)
    return
  }
  placeAround(model, positions, rest, unit)
}

function placeNear(
  model: GraphModel,
  positions: Positions,
  key: Key,
  index: number,
  batch: ReadonlySet<Key> | null,
): void {
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
    return
  }
  const ring = positions.nextRing(anchor)
  const angle = ring * goldenAngle
  const radius = ringSpacing * Math.sqrt(ring + 1)
  positions.set(
    index,
    sumX / count + radius * Math.cos(angle),
    sumY / count + radius * Math.sin(angle),
  )
}

function placeOnRing(
  positions: Positions,
  index: number,
  anchor: number,
  x: number,
  y: number,
  unit: PlacementUnit,
): void {
  const ring = positions.nextRing(anchor)
  const angle = ring * goldenAngle
  const scale = unit(index, y)
  const radius =
    ringSpacing * Math.sqrt(ring + 1) * (scale > 0 && Number.isFinite(scale) ? scale : 1)
  positions.set(index, x + radius * Math.cos(angle), y + radius * Math.sin(angle))
}

function centralNode(positions: Positions): number {
  const { source, placed, capacity } = positions
  let sumX = 0
  let sumY = 0
  let count = 0
  for (let index = 0; index < capacity; index++) {
    const x = source[index * 2] ?? Number.NaN
    if (Number.isNaN(x) || placed[index] !== 1) continue
    sumX += x
    sumY += source[index * 2 + 1] ?? 0
    count++
  }
  if (count === 0) return -1
  const meanX = sumX / count
  const meanY = sumY / count
  let best = -1
  let nearest = Number.POSITIVE_INFINITY
  for (let index = 0; index < capacity; index++) {
    const x = source[index * 2] ?? Number.NaN
    if (Number.isNaN(x) || placed[index] !== 1) continue
    const away = Math.hypot(x - meanX, (source[index * 2 + 1] ?? 0) - meanY)
    if (away < nearest) {
      nearest = away
      best = index
    }
  }
  return best
}

function placeAround(
  model: GraphModel,
  positions: Positions,
  rest: readonly NodeRef[],
  unit: PlacementUnit,
): void {
  const { endNode, endHead, nodeEnd, links } = model.adjacency()
  const { placed } = positions
  const waiting = new Uint8Array(positions.capacity)
  const stamp = new Int32Array(positions.capacity)
  const queued = new Int32Array(positions.capacity)
  for (const { index } of rest) waiting[index] = 1
  let generation = 1
  const visit = (index: number, step: (other: number) => void) => {
    const end = nodeEnd[index] ?? -1
    let id = end < 0 ? -1 : (endHead[end] ?? -1)
    while (id !== -1) {
      const at = id * linkStride
      const source = links[at] ?? -1
      const outgoing = source === end
      const other = endNode[outgoing ? (links[at + 1] ?? -1) : source] ?? -1
      id = links[at + (outgoing ? 2 : 4)] ?? -1
      if (other >= 0 && other !== index) step(other)
    }
  }
  const enqueue = (index: number, into: number[]) => {
    visit(index, (other) => {
      if (waiting[other] !== 1 || queued[other] === generation + 1) return
      queued[other] = generation + 1
      into.push(other)
    })
  }
  let sumX = 0
  let sumY = 0
  let count = 0
  let anchor = -1
  const gather = (other: number) => {
    if (waiting[other] === 1 || placed[other] !== 1 || (stamp[other] ?? 0) >= generation) return
    sumX += positions.x(other)
    sumY += positions.y(other)
    count++
    if (anchor < 0) anchor = other
  }
  const spread = (first: number[]) => {
    let front = first
    while (front.length > 0) {
      const next: number[] = []
      for (const index of front) {
        if (waiting[index] !== 1) continue
        sumX = 0
        sumY = 0
        count = 0
        anchor = -1
        visit(index, gather)
        if (count === 0) continue
        placeOnRing(positions, index, anchor, sumX / count, sumY / count, unit)
        waiting[index] = 0
        stamp[index] = generation
        enqueue(index, next)
      }
      front = next
      generation++
    }
  }
  spread(rest.map((ref) => ref.index))
  let center = -2
  for (const { index } of rest) {
    if (waiting[index] !== 1) continue
    if (center === -2) center = centralNode(positions)
    if (center < 0) {
      const [sx, sy] = positions.nextSpiral()
      positions.set(index, sx, sy)
    } else {
      placeOnRing(positions, index, center, positions.x(center), positions.y(center), unit)
    }
    waiting[index] = 0
    stamp[index] = generation
    const next: number[] = []
    enqueue(index, next)
    generation++
    spread(next)
  }
}

export function placeOnSurface(
  model: GraphModel,
  positions: Positions,
  stale: readonly number[],
  holder: (index: number) => number,
  unit: PlacementUnit = worldUnit,
): number[] {
  const channelPoint = pointReader()
  for (const index of stale) {
    const record = model.nodeAt(index)
    if (!record) continue
    const point = channelPoint(record.mark, record.datum)
    positions.follow(index, point)
    if (point && !positions.holds(index, point[0], point[1])) {
      positions.set(index, point[0], point[1])
    }
  }
  const arrived: number[] = []
  const rest: NodeRef[] = []
  const held: number[] = []
  for (const record of model.nodes()) {
    const index = record.index
    if (positions.placed[index] === 1) continue
    const point = channelPoint(record.mark, record.datum)
    positions.follow(index, point)
    if (point) positions.set(index, point[0], point[1])
    else if (holder(index) >= 0) held.push(index)
    else {
      rest.push({ key: record.key, index })
      arrived.push(index)
    }
  }
  if (rest.length > 0) {
    const batch = rest.length === model.nodeCount ? null : new Set<Key>(rest.map((ref) => ref.key))
    placeRest(model, positions, rest, batch, unit)
  }
  for (const index of held) {
    const at = holder(index)
    if (positions.placed[at] === 1) positions.set(index, positions.x(at), positions.y(at))
    else {
      const [x, y] = positions.nextSpiral()
      positions.set(index, x, y)
    }
  }
  return arrived
}
