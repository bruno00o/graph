import type { BridgeShape } from '../types'
import type { EdgeColumns } from './columns'
import { type EdgePaths, type PathPoint, pathTextureWidth } from './edge-paths'
import type { Positions } from './positions'

export const bridgesPerSegment = 8
export const bridgesPerEdge = 64

const sliceCells = 512
const maxCells = 1 << 22
const maxEntries = 1 << 23
const maxTests = 60_000_000
const straightShare = 1e-6
const edgeShare = 1e-6

export interface BridgeSource {
  readonly edges: EdgeColumns
  readonly positions: Positions
  readonly paths: EdgePaths | null
  readonly radius: (node: number) => number
  readonly maxEdges: number
}

export class BridgeSet {
  capacity = 0
  count = 0
  version = 0
  shape: BridgeShape = 'arc'
  size = 8
  data: Uint32Array = new Uint32Array(0)

  firstOf(edge: number): number {
    return edge < this.capacity ? (this.data[edge * 4] ?? 0) : 0
  }

  countOf(edge: number): number {
    return edge < this.capacity ? (this.data[edge * 4 + 1] ?? 0) : 0
  }

  clear(): void {
    if (this.count === 0 && this.capacity === 0) return
    this.capacity = 0
    this.count = 0
    this.data = new Uint32Array(0)
    this.version++
  }
}

function padded(texels: number): number {
  return Math.max(1, Math.ceil(texels / pathTextureWidth)) * pathTextureWidth
}

class Growing {
  values: Float64Array = new Float64Array(1024)
  length = 0

  push(value: number): void {
    if (this.length === this.values.length) {
      const next = new Float64Array(this.values.length * 2)
      next.set(this.values)
      this.values = next
    }
    this.values[this.length++] = value
  }
}

export class BridgeFinder {
  readonly #source: BridgeSource
  readonly #coords = new Growing()
  readonly #owners = new Growing()
  readonly #found = new Growing()
  #phase = 0
  #cell = 0
  #tests = 0
  #segments = 0
  #candidates = 0
  #originX = 0
  #originY = 0
  #size = 1
  #columns = 1
  #rows = 1
  #starts: Int32Array = new Int32Array(0)
  #entries: Int32Array = new Int32Array(0)
  #result: BridgeSet | null = null
  over = false

  constructor(source: BridgeSource) {
    this.#source = source
  }

  step(until: number, into: BridgeSet): BridgeSet | null {
    if (this.#result) return this.#result
    if (this.#phase === 0) {
      this.#collect()
      if (this.over || this.#segments < 2) return this.#finish(into)
      this.#grid()
      this.#phase = 1
    }
    const cells = this.#columns * this.#rows
    while (this.#cell < cells) {
      const last = Math.min(cells, this.#cell + sliceCells)
      for (let cell = this.#cell; cell < last; cell++) this.#scan(cell)
      this.#cell = last
      if (this.#tests > maxTests) break
      if (performance.now() >= until) return null
    }
    return this.#finish(into)
  }

  #collect(): void {
    const { edges, positions, paths, maxEdges } = this.#source
    const point: PathPoint = { x: 0, y: 0 }
    const next: PathPoint = { x: 0, y: 0 }
    const coords = this.#coords
    const owners = this.#owners
    for (let edge = 0; edge < edges.capacity; edge++) {
      if (edges.alive[edge] !== 1 || edges.bridge[edge] !== 1) continue
      const source = edges.source[edge] ?? 0
      const target = edges.target[edge] ?? 0
      if (source === target || edges.geodesic[edge] === 1) continue
      const count = paths ? paths.count(edge) : 0
      const sx = positions.x(source)
      const sy = positions.y(source)
      const tx = positions.x(target)
      const ty = positions.y(target)
      if (count > 1) {
        if (!paths || paths.lanes) continue
        if (++this.#candidates > maxEdges) {
          this.over = true
          return
        }
        paths.point(edge, 0, sx, sy, tx, ty, 0, 1, point)
        for (let k = 1; k < count; k++) {
          paths.point(edge, k, sx, sy, tx, ty, 0, 1, next)
          if (next.x !== point.x || next.y !== point.y) {
            coords.push(point.x)
            coords.push(point.y)
            coords.push(next.x)
            coords.push(next.y)
            owners.push(edge)
            owners.push(k - 1)
          }
          point.x = next.x
          point.y = next.y
        }
        continue
      }
      if ((edges.bend[edge] ?? 0) !== 0 || (sx === tx && sy === ty)) continue
      if (++this.#candidates > maxEdges) {
        this.over = true
        return
      }
      coords.push(sx)
      coords.push(sy)
      coords.push(tx)
      coords.push(ty)
      owners.push(edge)
      owners.push(0)
    }
    this.#segments = owners.length >> 1
  }

  #grid(): void {
    const coords = this.#coords.values
    const segments = this.#segments
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    let total = 0
    for (let at = 0; at < segments * 4; at += 4) {
      const x0 = coords[at] ?? 0
      const y0 = coords[at + 1] ?? 0
      const x1 = coords[at + 2] ?? 0
      const y1 = coords[at + 3] ?? 0
      minX = Math.min(minX, x0, x1)
      minY = Math.min(minY, y0, y1)
      maxX = Math.max(maxX, x0, x1)
      maxY = Math.max(maxY, y0, y1)
      total += Math.abs(x1 - x0) + Math.abs(y1 - y0)
    }
    const width = Math.max(maxX - minX, 1e-9)
    const height = Math.max(maxY - minY, 1e-9)
    let size = Math.max(total / segments, Math.sqrt((width * height) / segments), 1e-9)
    for (;;) {
      this.#originX = minX
      this.#originY = minY
      this.#size = size
      this.#columns = Math.floor(width / size) + 1
      this.#rows = Math.floor(height / size) + 1
      if (this.#columns * this.#rows <= maxCells && this.#walkAll(null) <= maxEntries) break
      size *= 2
    }
    const cells = this.#columns * this.#rows
    const starts = new Int32Array(cells + 1)
    this.#walkAll(starts)
    for (let cell = 0; cell < cells; cell++) {
      starts[cell + 1] = (starts[cell + 1] ?? 0) + (starts[cell] ?? 0)
    }
    const entries = new Int32Array(starts[cells] ?? 0)
    const cursor = starts.slice(0, cells)
    for (let segment = 0; segment < segments; segment++) {
      this.#walk(segment, (cell) => {
        const at = cursor[cell] ?? 0
        entries[at] = segment
        cursor[cell] = at + 1
      })
    }
    this.#starts = starts
    this.#entries = entries
  }

  #walkAll(counts: Int32Array | null): number {
    let total = 0
    for (let segment = 0; segment < this.#segments; segment++) {
      total += this.#walk(
        segment,
        counts
          ? (cell) => {
              counts[cell + 1] = (counts[cell + 1] ?? 0) + 1
            }
          : null,
      )
      if (!counts && total > maxEntries) return total
    }
    return total
  }

