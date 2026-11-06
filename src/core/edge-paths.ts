import type { BundlePaths } from '../types'
import type { EdgeColumns } from './columns'
import type { Positions } from './positions'

export const pathClasses: readonly number[] = [5, 9, 17, 33]
export const maxPathPoints = 33
export const pathTextureWidth = 1024

const resolution = 64
const pointBudget = pathTextureWidth * 8192
const flatShare = 1e-3

export interface PathPoint {
  x: number
  y: number
}

export interface PathResult {
  readonly edges: Uint32Array
  readonly ends: Uint32Array
  readonly paths: BundlePaths
}

function padded(points: number): number {
  return Math.max(1, Math.ceil(points / pathTextureWidth)) * pathTextureWidth
}

export class EdgePaths {
  capacity = 0
  version = 0
  pointsVersion = 0
  mix = 1
  bundled = 0
  info: Uint32Array = new Uint32Array(0)
  lengths: Float32Array = new Float32Array(0)
  data: Float32Array = new Float32Array(0)
  ends: Uint32Array = new Uint32Array(0)
  reach: Float32Array = new Float32Array(0)

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
    this.capacity = size
    this.version++
  }

  count(edge: number): number {
    return edge < this.capacity ? (this.info[edge * 4 + 1] ?? 0) : 0
  }

  length(edge: number, mix: number = this.mix): number {
    const from = this.lengths[edge * 4 + 2] ?? 0
    const to = this.lengths[edge * 4 + 3] ?? 0
    return from + (to - from) * mix
  }

  clear(edge: number): void {
    if (this.count(edge) === 0) return
    this.info[edge * 4 + 1] = 0
    this.reach[edge] = 0
    this.bundled--
    this.version++
  }

  validateAll(edges: EdgeColumns): void {
    if (this.bundled === 0) return
    for (let edge = 0; edge < this.capacity; edge++) {
      if ((this.info[edge * 4 + 1] ?? 0) === 0) continue
      if (
        edges.alive[edge] !== 1 ||
        edges.bundle[edge] !== 1 ||
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
    const count = this.info[edge * 4 + 1] ?? 0
    const u = count > 1 ? k / (count - 1) : 0
    const at = ((this.info[edge * 4] ?? 0) + k) * 4
    const fx = this.data[at] ?? 0
    const fy = this.data[at + 1] ?? 0
    let x = sx + (tx - sx) * u + fx + ((this.data[at + 2] ?? 0) - fx) * mix
    let y = sy + (ty - sy) * u + fy + ((this.data[at + 3] ?? 0) - fy) * mix
    if (bend !== 0) {
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
    const old = { info: this.info.slice(), lengths: null as Float32Array | null }
    old.lengths = new Float32Array(old.info.buffer)
    const oldData = this.data
    const oldMix = this.mix
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
    while (needed > pointBudget && spacing < extent) {
      spacing *= 2
      measure()
    }
    const data = new Float32Array(padded(needed) * 4)
    const info = this.info
    const lengths = this.lengths
    info.fill(0)
    let cursor = 0
    let bundled = 0
    const previous = (edge: number, u: number, out: PathPoint): void => {
      const count = old.info[edge * 4 + 1] ?? 0
      if (count < 2) {
        out.x = 0
        out.y = 0
        return
      }
      const f = u * (count - 1)
      const k = Math.min(count - 2, Math.floor(f))
      const t = f - k
      const at = ((old.info[edge * 4] ?? 0) + k) * 4
      const ax = (oldData[at] ?? 0) + ((oldData[at + 2] ?? 0) - (oldData[at] ?? 0)) * oldMix
      const ay = (oldData[at + 1] ?? 0) + ((oldData[at + 3] ?? 0) - (oldData[at + 1] ?? 0)) * oldMix
      const bx = (oldData[at + 4] ?? 0) + ((oldData[at + 6] ?? 0) - (oldData[at + 4] ?? 0)) * oldMix
      const by = (oldData[at + 5] ?? 0) + ((oldData[at + 7] ?? 0) - (oldData[at + 5] ?? 0)) * oldMix
      out.x = ax + (bx - ax) * t
      out.y = ay + (by - ay) * t
    }
    const oldLength = (edge: number, chord: number): number => {
      if ((old.info[edge * 4 + 1] ?? 0) === 0) return chord
      const from = old.lengths?.[edge * 4 + 2] ?? chord
      const to = old.lengths?.[edge * 4 + 3] ?? chord
      return from + (to - from) * oldMix
    }
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
        previous(edge, u, before)
        reach = Math.max(reach, Math.hypot(before.x, before.y))
        data[(at + k) * 4] = before.x
        data[(at + k) * 4 + 1] = before.y
        data[(at + k) * 4 + 2] = dx
        data[(at + k) * 4 + 3] = dy
      }
      if (reach < flat) return
      info[edge * 4] = at
      info[edge * 4 + 1] = size
      lengths[edge * 4 + 2] = oldLength(edge, chord)
      lengths[edge * 4 + 3] = Math.max(length, chord)
      this.reach[edge] = reach
      cursor += size
      bundled++
    })
    for (let edge = 0; edge < kept.length; edge++) {
      const count = old.info[edge * 4 + 1] ?? 0
      if (count === 0 || kept[edge] === 1) continue
      const source = this.ends[edge * 2] ?? 0
      const target = this.ends[edge * 2 + 1] ?? 0
      const chord = Math.hypot(
        positions.x(target) - positions.x(source),
        positions.y(target) - positions.y(source),
      )
      const at = cursor
      for (let k = 0; k < count; k++) {
        previous(edge, k / (count - 1), before)
        data[(at + k) * 4] = before.x
        data[(at + k) * 4 + 1] = before.y
        data[(at + k) * 4 + 2] = 0
        data[(at + k) * 4 + 3] = 0
      }
      info[edge * 4] = at
      info[edge * 4 + 1] = count
      lengths[edge * 4 + 2] = oldLength(edge, chord)
      lengths[edge * 4 + 3] = chord
      cursor += count
      bundled++
    }
    this.data = data
    this.bundled = bundled
    this.mix = 0
    this.version++
    this.pointsVersion++
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
  }
}
