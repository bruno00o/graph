import type { EdgeEnd } from '../types'
import { containerShape, type EdgeColumns, type NodeColumns } from './columns'
import {
  type Cubic,
  distanceToCubic,
  loopCurve,
  loopMinimum,
  loopReach,
  parallelCurve,
  sampleCubic,
} from './edge-curve'
import { type EdgePaths, maxPathPoints } from './edge-paths'
import { worldSize } from './geo'
import { arcPolyline } from './geo-arc'
import type { Positions } from './positions'
import { edgeShown, nodeShown, type Sight } from './visibility'

export type PickHit =
  | { readonly kind: 'node'; readonly index: number }
  | { readonly kind: 'edge'; readonly index: number; readonly end: EdgeEnd | null }

export interface PickSource {
  readonly nodes: NodeColumns
  readonly edges: EdgeColumns
  readonly positions: Positions
  readonly order: (kind: 'nodes' | 'edges', index: number) => number
  readonly paths?: EdgePaths | null
}

export interface PickSurface {
  readonly scale: number
  readonly visible: (index: number) => boolean
}

interface Frame {
  readonly cell: number
  readonly minX: number
  readonly minY: number
  readonly cols: number
  readonly rows: number
}

interface Grid {
  readonly offsets: Uint32Array
  readonly items: Uint32Array
}

interface Extra {
  readonly cells: Map<number, number[]>
  readonly loose: number[]
}

const minimumPickRadius = 2
const pickSegments = 16
const indexSegments = 8
const absent = 0xffffffff
const extraFloor = 4096
const extraShare = 8
const edgeShare = 24
const maxLevel = 31

function distanceToPolyline(points: Float64Array, count: number, x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY
  for (let k = 0; k + 1 < count; k++) {
    const ax = points[k * 2] ?? 0
    const ay = points[k * 2 + 1] ?? 0
    const dx = (points[k * 2 + 2] ?? 0) - ax
    const dy = (points[k * 2 + 3] ?? 0) - ay
    const squared = dx * dx + dy * dy
    const t = squared > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / squared)) : 0
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t))
  }
  return best
}

function pickable(nodes: NodeColumns, index: number): boolean {
  return nodes.alive[index] === 1 && nodes.shape[index] !== containerShape
}

function emptyExtra(): Extra {
  return { cells: new Map(), loose: [] }
}

function cellOf(frame: Frame, x: number, y: number): number {
  const col = Math.floor((x - frame.minX) / frame.cell)
  const row = Math.floor((y - frame.minY) / frame.cell)
  if (col < 0 || row < 0 || col >= frame.cols || row >= frame.rows) return -1
  return row * frame.cols + col
}

function insideFrame(frame: Frame, points: ArrayLike<number>): boolean {
  for (let at = 0; at + 1 < points.length; at += 2) {
    if (cellOf(frame, points[at] ?? 0, points[at + 1] ?? 0) < 0) return false
  }
  return true
}

function stamp(
  cells: Map<number, number[]>,
  cell: number,
  index: number,
  generation: number,
): void {
  const list = cells.get(cell)
  if (list) list.push(index, generation)
  else cells.set(cell, [index, generation])
}

function visitStamped(
  list: readonly number[],
  generations: Uint32Array,
  visit: (item: number) => void,
): void {
  for (let at = 0; at + 1 < list.length; at += 2) {
    const item = list[at] ?? 0
    if (generations[item] === list[at + 1]) visit(item)
  }
}

function grownFloat(array: Float32Array, length: number, fill: number): Float32Array {
  if (array.length >= length) return array
  const next = new Float32Array(length).fill(fill)
  next.set(array)
  return next
}

function grownDouble(array: Float64Array, length: number, fill: number): Float64Array {
  if (array.length >= length) return array
  const next = new Float64Array(length).fill(fill)
  next.set(array)
  return next
}

function grownUint(array: Uint32Array, length: number, fill: number): Uint32Array {
  if (array.length >= length) return array
  const next = new Uint32Array(length).fill(fill)
  next.set(array)
  return next
}

