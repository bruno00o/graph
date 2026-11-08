import { dev } from '../dev'
import type { BundlePaths } from '../types'
import type { EdgeColumns } from './columns'
import { type EdgeWaypoints, wrapShift } from './edge-waypoints'
import type { Positions } from './positions'
import { type Outline, type RouteShape, shapeRoute } from './route-shape'

export const pathClasses: readonly number[] = [5, 9, 17, 33]
export const maxPathPoints = 33
export const pathTextureWidth = 1024

const resolution = 64
export const defaultPointBudget: number = pathTextureWidth * 8192
const flatShare = 1e-3

export interface PathPoint {
  x: number
  y: number
}

export interface PathSpot {
  x: number
  y: number
  dx: number
  dy: number
}

export interface PathResult {
  readonly edges: Uint32Array
  readonly ends: Uint32Array
  readonly paths: BundlePaths
}

export type OutlineOf = (index: number, out: Outline) => Outline

interface Previous {
  readonly info: Uint32Array
  readonly lengths: Float32Array
  readonly data: Float32Array
  readonly stations: Float32Array
  readonly measured: boolean
  readonly mix: number
}

function padded(points: number): number {
  return Math.max(1, Math.ceil(points / pathTextureWidth)) * pathTextureWidth
}

let warnedStraight = false

function warnStraight(): void {
  if (!dev || warnedStraight) return
  warnedStraight = true
  console.warn('graph: edge paths do not fit on this device, some edges are drawn straight')
}

const scratch: PathPoint = { x: 0, y: 0 }

function emptyOutline(): Outline {
  return { x: 0, y: 0, shape: 0, radius: 0, halfWidth: 0, halfHeight: 0, corner: 0, trim: 0 }
}

export class EdgePaths {
  capacity = 0
  #version = 0
  pointsVersion = 0
  fixed: EdgeWaypoints | null = null
  mix = 1
  bundled = 0
  lanes = true
  measured = false
  info: Uint32Array = new Uint32Array(0)
  lengths: Float32Array = new Float32Array(0)
  data: Float32Array = new Float32Array(0)
  stations: Float32Array = new Float32Array(0)
  curved: Uint8Array = new Uint8Array(0)
  ends: Uint32Array = new Uint32Array(0)
  reach: Float32Array = new Float32Array(0)
  rooms: Float32Array = new Float32Array(0)
  pointBudget: number = defaultPointBudget

  reserve(capacity: number): void {
    if (capacity <= this.capacity) return
    const size = padded(Math.max(capacity, this.capacity * 2))
    const buffer = new ArrayBuffer(size * 16)
    const info = new Uint32Array(buffer)
    info.set(this.info)
    this.info = info
    this.lengths = new Float32Array(buffer)
    const ends = new Uint32Array(size * 2)
    ends.set(this.ends)
    this.ends = ends
    const reach = new Float32Array(size)
    reach.set(this.reach)
    this.reach = reach
    const rooms = new Float32Array(size)
    rooms.set(this.rooms)
    this.rooms = rooms
    this.capacity = size
    this.#version++
  }

  get version(): number {
    return this.#version + (this.fixed?.version ?? 0)
  }

  get relativeVersion(): number {
    return this.#version
  }

  get any(): boolean {
    return this.bundled > 0 || (this.fixed !== null && this.fixed.edges > 0)
  }

  get longest(): number {
    return Math.max(maxPathPoints, (this.fixed?.longest ?? 0) + 2)
  }

  isFixed(edge: number): boolean {
    const fixed = this.fixed
    return fixed !== null && edge < fixed.capacity && (fixed.count[edge] ?? 0) > 0
  }

  count(edge: number): number {
    const fixed = this.fixed
    if (fixed !== null && edge < fixed.capacity) {
      const inner = fixed.count[edge] ?? 0
      if (inner > 0) return inner + 2
    }
    return edge < this.capacity ? (this.info[edge * 4 + 1] ?? 0) : 0
  }