  #cellX(x: number): number {
    return Math.min(this.#columns - 1, Math.max(0, Math.floor((x - this.#originX) / this.#size)))
  }

  #cellY(y: number): number {
    return Math.min(this.#rows - 1, Math.max(0, Math.floor((y - this.#originY) / this.#size)))
  }

  #walk(segment: number, visit: ((cell: number) => void) | null): number {
    const coords = this.#coords.values
    const x0 = coords[segment * 4] ?? 0
    const y0 = coords[segment * 4 + 1] ?? 0
    const x1 = coords[segment * 4 + 2] ?? 0
    const y1 = coords[segment * 4 + 3] ?? 0
    const size = this.#size
    let ix = this.#cellX(x0)
    let iy = this.#cellY(y0)
    const jx = this.#cellX(x1)
    const jy = this.#cellY(y1)
    const dx = x1 - x0
    const dy = y1 - y0
    const stepX = dx > 0 ? 1 : -1
    const stepY = dy > 0 ? 1 : -1
    let nextX =
      dx !== 0
        ? ((ix + (dx > 0 ? 1 : 0)) * size + this.#originX - x0) / dx
        : Number.POSITIVE_INFINITY
    let nextY =
      dy !== 0
        ? ((iy + (dy > 0 ? 1 : 0)) * size + this.#originY - y0) / dy
        : Number.POSITIVE_INFINITY
    const deltaX = dx !== 0 ? size / Math.abs(dx) : Number.POSITIVE_INFINITY
    const deltaY = dy !== 0 ? size / Math.abs(dy) : Number.POSITIVE_INFINITY
    let visited = 1
    visit?.(iy * this.#columns + ix)
    let guard = Math.abs(jx - ix) + Math.abs(jy - iy)
    while ((ix !== jx || iy !== jy) && guard-- > 0) {
      if (nextX < nextY ? ix !== jx : iy === jy) {
        ix += stepX
        nextX += deltaX
      } else {
        iy += stepY
        nextY += deltaY
      }
      visited++
      visit?.(iy * this.#columns + ix)
    }
    return visited
  }

  #scan(cell: number): void {
    const starts = this.#starts
    const from = starts[cell] ?? 0
    const to = starts[cell + 1] ?? 0
    if (to - from < 2) return
    const entries = this.#entries
    const coords = this.#coords.values
    const owners = this.#owners.values
    const { edges, radius, positions } = this.#source
    this.#tests += ((to - from) * (to - from - 1)) / 2
    for (let a = from; a < to; a++) {
      const i = entries[a] ?? 0
      const edgeA = owners[i * 2] ?? 0
      const ax0 = coords[i * 4] ?? 0
      const ay0 = coords[i * 4 + 1] ?? 0
      const ax1 = coords[i * 4 + 2] ?? 0
      const ay1 = coords[i * 4 + 3] ?? 0
      const rx = ax1 - ax0
      const ry = ay1 - ay0
      for (let b = a + 1; b < to; b++) {
        const j = entries[b] ?? 0
        const edgeB = owners[j * 2] ?? 0
        if (edgeA === edgeB) continue
        const bx0 = coords[j * 4] ?? 0
        const by0 = coords[j * 4 + 1] ?? 0
        const bx1 = coords[j * 4 + 2] ?? 0
        const by1 = coords[j * 4 + 3] ?? 0
        if (
          Math.max(ax0, ax1) < Math.min(bx0, bx1) ||
          Math.max(bx0, bx1) < Math.min(ax0, ax1) ||
          Math.max(ay0, ay1) < Math.min(by0, by1) ||
          Math.max(by0, by1) < Math.min(ay0, ay1)
        ) {
          continue
        }
        const sx = bx1 - bx0
        const sy = by1 - by0
        const denominator = rx * sy - ry * sx
        const scale = Math.hypot(rx, ry) * Math.hypot(sx, sy)
        if (Math.abs(denominator) <= scale * edgeShare) continue
        const wx = bx0 - ax0
        const wy = by0 - ay0
        const t = (wx * sy - wy * sx) / denominator
        const u = (wx * ry - wy * rx) / denominator
        if (t <= edgeShare || t >= 1 - edgeShare || u <= edgeShare || u >= 1 - edgeShare) continue
        const x = ax0 + rx * t
        const y = ay0 + ry * t
        if (this.#cellY(y) * this.#columns + this.#cellX(x) !== cell) continue
        if (
          inside(positions, radius, edges.source[edgeA] ?? 0, x, y) ||
          inside(positions, radius, edges.target[edgeA] ?? 0, x, y) ||
          inside(positions, radius, edges.source[edgeB] ?? 0, x, y) ||
          inside(positions, radius, edges.target[edgeB] ?? 0, x, y)
        ) {
          continue
        }
        const horizontalA = Math.abs(ry) <= Math.abs(rx) * straightShare
        const verticalA = Math.abs(rx) <= Math.abs(ry) * straightShare
        const horizontalB = Math.abs(sy) <= Math.abs(sx) * straightShare
        const verticalB = Math.abs(sx) <= Math.abs(sy) * straightShare
        let jumpsA: boolean
        if (horizontalA && verticalB) jumpsA = true
        else if (verticalA && horizontalB) jumpsA = false
        else {
          const slotA = edges.slot[edgeA] ?? 0
          const slotB = edges.slot[edgeB] ?? 0
          jumpsA = slotA !== slotB ? slotA > slotB : edgeA > edgeB
        }
        const found = this.#found
        if (jumpsA) {
          found.push(edgeA)
          found.push(owners[i * 2 + 1] ?? 0)
          found.push(edgeB)
          found.push(owners[j * 2 + 1] ?? 0)
          found.push(t)
        } else {
          found.push(edgeB)
          found.push(owners[j * 2 + 1] ?? 0)
          found.push(edgeA)
          found.push(owners[i * 2 + 1] ?? 0)
          found.push(u)
        }
      }
    }
  }

  #finish(into: BridgeSet): BridgeSet {
    const found = this.#found
    const values = found.values
    const total = found.length / 5
    const order = new Uint32Array(total)
    for (let k = 0; k < total; k++) order[k] = k
    order.sort((p, q) => {
      const a = p * 5
      const b = q * 5
      return (
        (values[a] ?? 0) - (values[b] ?? 0) ||
        (values[a + 1] ?? 0) - (values[b + 1] ?? 0) ||
        (values[a + 4] ?? 0) - (values[b + 4] ?? 0)
      )
    })
    const capacity = padded(this.#source.edges.capacity)
    const kept: number[] = []
    let edge = -1
    let segment = -1
    let perEdge = 0
    let perSegment = 0
    for (const at of order) {
      const owner = values[at * 5] ?? 0
      const own = values[at * 5 + 1] ?? 0
      if (owner !== edge) {
        edge = owner
        segment = -1
        perEdge = 0
      }
      if (own !== segment) {
        segment = own
        perSegment = 0
      }
      if (perEdge >= bridgesPerEdge || perSegment >= bridgesPerSegment) continue
      perEdge++
      perSegment++
      kept.push(at)
    }
    const data = new Uint32Array(padded(capacity + kept.length) * 4)
    kept.forEach((at, index) => {
      const owner = values[at * 5] ?? 0
      const slot = capacity + index
      if ((data[owner * 4 + 1] ?? 0) === 0) data[owner * 4] = slot
      data[owner * 4 + 1] = (data[owner * 4 + 1] ?? 0) + 1
      data[slot * 4] = values[at * 5 + 2] ?? 0
      data[slot * 4 + 1] = values[at * 5 + 1] ?? 0
      data[slot * 4 + 2] = values[at * 5 + 3] ?? 0
    })
    into.capacity = capacity
    into.count = kept.length
    into.data = data
    into.version++
    this.#result = into
    return into
  }
}

function inside(
  positions: Positions,
  radius: (node: number) => number,
  node: number,
  x: number,
  y: number,
): boolean {
  const r = radius(node)
  const dx = x - positions.x(node)
  const dy = y - positions.y(node)
  return dx * dx + dy * dy < r * r
}