function createGrid(
  cells: number,
  count: number,
  visit: (index: number, emit: (cell: number) => void) => void,
): Grid {
  const offsets = new Uint32Array(cells + 1)
  for (let index = 0; index < count; index++) {
    visit(index, (cell) => {
      offsets[cell + 1] = (offsets[cell + 1] ?? 0) + 1
    })
  }
  for (let cell = 0; cell < cells; cell++) {
    offsets[cell + 1] = (offsets[cell + 1] ?? 0) + (offsets[cell] ?? 0)
  }
  const cursor = offsets.slice(0, cells)
  const items = new Uint32Array(offsets[cells] ?? 0)
  for (let index = 0; index < count; index++) {
    visit(index, (cell) => {
      const at = cursor[cell] ?? 0
      items[at] = index
      cursor[cell] = at + 1
    })
  }
  return { offsets, items }
}

function bucketOf(length: number): number {
  const cells = Math.ceil(length)
  return cells <= 1 ? 0 : 32 - Math.clz32(cells - 1)
}

function levelSpanFor(sums: Float64Array, count: number, budget: number): number {
  for (let span = maxLevel; span > 0; span--) {
    let total = count
    sums.forEach((sum, bucket) => {
      total += bucket <= span ? sum : sum / 2 ** (bucket - span)
    })
    if (total <= budget) return span
  }
  return 0
}

function spread(
  frame: Frame,
  base: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  counts: Uint32Array,
  items: Uint32Array | null,
  index: number,
): void {
  const x0 = (ax - frame.minX) / frame.cell
  const y0 = (ay - frame.minY) / frame.cell
  const x1 = (bx - frame.minX) / frame.cell
  const y1 = (by - frame.minY) / frame.cell
  const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0)
  const forward = steep ? y0 <= y1 : x0 <= x1
  const u0 = steep ? (forward ? x0 : x1) : forward ? y0 : y1
  const v0 = steep ? (forward ? y0 : y1) : forward ? x0 : x1
  const u1 = steep ? (forward ? x1 : x0) : forward ? y1 : y0
  const v1 = steep ? (forward ? y1 : y0) : forward ? x1 : x0
  const bands = steep ? frame.rows : frame.cols
  const units = steep ? frame.cols : frame.rows
  const bandStride = steep ? frame.cols : 1
  const unitStride = steep ? 1 : frame.cols
  const slope = v1 === v0 ? 0 : (u1 - u0) / (v1 - v0)
  const first = Math.max(0, Math.floor(v0))
  const last = Math.min(bands - 1, Math.floor(v1))
  for (let band = first; band <= last; band++) {
    const ua = v1 === v0 ? u0 : u0 + (Math.max(v0, band) - v0) * slope
    const ub = v1 === v0 ? u1 : u0 + (Math.min(v1, band + 1) - v0) * slope
    const low = Math.max(0, Math.floor(Math.min(ua, ub)))
    const high = Math.min(units - 1, Math.floor(Math.max(ua, ub)))
    let at = base + band * bandStride + low * unitStride
    if (items === null) {
      for (let unit = low; unit <= high; unit++, at += unitStride) {
        counts[at + 1] = (counts[at + 1] ?? 0) + 1
      }
    } else {
      for (let unit = low; unit <= high; unit++, at += unitStride) {
        const slot = counts[at] ?? 0
        items[slot] = index
        counts[at] = slot + 1
      }
    }
  }
}