  #relativeCount(edge: number): number {
    return edge < this.capacity ? (this.info[edge * 4 + 1] ?? 0) : 0
  }

  wraps(edge: number, sx: number, tx: number, out: PathPoint): PathPoint {
    const fixed = this.fixed
    out.x = 0
    out.y = 0
    if (fixed?.geo[edge] !== 1) return out
    const first = fixed.start[edge] ?? 0
    const last = first + (fixed.count[edge] ?? 1) - 1
    out.x = wrapShift(sx, fixed.points[first * 2] ?? 0)
    out.y = wrapShift(tx, fixed.points[last * 2] ?? 0)
    return out
  }

  #fixedPoint(
    edge: number,
    k: number,
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    out: PathPoint,
  ): void {
    const fixed = this.fixed as EdgeWaypoints
    const inner = fixed.count[edge] ?? 0
    const wraps = this.wraps(edge, sx, tx, scratch)
    if (k <= 0) {
      out.x = sx
      out.y = sy
    } else if (k > inner) {
      out.x = tx + wraps.y - wraps.x
      out.y = ty
    } else {
      const at = ((fixed.start[edge] ?? 0) + k - 1) * 2
      out.x = (fixed.points[at] ?? 0) - wraps.x
      out.y = fixed.points[at + 1] ?? 0
    }
  }

  fixedLength(edge: number, sx: number, sy: number, tx: number, ty: number): number {
    const fixed = this.fixed
    if (!fixed) return 0
    const inner = fixed.count[edge] ?? 0
    const first = (fixed.start[edge] ?? 0) * 2
    const last = first + (inner - 1) * 2
    const wraps = this.wraps(edge, sx, tx, scratch)
    const points = fixed.points
    const head = Math.hypot((points[first] ?? 0) - wraps.x - sx, (points[first + 1] ?? 0) - sy)
    const tail = Math.hypot(tx + wraps.y - (points[last] ?? 0), ty - (points[last + 1] ?? 0))
    return head + (fixed.length[edge] ?? 0) + tail
  }

  fixedAt(
    edge: number,
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    distance: number,
    out: PathSpot,
  ): void {
    const fixed = this.fixed as EdgeWaypoints
    const inner = fixed.count[edge] ?? 0
    const first = fixed.start[edge] ?? 0
    const wraps = this.wraps(edge, sx, tx, scratch)
    const points = fixed.points
    const px = (points[first * 2] ?? 0) - wraps.x
    const py = points[first * 2 + 1] ?? 0
    const qx = (points[(first + inner - 1) * 2] ?? 0) - wraps.x
    const qy = points[(first + inner - 1) * 2 + 1] ?? 0
    const ex = tx + wraps.y - wraps.x
    const head = Math.hypot(px - sx, py - sy)
    const body = fixed.length[edge] ?? 0
    let ax = sx
    let ay = sy
    let bx = px
    let by = py
    let t = head > 0 ? distance / head : 0
    if (distance > head && inner > 1 && distance < head + body) {
      const goal = distance - head
      let lo = 0
      let hi = inner - 1
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if ((fixed.along[first + mid] ?? 0) <= goal) lo = mid
        else hi = mid
      }
      const from = fixed.along[first + lo] ?? 0
      const span = (fixed.along[first + hi] ?? from) - from
      ax = (points[(first + lo) * 2] ?? 0) - wraps.x
      ay = points[(first + lo) * 2 + 1] ?? 0
      bx = (points[(first + hi) * 2] ?? 0) - wraps.x
      by = points[(first + hi) * 2 + 1] ?? 0
      t = span > 0 ? (goal - from) / span : 0
    } else if (distance >= head + body) {
      const tail = Math.hypot(ex - qx, ty - qy)
      ax = qx
      ay = qy
      bx = ex
      by = ty
      t = tail > 0 ? (distance - head - body) / tail : 1
    }
    t = Math.min(1, Math.max(0, t))
    out.x = ax + (bx - ax) * t
    out.y = ay + (by - ay) * t
    out.dx = bx - ax
    out.dy = by - ay
  }

  slack(edge: number, ax: number, ay: number, bx: number, by: number): number {
    const fixed = this.fixed
    if (fixed === null || edge >= fixed.capacity || (fixed.count[edge] ?? 0) === 0) {
      return this.reach[edge] ?? 0
    }
    const wraps = this.wraps(edge, ax, bx, scratch)
    const low = Math.min(wraps.x, wraps.y)
    const high = Math.max(wraps.x, wraps.y)
    const at = edge * 4
    const minX = (fixed.bounds[at] ?? 0) - high
    const maxX = (fixed.bounds[at + 2] ?? 0) - low
    const minY = fixed.bounds[at + 1] ?? 0
    const maxY = fixed.bounds[at + 3] ?? 0
    const spread = Math.abs(wraps.y - wraps.x)
    return Math.max(
      0,
      Math.min(ax, bx) - minX,
      maxX - Math.max(ax, bx),
      Math.min(ay, by) - minY,
      maxY - Math.max(ay, by),
      spread,
    )
  }

  fixedBounds(edge: number, sx: number, tx: number, out: Float64Array): boolean {
    const fixed = this.fixed
    if (fixed === null || edge >= fixed.capacity || (fixed.count[edge] ?? 0) === 0) return false
    const wraps = this.wraps(edge, sx, tx, scratch)
    const at = edge * 4
    out[0] = (fixed.bounds[at] ?? 0) - wraps.x
    out[1] = fixed.bounds[at + 1] ?? 0
    out[2] = (fixed.bounds[at + 2] ?? 0) - wraps.x
    out[3] = fixed.bounds[at + 3] ?? 0
    return true
  }

  length(edge: number, mix: number = this.mix): number {
    const from = this.lengths[edge * 4 + 2] ?? 0
    const to = this.lengths[edge * 4 + 3] ?? 0
    return from + (to - from) * mix
  }

  station(edge: number, k: number, mix: number = this.mix): number {
    const count = this.#relativeCount(edge)
    const u = count > 1 ? k / (count - 1) : 0
    if (!this.measured) return u
    const at = ((this.info[edge * 4] ?? 0) + k) * 2
    const from = this.stations[at] ?? u
    return from + ((this.stations[at + 1] ?? u) - from) * mix
  }

  curvedAt(edge: number, k: number): boolean {
    if (this.isFixed(edge)) return false
    return this.curved[(this.info[edge * 4] ?? 0) + k] === 1
  }

  clear(edge: number): void {
    if (this.#relativeCount(edge) === 0) return
    this.info[edge * 4 + 1] = 0
    this.reach[edge] = 0
    this.rooms[edge] = 0
    this.bundled--
    this.#version++
  }

  validateAll(edges: EdgeColumns, column: Uint8Array = edges.bundle): void {
    if (this.bundled === 0) return
    for (let edge = 0; edge < this.capacity; edge++) {
      if ((this.info[edge * 4 + 1] ?? 0) === 0) continue
      if (
        edges.alive[edge] !== 1 ||
        column[edge] !== 1 ||
        edges.source[edge] !== this.ends[edge * 2] ||
        edges.target[edge] !== this.ends[edge * 2 + 1]
      ) {
        this.clear(edge)
      }
    }
  }

  point(
    edge: number,
    k: number,
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    bend: number,
    mix: number,
    out: PathPoint,
  ): void {
    if (this.isFixed(edge)) {
      this.#fixedPoint(edge, k, sx, sy, tx, ty, out)
      return
    }
    const count = this.info[edge * 4 + 1] ?? 0
    const u = count > 1 ? k / (count - 1) : 0
    const at = ((this.info[edge * 4] ?? 0) + k) * 4
    const fx = this.data[at] ?? 0
    const fy = this.data[at + 1] ?? 0
    let x = sx + (tx - sx) * u + fx + ((this.data[at + 2] ?? 0) - fx) * mix
    let y = sy + (ty - sy) * u + fy + ((this.data[at + 3] ?? 0) - fy) * mix
    if (bend !== 0 && this.lanes) {
      const chord = Math.hypot(tx - sx, ty - sy)
      if (chord > 0) {
        const lift = bend * 4 * u * (1 - u)
        x -= (ty - sy) * lift
        y += (tx - sx) * lift
      }
    }
    out.x = x
    out.y = y
  }

  polyline(
    edge: number,
    edges: EdgeColumns,
    positions: Positions,
    mix: number,
    out: Float64Array,
  ): number {
    const count = this.count(edge)
    const source = edges.source[edge] ?? 0
    const target = edges.target[edge] ?? 0
    const sx = positions.x(source)
    const sy = positions.y(source)
    const tx = positions.x(target)
    const ty = positions.y(target)
    const bend = edges.bend[edge] ?? 0
    const point = { x: 0, y: 0 }
    for (let k = 0; k < count; k++) {
      this.point(edge, k, sx, sy, tx, ty, bend, mix, point)
      out[k * 2] = point.x
      out[k * 2 + 1] = point.y
    }
    return count
  }

  #snapshot(): Previous {
    const info = this.info.slice()
    return {
      info,
      lengths: new Float32Array(info.buffer),
      data: this.data,
      stations: this.stations,
      measured: this.measured,
      mix: this.mix,
    }
  }

  #previous(old: Previous, edge: number, u: number, out: PathPoint): number {
    const count = old.info[edge * 4 + 1] ?? 0
    if (count < 2) {
      out.x = 0
      out.y = 0
      return u
    }
    const f = u * (count - 1)
    const k = Math.min(count - 2, Math.floor(f))
    const t = f - k
    const first = (old.info[edge * 4] ?? 0) + k
    const at = first * 4
    const data = old.data
    const mix = old.mix
    const ax = (data[at] ?? 0) + ((data[at + 2] ?? 0) - (data[at] ?? 0)) * mix
    const ay = (data[at + 1] ?? 0) + ((data[at + 3] ?? 0) - (data[at + 1] ?? 0)) * mix
    const bx = (data[at + 4] ?? 0) + ((data[at + 6] ?? 0) - (data[at + 4] ?? 0)) * mix
    const by = (data[at + 5] ?? 0) + ((data[at + 7] ?? 0) - (data[at + 5] ?? 0)) * mix
    out.x = ax + (bx - ax) * t
    out.y = ay + (by - ay) * t
    if (!old.measured) return u
    const stations = old.stations
    const sa =
      (stations[first * 2] ?? 0) +
      ((stations[first * 2 + 1] ?? 0) - (stations[first * 2] ?? 0)) * mix
    const sb =
      (stations[first * 2 + 2] ?? 0) +
      ((stations[first * 2 + 3] ?? 0) - (stations[first * 2 + 2] ?? 0)) * mix
    return sa + (sb - sa) * t
  }

  #oldLength(old: Previous, edge: number, chord: number): number {
    if ((old.info[edge * 4 + 1] ?? 0) === 0) return chord
    const from = old.lengths[edge * 4 + 2] ?? chord
    const to = old.lengths[edge * 4 + 3] ?? chord
    return from + (to - from) * old.mix
  }

  #fade(
    old: Previous,
    kept: Uint8Array,
    cursor: number,
    data: Float32Array,
    stations: Float32Array,
    positions: Positions,
  ): number {
    const before: PathPoint = { x: 0, y: 0 }
    let next = cursor
    for (let edge = 0; edge < kept.length; edge++) {
      const count = old.info[edge * 4 + 1] ?? 0
      if (count === 0 || kept[edge] === 1) continue
      const source = this.ends[edge * 2] ?? 0
      const target = this.ends[edge * 2 + 1] ?? 0
      const chord = Math.hypot(
        positions.x(target) - positions.x(source),
        positions.y(target) - positions.y(source),
      )
      const at = next
      for (let k = 0; k < count; k++) {
        const u = k / (count - 1)
        const s = this.#previous(old, edge, u, before)
        data[(at + k) * 4] = before.x
        data[(at + k) * 4 + 1] = before.y
        data[(at + k) * 4 + 2] = 0
        data[(at + k) * 4 + 3] = 0
        stations[(at + k) * 2] = s
        stations[(at + k) * 2 + 1] = u
      }
      this.info[edge * 4] = at
      this.info[edge * 4 + 1] = count
      this.lengths[edge * 4 + 2] = this.#oldLength(old, edge, chord)
      this.lengths[edge * 4 + 3] = chord
      this.rooms[edge] = 0
      next += count
      this.bundled++
    }
    return next
  }

  #finish(data: Float32Array, stations: Float32Array, measured: boolean): void {
    this.data = data
    this.stations = stations
    this.measured = measured
    this.mix = 0
    this.#version++
    this.pointsVersion++
  }

  start(result: PathResult | null, strength: number, positions: Positions): void {
    const listed = result?.edges ?? new Uint32Array(0)
    const offsets = result?.paths.offsets
    const points = result?.paths.points
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    if (points) {
      for (let at = 0; at + 1 < points.length; at += 2) {
        const x = points[at] ?? 0
        const y = points[at + 1] ?? 0
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    const extent = maxX >= minX ? Math.max(maxX - minX, maxY - minY, 1e-6) : 1
    let spacing = extent / resolution
    const flat = extent * flatShare
    let largest = 0
    for (const edge of listed) largest = Math.max(largest, edge + 1)
    this.reserve(largest)
    const old = this.#snapshot()
    const counts = new Uint8Array(listed.length)
    let needed = 0
    let cumulative = new Float64Array(64)
    const sizeOf = (index: number): number => {
      const first = offsets?.[index] ?? 0
      const last = (offsets?.[index + 1] ?? first) - 1
      if (!points || last <= first) return 0
      let length = 0
      for (let k = first; k < last; k++) {
        length += Math.hypot(
          (points[(k + 1) * 2] ?? 0) - (points[k * 2] ?? 0),
          (points[(k + 1) * 2 + 1] ?? 0) - (points[k * 2 + 1] ?? 0),
        )
      }
      const wanted = Math.round(length / spacing) + 1
      return pathClasses.find((size) => size >= wanted) ?? maxPathPoints
    }
    const kept = new Uint8Array(this.capacity)
    const measure = (): void => {
      needed = 0
      listed.forEach((edge, index) => {
        const size = sizeOf(index)
        counts[index] = size
        kept[edge] = 1
        needed += size
      })
      for (let edge = 0; edge < this.capacity; edge++) {
        if (kept[edge] !== 1) needed += old.info[edge * 4 + 1] ?? 0
      }
    }
    measure()
    while (needed > this.pointBudget && spacing < extent) {
      spacing *= 2
      measure()
    }
    for (let index = listed.length - 1; index >= 0 && needed > this.pointBudget; index--) {
      needed -= counts[index] ?? 0
      counts[index] = 0
      warnStraight()
    }
    const data = new Float32Array(padded(needed) * 4)
    const stations = new Float32Array(padded(needed) * 2)
    const info = this.info
    const lengths = this.lengths
    info.fill(0)
    let cursor = 0
    this.bundled = 0
    if (result) this.lanes = true
    const before: PathPoint = { x: 0, y: 0 }
    listed.forEach((edge, index) => {
      const size = counts[index] ?? 0
      const source = result?.ends[index * 2] ?? 0
      const target = result?.ends[index * 2 + 1] ?? 0
      this.ends[edge * 2] = source
      this.ends[edge * 2 + 1] = target
      if (size === 0 || !points || !offsets) return
      const first = offsets[index] ?? 0
      const last = (offsets[index + 1] ?? first) - 1
      const span = last - first
      if (cumulative.length < span + 1) cumulative = new Float64Array(span + 1)
      cumulative[0] = 0
      for (let k = 1; k <= span; k++) {
        cumulative[k] =
          (cumulative[k - 1] ?? 0) +
          Math.hypot(
            (points[(first + k) * 2] ?? 0) - (points[(first + k - 1) * 2] ?? 0),
            (points[(first + k) * 2 + 1] ?? 0) - (points[(first + k - 1) * 2 + 1] ?? 0),
          )
      }
      const arc = cumulative[span] ?? 0
      const ax = points[first * 2] ?? 0
      const ay = points[first * 2 + 1] ?? 0
      const bx = points[last * 2] ?? 0
      const by = points[last * 2 + 1] ?? 0
      const chord = Math.hypot(bx - ax, by - ay)
      const at = cursor
      let piece = 1
      let reach = 0
      let length = 0
      let lastX = ax
      let lastY = ay
      for (let k = 0; k < size; k++) {
        const u = k / (size - 1)
        let x = ax + (bx - ax) * u
        let y = ay + (by - ay) * u
        if (k > 0 && k < size - 1 && arc > 0) {
          const goal = arc * u
          while (piece < span && (cumulative[piece] ?? 0) < goal) piece++
          const from = cumulative[piece - 1] ?? 0
          const width = (cumulative[piece] ?? 0) - from
          const t = width > 0 ? (goal - from) / width : 0
          const p = first + piece - 1
          const px = (points[p * 2] ?? 0) + ((points[p * 2 + 2] ?? 0) - (points[p * 2] ?? 0)) * t
          const py =
            (points[p * 2 + 1] ?? 0) + ((points[p * 2 + 3] ?? 0) - (points[p * 2 + 1] ?? 0)) * t
          x = px
          y = py
        }
        const dx = (x - (ax + (bx - ax) * u)) * strength
        const dy = (y - (ay + (by - ay) * u)) * strength
        reach = Math.max(reach, Math.hypot(dx, dy))
        const drawnX = ax + (bx - ax) * u + dx
        const drawnY = ay + (by - ay) * u + dy
        if (k > 0) length += Math.hypot(drawnX - lastX, drawnY - lastY)
        lastX = drawnX
        lastY = drawnY
        const s = this.#previous(old, edge, u, before)
        reach = Math.max(reach, Math.hypot(before.x, before.y))
        data[(at + k) * 4] = before.x
        data[(at + k) * 4 + 1] = before.y
        data[(at + k) * 4 + 2] = dx
        data[(at + k) * 4 + 3] = dy
        stations[(at + k) * 2] = s
        stations[(at + k) * 2 + 1] = u
      }
      if (reach < flat) return
      info[edge * 4] = at
      info[edge * 4 + 1] = size
      lengths[edge * 4 + 2] = this.#oldLength(old, edge, chord)
      lengths[edge * 4 + 3] = Math.max(length, chord)
      this.reach[edge] = reach
      this.rooms[edge] = 0
      cursor += size
      this.bundled++
    })
    this.#fade(old, kept, cursor, data, stations, positions)
    this.#finish(data, stations, old.measured)
    this.curved = new Uint8Array(0)
  }

  route(result: PathResult | null, radius: number, outline: OutlineOf, positions: Positions): void {
    const listed = result?.edges ?? new Uint32Array(0)
    const offsets = result?.paths.offsets
    const points = result?.paths.points
    let largest = 0
    for (const edge of listed) largest = Math.max(largest, edge + 1)
    this.reserve(largest)
    const old = this.#snapshot()
    const shapes: (RouteShape | null)[] = []
    const kept = new Uint8Array(this.capacity)
    const start = emptyOutline()
    const end = emptyOutline()
    let needed = 0
    listed.forEach((edge, index) => {
      kept[edge] = 1
      const source = result?.ends[index * 2] ?? 0
      const target = result?.ends[index * 2 + 1] ?? 0
      const first = offsets?.[index] ?? 0
      const last = offsets?.[index + 1] ?? first
      if (!points || last - first < 2) {
        shapes.push(null)
        return
      }
      outline(source, start)
      outline(target, end)
      const shape: RouteShape = { xs: [], ys: [], curved: [], count: 0, room: 0 }
      shapeRoute(points, first, last, radius, start, end, shape)
      shapes.push(shape)
      needed += shape.count
    })
    for (let edge = 0; edge < this.capacity; edge++) {
      if (kept[edge] !== 1) needed += old.info[edge * 4 + 1] ?? 0
    }
    for (let index = shapes.length - 1; index >= 0 && needed > this.pointBudget; index--) {
      needed -= shapes[index]?.count ?? 0
      shapes[index] = null
      warnStraight()
    }
    const data = new Float32Array(padded(needed) * 4)
    const stations = new Float32Array(padded(needed) * 2)
    const curved = new Uint8Array(padded(needed))
    const info = this.info
    const lengths = this.lengths
    info.fill(0)
    this.bundled = 0
    this.lanes = false
    let cursor = 0
    const before: PathPoint = { x: 0, y: 0 }
    listed.forEach((edge, index) => {
      const source = result?.ends[index * 2] ?? 0
      const target = result?.ends[index * 2 + 1] ?? 0
      this.ends[edge * 2] = source
      this.ends[edge * 2 + 1] = target
      const shape = shapes[index]
      if (!shape) return
      const { xs, ys, count } = shape
      for (let k = 0; k < shape.curved.length; k++) curved[cursor + k] = shape.curved[k] ?? 0
      const ax = positions.x(source)
      const ay = positions.y(source)
      const bx = positions.x(target)
      const by = positions.y(target)
      let total = 0
      for (let k = 1; k < count; k++) {
        total += Math.hypot((xs[k] ?? 0) - (xs[k - 1] ?? 0), (ys[k] ?? 0) - (ys[k - 1] ?? 0))
      }
      const at = cursor
      let reach = 0
      let along = 0
      for (let k = 0; k < count; k++) {
        if (k > 0) {
          along += Math.hypot((xs[k] ?? 0) - (xs[k - 1] ?? 0), (ys[k] ?? 0) - (ys[k - 1] ?? 0))
        }
        const u = k / (count - 1)
        const dx = (xs[k] ?? 0) - (ax + (bx - ax) * u)
        const dy = (ys[k] ?? 0) - (ay + (by - ay) * u)
        const s = this.#previous(old, edge, u, before)
        reach = Math.max(reach, Math.hypot(dx, dy), Math.hypot(before.x, before.y))
        data[(at + k) * 4] = before.x
        data[(at + k) * 4 + 1] = before.y
        data[(at + k) * 4 + 2] = dx
        data[(at + k) * 4 + 3] = dy
        stations[(at + k) * 2] = s
        stations[(at + k) * 2 + 1] = total > 0 ? along / total : u
      }
      info[edge * 4] = at
      info[edge * 4 + 1] = count
      lengths[edge * 4 + 2] = this.#oldLength(old, edge, Math.hypot(bx - ax, by - ay))
      lengths[edge * 4 + 3] = total
      this.reach[edge] = reach
      this.rooms[edge] = shape.room
      cursor += count
      this.bundled++
    })
    this.#fade(old, kept, cursor, data, stations, positions)
    this.#finish(data, stations, true)
    this.curved = curved
  }

  settle(): void {
    for (let edge = 0; edge < this.capacity; edge++) {
      const count = this.info[edge * 4 + 1] ?? 0
      if (count === 0) continue
      const first = this.info[edge * 4] ?? 0
      let flat = true
      for (let k = 0; k < count && flat; k++) {
        const at = (first + k) * 4
        flat = this.data[at + 2] === 0 && this.data[at + 3] === 0
      }
      if (flat) this.clear(edge)
    }
    if (this.lanes && this.measured) {
      this.measured = false
      this.pointsVersion++
    }
  }
}