function traverse(
  grid: Frame,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  emit: (cell: number) => void,
): void {
  const x0 = (ax - grid.minX) / grid.cell
  const y0 = (ay - grid.minY) / grid.cell
  const x1 = (bx - grid.minX) / grid.cell
  const y1 = (by - grid.minY) / grid.cell
  let col = Math.floor(x0)
  let row = Math.floor(y0)
  const lastCol = Math.floor(x1)
  const lastRow = Math.floor(y1)
  const stepX = Math.sign(x1 - x0)
  const stepY = Math.sign(y1 - y0)
  const deltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / (x1 - x0))
  const deltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / (y1 - y0))
  let maxX = stepX > 0 ? (col + 1 - x0) * deltaX : stepX < 0 ? (x0 - col) * deltaX : deltaX
  let maxY = stepY > 0 ? (row + 1 - y0) * deltaY : stepY < 0 ? (y0 - row) * deltaY : deltaY
  const limit = Math.abs(lastCol - col) + Math.abs(lastRow - row)
  for (let step = 0; step <= limit; step++) {
    if (col >= 0 && row >= 0 && col < grid.cols && row < grid.rows) emit(row * grid.cols + col)
    if (col === lastCol && row === lastRow) return
    if (maxX < maxY) {
      maxX += deltaX
      col += stepX
    } else {
      maxY += deltaY
      row += stepY
    }
  }
}

export class PickIndex {
  #frame: Frame | null = null
  #nodes: Grid | null = null
  #edges: Grid | null = null
  #levels: Frame[] = []
  #bases: number[] = []
  #maxWorldRadius = 0
  #maxScreenRadius = 0
  #maxEdgeHalfWidth = 0
  #loops: number[] = []
  #indexedXy: Float64Array = new Float64Array(0)
  #indexedFrom: Uint32Array = new Uint32Array(0)
  #indexedTo: Uint32Array = new Uint32Array(0)
  #indexedBend: Float32Array = new Float32Array(0)
  #nodeGeneration: Uint32Array = new Uint32Array(0)
  #edgeGeneration: Uint32Array = new Uint32Array(0)
  #generation = 0
  #extraNodes: Extra = emptyExtra()
  #extraEdges: Extra = emptyExtra()
  #extraLoops: number[] = []
  #reindexed = 0
  #polyline: Float64Array = new Float64Array(maxPathPoints * 2)
  #wraps = false

  build(source: PickSource): void {
    const { nodes, edges, positions } = source
    this.#wraps = false
    let count = 0
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    this.#maxWorldRadius = 0
    this.#maxScreenRadius = 0
    this.#nodeGeneration = new Uint32Array(nodes.capacity)
    this.#edgeGeneration = new Uint32Array(edges.capacity)
    this.#extraNodes = emptyExtra()
    this.#extraEdges = emptyExtra()
    this.#extraLoops = []
    this.#reindexed = 0
    const indexedXy = new Float64Array(nodes.capacity * 2).fill(Number.NaN)
    for (let index = 0; index < nodes.capacity; index++) {
      if (!pickable(nodes, index)) continue
      const x = positions.x(index)
      const y = positions.y(index)
      indexedXy[index * 2] = x
      indexedXy[index * 2 + 1] = y
      const radius = (nodes.size[index] ?? 0) / 2
      if (nodes.screenUnits[index] === 1) {
        this.#maxScreenRadius = Math.max(this.#maxScreenRadius, radius)
      } else {
        this.#maxWorldRadius = Math.max(this.#maxWorldRadius, radius)
      }
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      count++
    }
    this.#indexedXy = indexedXy
    if (count === 0) {
      this.#frame = null
      this.#nodes = null
      this.#edges = null
      this.#levels = []
      this.#bases = []
      this.#loops = []
      return
    }
    this.#loops = []
    const indexedFrom = new Uint32Array(edges.capacity).fill(absent)
    const indexedTo = new Uint32Array(edges.capacity).fill(absent)
    const indexedBend = new Float32Array(edges.capacity)
    for (let index = 0; index < edges.capacity; index++) {
      if (edges.alive[index] !== 1) continue
      indexedFrom[index] = edges.source[index] ?? 0
      indexedTo[index] = edges.target[index] ?? 0
      indexedBend[index] = edges.bend[index] ?? 0
      if (edges.source[index] === edges.target[index]) {
        this.#loops.push(index)
        continue
      }
      const points = this.#shape(source, index)
      if (!points) continue
      for (let at = 0; at < points.length; at += 2) {
        minX = Math.min(minX, points[at] ?? minX)
        maxX = Math.max(maxX, points[at] ?? maxX)
        minY = Math.min(minY, points[at + 1] ?? minY)
        maxY = Math.max(maxY, points[at + 1] ?? maxY)
      }
    }
    this.#indexedFrom = indexedFrom
    this.#indexedTo = indexedTo
    this.#indexedBend = indexedBend
    const spanX = Math.max(maxX - minX, 1)
    const spanY = Math.max(maxY - minY, 1)
    let cell = Math.max(this.#maxWorldRadius * 2, Math.sqrt((spanX * spanY) / count) * 2, 1e-3)
    const budget = count * 4 + 1024
    const cells = (spanX / cell + 1) * (spanY / cell + 1)
    if (cells > budget) cell *= Math.sqrt(cells / budget)
    const frame: Frame = {
      cell,
      minX,
      minY,
      cols: Math.floor(spanX / cell) + 1,
      rows: Math.floor(spanY / cell) + 1,
    }
    this.#frame = frame
    this.#nodes = createGrid(frame.cols * frame.rows, nodes.capacity, (index, emit) => {
      if (!pickable(nodes, index)) return
      const col = Math.floor((positions.x(index) - minX) / cell)
      const row = Math.floor((positions.y(index) - minY) / cell)
      emit(row * frame.cols + col)
    })
    this.#maxEdgeHalfWidth = 0
    const buckets = new Uint8Array(edges.capacity)
    const sums = new Float64Array(maxLevel + 1)
    let routed = 0
    let longest = 0
    for (let index = 0; index < edges.capacity; index++) {
      if (edges.alive[index] !== 1) continue
      this.#maxEdgeHalfWidth = Math.max(this.#maxEdgeHalfWidth, (edges.width[index] ?? 0) / 2)
      if (edges.source[index] === edges.target[index]) continue
      const length = this.#length(source, index) / cell
      const bucket = bucketOf(length)
      buckets[index] = bucket
      sums[bucket] = (sums[bucket] ?? 0) + length
      if (bucket > longest) longest = bucket
      routed++
    }
    const span = levelSpanFor(sums, routed, routed * edgeShare)
    const top = Math.max(0, longest - span)
    const levels: Frame[] = []
    const bases: number[] = []
    let levelCells = 0
    for (let level = 0; level <= top; level++) {
      const size = cell * 2 ** level
      const cols = Math.floor(spanX / size) + 1
      const rows = Math.floor(spanY / size) + 1
      levels.push(level === 0 ? frame : { cell: size, minX, minY, cols, rows })
      bases.push(levelCells)
      levelCells += cols * rows
    }
    this.#levels = levels
    this.#bases = bases
    const offsets = new Uint32Array(levelCells + 1)
    this.#spreadEdges(source, buckets, span, offsets, null)
    for (let at = 0; at < levelCells; at++) {
      offsets[at + 1] = (offsets[at + 1] ?? 0) + (offsets[at] ?? 0)
    }
    const items = new Uint32Array(offsets[levelCells] ?? 0)
    this.#spreadEdges(source, buckets, span, offsets.slice(0, levelCells), items)
    this.#edges = { offsets, items }
  }

  #spreadEdges(
    source: PickSource,
    buckets: Uint8Array,
    span: number,
    counts: Uint32Array,
    items: Uint32Array | null,
  ): void {
    const { edges, positions } = source
    for (let index = 0; index < edges.capacity; index++) {
      if (edges.alive[index] !== 1) continue
      const from = edges.source[index] ?? 0
      const to = edges.target[index] ?? 0
      if (from === to) continue
      const level = Math.max(0, (buckets[index] ?? 0) - span)
      const frame = this.#levels[level]
      const base = this.#bases[level] ?? 0
      if (!frame) continue
      const points = this.#shape(source, index)
      if (!points) {
        const ax = positions.x(from)
        const ay = positions.y(from)
        spread(frame, base, ax, ay, positions.x(to), positions.y(to), counts, items, index)
        continue
      }
      for (let at = 0; at + 3 < points.length; at += 2) {
        const ax = points[at] ?? 0
        const ay = points[at + 1] ?? 0
        const bx = points[at + 2] ?? 0
        const by = points[at + 3] ?? 0
        spread(frame, base, ax, ay, bx, by, counts, items, index)
      }
    }
  }

  refresh(source: PickSource): void {
    const frame = this.#frame
    if (!frame) {
      this.build(source)
      return
    }
    const { nodes, edges, positions } = source
    this.#indexedXy = grownDouble(this.#indexedXy, nodes.capacity * 2, Number.NaN)
    this.#indexedFrom = grownUint(this.#indexedFrom, edges.capacity, absent)
    this.#indexedTo = grownUint(this.#indexedTo, edges.capacity, absent)
    this.#indexedBend = grownFloat(this.#indexedBend, edges.capacity, 0)
    this.#nodeGeneration = grownUint(this.#nodeGeneration, nodes.capacity, 0)
    this.#edgeGeneration = grownUint(this.#edgeGeneration, edges.capacity, 0)
    const xy = this.#indexedXy
    const moved = new Uint8Array(nodes.capacity)
    const changedNodes: number[] = []
    let total = 0
    let worldRadius = 0
    let screenRadius = 0
    for (let index = 0; index < nodes.capacity; index++) {
      if (!pickable(nodes, index)) continue
      total++
      const radius = (nodes.size[index] ?? 0) / 2
      if (nodes.screenUnits[index] === 1) screenRadius = Math.max(screenRadius, radius)
      else worldRadius = Math.max(worldRadius, radius)
      if (xy[index * 2] === positions.x(index) && xy[index * 2 + 1] === positions.y(index)) continue
      moved[index] = 1
      changedNodes.push(index)
    }
    const changedEdges: number[] = []
    let halfWidth = 0
    for (let index = 0; index < edges.capacity; index++) {
      if (edges.alive[index] !== 1) continue
      total++
      halfWidth = Math.max(halfWidth, (edges.width[index] ?? 0) / 2)
      const from = edges.source[index] ?? 0
      const to = edges.target[index] ?? 0
      if (
        this.#indexedFrom[index] === from &&
        this.#indexedTo[index] === to &&
        this.#indexedBend[index] === (edges.bend[index] ?? 0) &&
        moved[from] !== 1 &&
        moved[to] !== 1
      ) {
        continue
      }
      changedEdges.push(index)
    }
    this.#maxWorldRadius = worldRadius
    this.#maxScreenRadius = screenRadius
    this.#maxEdgeHalfWidth = halfWidth
    const changed = changedNodes.length + changedEdges.length
    if (changed === 0) return
    this.#reindexed += changed
    if (this.#reindexed > Math.max(extraFloor, total / extraShare)) {
      this.build(source)
      return
    }
    for (const index of changedNodes) {
      const generation = ++this.#generation
      this.#nodeGeneration[index] = generation
      const x = positions.x(index)
      const y = positions.y(index)
      xy[index * 2] = x
      xy[index * 2 + 1] = y
      const cell = cellOf(frame, x, y)
      if (cell < 0) this.#extraNodes.loose.push(index, generation)
      else stamp(this.#extraNodes.cells, cell, index, generation)
    }
    for (const index of changedEdges) {
      const generation = ++this.#generation
      this.#edgeGeneration[index] = generation
      const from = edges.source[index] ?? 0
      const to = edges.target[index] ?? 0
      this.#indexedFrom[index] = from
      this.#indexedTo[index] = to
      this.#indexedBend[index] = edges.bend[index] ?? 0
      if (from === to) {
        this.#extraLoops.push(index, generation)
        continue
      }
      const points = this.#shape(source, index) ?? [
        positions.x(from),
        positions.y(from),
        positions.x(to),
        positions.y(to),
      ]
      if (!insideFrame(frame, points)) {
        this.#extraEdges.loose.push(index, generation)
        continue
      }
      this.#route(source, frame, index, (cell) =>
        stamp(this.#extraEdges.cells, cell, index, generation),
      )
    }
    if (this.#extraNodes.loose.length + this.#extraEdges.loose.length > extraFloor * 2) {
      this.build(source)
    }
  }

  pick(
    source: PickSource,
    x: number,
    y: number,
    sight: Sight,
    tolerance: number,
    lens: PickSurface | null = null,
  ): PickHit | null {
    const scale = lens?.scale ?? sight.zoom
    const node = this.#pickNode(source, x, y, sight, scale, lens)
    if (node >= 0) return { kind: 'node', index: node }
    let at = x
    let edge = this.#pickEdge(source, at, y, sight, scale, tolerance)
    if (edge < 0 && this.#wraps) {
      at = x + worldSize
      edge = this.#pickEdge(source, at, y, sight, scale, tolerance)
    }
    if (edge < 0 && this.#wraps) {
      at = x - worldSize
      edge = this.#pickEdge(source, at, y, sight, scale, tolerance)
    }
    return edge >= 0
      ? { kind: 'edge', index: edge, end: this.#endOf(source, edge, at, y, scale) }
      : null
  }

  #endOf(source: PickSource, index: number, x: number, y: number, scale: number): EdgeEnd | null {
    const { edges, positions } = source
    const split = edges.ends?.split[index] ?? Number.NaN
    if (Number.isNaN(split)) return null
    const from = edges.source[index] ?? 0
    const to = edges.target[index] ?? 0
    const start = this.#border(source, from, scale)
    const finish = this.#border(source, to, scale)
    const points =
      from === to
        ? sampleCubic(this.#loop(source, index, scale), pickSegments)
        : this.#shape(source, index)
    let along = 0
    let total = 0
    if (!points) {
      const ax = positions.x(from)
      const ay = positions.y(from)
      const dx = positions.x(to) - ax
      const dy = positions.y(to) - ay
      total = Math.hypot(dx, dy)
      along = total > 0 ? ((x - ax) * dx + (y - ay) * dy) / total : 0
    } else {
      let best = Number.POSITIVE_INFINITY
      for (let at = 0; at + 3 < points.length; at += 2) {
        const ax = points[at] ?? 0
        const ay = points[at + 1] ?? 0
        const dx = (points[at + 2] ?? 0) - ax
        const dy = (points[at + 3] ?? 0) - ay
        const length = Math.hypot(dx, dy)
        const t =
          length > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length ** 2)) : 0
        const distance = Math.hypot(x - ax - dx * t, y - ay - dy * t)
        if (distance < best) {
          best = distance
          along = total + length * t
        }
        total += length
      }
    }
    const visible = total - start - finish
    const share = visible > 0 ? (along - start) / visible : 0.5
    return share < split ? 'source' : 'target'
  }

  #border(source: PickSource, index: number, zoom: number): number {
    const size = (source.nodes.size[index] ?? 0) / 2
    return Math.max(source.nodes.screenUnits[index] === 1 ? size / zoom : size, 1.25 / zoom)
  }

  #around(
    frame: Frame | null | undefined,
    base: number,
    grid: Grid | null,
    generations: Uint32Array,
    extra: Extra | null,
    x: number,
    y: number,
    reach: number,
    visit: (item: number) => void,
  ): void {
    if (!frame || !grid) return
    const c0 = Math.max(0, Math.floor((x - reach - frame.minX) / frame.cell))
    const c1 = Math.min(frame.cols - 1, Math.floor((x + reach - frame.minX) / frame.cell))
    const r0 = Math.max(0, Math.floor((y - reach - frame.minY) / frame.cell))
    const r1 = Math.min(frame.rows - 1, Math.floor((y + reach - frame.minY) / frame.cell))
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const cell = row * frame.cols + col
        const end = grid.offsets[base + cell + 1] ?? 0
        for (let at: number = grid.offsets[base + cell] ?? 0; at < end; at++) {
          const item = grid.items[at] ?? 0
          if ((generations[item] ?? 0) === 0) visit(item)
        }
        const stamped = extra?.cells.get(cell)
        if (stamped) visitStamped(stamped, generations, visit)
      }
    }
    if (extra) visitStamped(extra.loose, generations, visit)
  }

  #length(source: PickSource, index: number): number {
    const { edges, positions } = source
    const from = edges.source[index] ?? 0
    const to = edges.target[index] ?? 0
    const points = this.#shape(source, index)
    if (!points) {
      return (
        Math.abs(positions.x(to) - positions.x(from)) +
        Math.abs(positions.y(to) - positions.y(from))
      )
    }
    let length = 0
    for (let at = 0; at + 3 < points.length; at += 2) {
      length +=
        Math.abs((points[at + 2] ?? 0) - (points[at] ?? 0)) +
        Math.abs((points[at + 3] ?? 0) - (points[at + 1] ?? 0))
    }
    return length
  }

  #route(source: PickSource, frame: Frame, index: number, emit: (cell: number) => void): void {
    const { edges, positions } = source
    const from = edges.source[index] ?? 0
    const to = edges.target[index] ?? 0
    const points = this.#shape(source, index)
    if (!points) {
      traverse(frame, positions.x(from), positions.y(from), positions.x(to), positions.y(to), emit)
      return
    }
    for (let at = 0; at + 3 < points.length; at += 2) {
      traverse(
        frame,
        points[at] ?? 0,
        points[at + 1] ?? 0,
        points[at + 2] ?? 0,
        points[at + 3] ?? 0,
        emit,
      )
    }
  }

  #shape(source: PickSource, index: number): ArrayLike<number> | null {
    const paths = source.paths
    if (paths && paths.count(index) > 1) {
      const count = paths.polyline(index, source.edges, source.positions, paths.mix, this.#polyline)
      return this.#polyline.subarray(0, count * 2)
    }
    if (source.edges.geodesic[index] === 1) return this.#arc(source, index)
    if ((source.edges.bend[index] ?? 0) === 0) return null
    return sampleCubic(this.#parallel(source, index), indexSegments)
  }

  #arc(source: PickSource, index: number): Float64Array {
    const { edges, positions } = source
    const from = edges.source[index] ?? 0
    const to = edges.target[index] ?? 0
    const points = this.#polyline
    const count = arcPolyline(
      positions.x(from),
      positions.y(from),
      positions.x(to),
      positions.y(to),
      edges.bend[index] ?? 0,
      true,
      points,
    )
    const last = points[(count - 1) * 2] ?? 0
    if (last < 0 || last > worldSize) this.#wraps = true
    return points.subarray(0, count * 2)
  }

  #parallel(source: PickSource, index: number): Cubic {
    const { edges, positions } = source
    const from = edges.source[index] ?? 0
    const to = edges.target[index] ?? 0
    return parallelCurve(
      positions.x(from),
      positions.y(from),
      positions.x(to),
      positions.y(to),
      edges.bend[index] ?? 0,
    )
  }

  #loop(source: PickSource, index: number, zoom: number): Cubic {
    const node = source.edges.source[index] ?? 0
    const size = (source.nodes.size[node] ?? 0) / 2
    const radius = Math.max(source.nodes.screenUnits[node] === 1 ? size : size * zoom, 1.25)
    const reach = loopReach(radius, source.edges.bend[index] ?? 0, loopMinimum) / zoom
    return loopCurve(source.positions.x(node), source.positions.y(node), reach)
  }

  #radius(source: PickSource, index: number, zoom: number): number {
    const size = (source.nodes.size[index] ?? 0) / 2
    const radius = source.nodes.screenUnits[index] === 1 ? size / zoom : size
    return Math.max(radius, minimumPickRadius / zoom)
  }

  #pickNode(
    source: PickSource,
    x: number,
    y: number,
    sight: Sight,
    scale: number,
    lens: PickSurface | null,
  ): number {
    const reach = Math.max(
      this.#maxWorldRadius,
      (this.#maxScreenRadius + minimumPickRadius) / scale,
    )
    let best = -1
    let bestOrder = Number.NEGATIVE_INFINITY
    const nodeGrid = this.#nodes
    const generations = this.#nodeGeneration
    this.#around(this.#frame, 0, nodeGrid, generations, this.#extraNodes, x, y, reach, (index) => {
      if (!pickable(source.nodes, index) || !nodeShown(source.nodes, index, sight)) return
      if (lens && !lens.visible(index)) return
      const distance = Math.hypot(x - source.positions.x(index), y - source.positions.y(index))
      if (distance > this.#radius(source, index, scale)) return
      const order = source.order('nodes', index)
      if (order > bestOrder) {
        best = index
        bestOrder = order
      }
    })
    return best
  }

  #pickEdge(
    source: PickSource,
    x: number,
    y: number,
    sight: Sight,
    scale: number,
    tolerance: number,
  ): number {
    const { edges, positions } = source
    const reach = (this.#maxEdgeHalfWidth + tolerance) / scale
    let best = -1
    let bestDistance = Number.POSITIVE_INFINITY
    let bestOrder = Number.NEGATIVE_INFINITY
    const consider = (index: number, distance: number) => {
      if (distance > ((edges.width[index] ?? 0) / 2 + tolerance) / scale) return
      const order = source.order('edges', index)
      if (distance < bestDistance || (distance === bestDistance && order > bestOrder)) {
        best = index
        bestDistance = distance
        bestOrder = order
      }
    }
    const seen = new Set<number>()
    const visit = (index: number) => {
      if (edges.alive[index] !== 1 || !edgeShown(source.nodes, edges, index, sight)) return
      const s = edges.source[index] ?? 0
      const t = edges.target[index] ?? 0
      const paths = source.paths
      if (paths && paths.count(index) > 1) {
        if (seen.has(index)) return
        seen.add(index)
        const count = paths.polyline(index, edges, positions, paths.mix, this.#polyline)
        consider(index, distanceToPolyline(this.#polyline, count, x, y))
        return
      }
      if (edges.geodesic[index] === 1) {
        if (seen.has(index)) return
        seen.add(index)
        const points = this.#arc(source, index)
        consider(index, distanceToPolyline(points, points.length / 2, x, y))
        return
      }
      if ((edges.bend[index] ?? 0) !== 0) {
        if (seen.has(index)) return
        seen.add(index)
        consider(index, distanceToCubic(this.#parallel(source, index), x, y, pickSegments))
        return
      }
      const ax = positions.x(s)
      const ay = positions.y(s)
      const dx = positions.x(t) - ax
      const dy = positions.y(t) - ay
      const length = Math.hypot(dx, dy)
      if (length === 0) return
      const along = ((x - ax) * dx + (y - ay) * dy) / length
      if (
        along < this.#radius(source, s, scale) ||
        along > length - this.#radius(source, t, scale)
      ) {
        return
      }
      consider(index, Math.abs((x - ax) * dy - (y - ay) * dx) / length)
    }
    this.#levels.forEach((frame, level) => {
      const extra = level === 0 ? this.#extraEdges : null
      const base = this.#bases[level] ?? 0
      this.#around(frame, base, this.#edges, this.#edgeGeneration, extra, x, y, reach, visit)
    })
    const loop = (index: number) => {
      if (edges.alive[index] !== 1 || !edgeShown(source.nodes, edges, index, sight)) return
      consider(index, distanceToCubic(this.#loop(source, index, scale), x, y, pickSegments))
    }
    for (const index of this.#loops) if ((this.#edgeGeneration[index] ?? 0) === 0) loop(index)
    visitStamped(this.#extraLoops, this.#edgeGeneration, loop)
    return best
  }
}
