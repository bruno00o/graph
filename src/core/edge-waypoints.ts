import { dev } from '../dev'
import { projectLatitude, projectLongitude, worldSize } from './geo'

export const maxWaypoints = 8190
export const geoStep = 8

let warnedLong = false

function warnLong(): void {
  if (!dev || warnedLong) return
  warnedLong = true
  console.warn(`graph: an edge has more than ${maxWaypoints} waypoints, some are skipped`)
}

function grown<A extends Uint32Array | Uint8Array | Float64Array>(array: A, length: number): A {
  const next = new (array.constructor as new (length: number) => A)(length)
  next.set(array)
  return next
}

export function wrapShift(from: number, toward: number): number {
  return worldSize * Math.round((toward - from) / worldSize)
}

interface Field {
  readonly x?: unknown
  readonly y?: unknown
  readonly longitude?: unknown
  readonly latitude?: unknown
}

export class EdgeWaypoints {
  capacity = 0
  version = 0
  edges = 0
  geoEdges = 0
  used = 0
  garbage = 0
  longest = 0
  start: Uint32Array = new Uint32Array(0)
  count: Uint32Array = new Uint32Array(0)
  geo: Uint8Array = new Uint8Array(0)
  length: Float64Array = new Float64Array(0)
  bounds: Float64Array = new Float64Array(0)
  points: Float64Array = new Float64Array(0)
  along: Float64Array = new Float64Array(0)
  #xs: Float64Array = new Float64Array(64)
  #ys: Float64Array = new Float64Array(64)
  #read = 0
  #isGeo = false

  reserve(capacity: number): void {
    if (capacity <= this.capacity) return
    const size = Math.max(64, this.capacity * 2, capacity)
    this.start = grown(this.start, size)
    this.count = grown(this.count, size)
    this.geo = grown(this.geo, size)
    this.length = grown(this.length, size)
    this.bounds = grown(this.bounds, size * 4)
    this.capacity = size
  }

  get pointCount(): number {
    return this.used - this.garbage
  }

  set(edge: number, input: unknown): void {
    const read = input === null || input === undefined ? 0 : this.#parse(input)
    if (read === 0) {
      this.clear(edge)
      return
    }
    this.reserve(edge + 1)
    this.#store(edge, read)
  }

  clear(edge: number): void {
    const count = edge < this.capacity ? (this.count[edge] ?? 0) : 0
    if (count === 0) return
    this.garbage += count
    this.count[edge] = 0
    this.edges--
    if (this.geo[edge] === 1) this.geoEdges--
    this.geo[edge] = 0
    this.version++
    if (this.edges === 0) {
      this.used = 0
      this.garbage = 0
      this.longest = 0
    }
  }

  #push(x: number, y: number): void {
    const n = this.#read
    if (n > 0 && this.#xs[n - 1] === x && this.#ys[n - 1] === y) return
    if (n >= this.#xs.length) {
      const xs = new Float64Array(n * 2)
      xs.set(this.#xs)
      this.#xs = xs
      const ys = new Float64Array(n * 2)
      ys.set(this.#ys)
      this.#ys = ys
    }
    this.#xs[n] = x
    this.#ys[n] = y
    this.#read = n + 1
  }

  #parse(input: unknown): number {
    this.#read = 0
    this.#isGeo = false
    if (typeof input !== 'object' || input === null || !(Symbol.iterator in input)) return 0
    let longitude = Number.NaN
    let wasGeo = false
    for (const point of input as Iterable<unknown>) {
      if (typeof point !== 'object' || point === null) continue
      let x: unknown
      let y: unknown
      let geo = false
      if (Array.isArray(point)) {
        x = point[0]
        y = point[1]
      } else {
        const field = point as Field
        if (field.longitude !== undefined || field.latitude !== undefined) {
          geo = true
          x = field.longitude
          y = field.latitude
        } else {
          x = field.x
          y = field.y
        }
      }
      if (typeof x !== 'number' || typeof y !== 'number') continue
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      if (geo) {
        const lon = Number.isNaN(longitude) ? x : x - 360 * Math.round((x - longitude) / 360)
        longitude = lon
        const wx = projectLongitude(lon)
        const wy = projectLatitude(y)
        if (wasGeo && this.#read > 0) this.#split(wx, wy)
        this.#push(wx, wy)
        this.#isGeo = true
      } else {
        this.#push(x, y)
      }
      wasGeo = geo
    }
    if (this.#isGeo && this.#read > 0) {
      const shift = worldSize * Math.floor((this.#xs[0] ?? 0) / worldSize)
      if (shift !== 0) for (let k = 0; k < this.#read; k++) this.#xs[k] = (this.#xs[k] ?? 0) - shift
    }
    if (this.#read > maxWaypoints) this.#thin()
    return this.#read
  }

  #split(x: number, y: number): void {
    const n = this.#read
    const px = this.#xs[n - 1] ?? 0
    const py = this.#ys[n - 1] ?? 0
    const pieces = Math.ceil(Math.hypot(x - px, y - py) / geoStep)
    for (let piece = 1; piece < pieces; piece++) {
      const t = piece / pieces
      this.#push(px + (x - px) * t, py + (y - py) * t)
    }
  }

  #thin(): void {
    warnLong()
    const n = this.#read
    for (let k = 0; k < maxWaypoints; k++) {
      const from = Math.round((k * (n - 1)) / (maxWaypoints - 1))
      this.#xs[k] = this.#xs[from] ?? 0
      this.#ys[k] = this.#ys[from] ?? 0
    }
    this.#read = maxWaypoints
  }

  #allocate(edge: number, n: number): number {
    const before = this.count[edge] ?? 0
    if (before >= n) {
      this.garbage += before - n
      return this.start[edge] ?? 0
    }
    this.garbage += before
    this.count[edge] = 0
    if (this.used + n > this.points.length / 2) {
      if (this.garbage * 2 > this.used) this.#compact()
      if (this.used + n > this.points.length / 2) {
        const size = Math.max(1024, (this.points.length / 2) * 2, this.used + n)
        const points = new Float64Array(size * 2)
        points.set(this.points.subarray(0, this.used * 2))
        this.points = points
        const along = new Float64Array(size)
        along.set(this.along.subarray(0, this.used))
        this.along = along
      }
    }
    const start = this.used
    this.used += n
    return start
  }

  #compact(): void {
    const points = new Float64Array(this.points.length)
    const along = new Float64Array(this.along.length)
    let cursor = 0
    let longest = 0
    for (let edge = 0; edge < this.capacity; edge++) {
      const n = this.count[edge] ?? 0
      if (n === 0) continue
      const first = this.start[edge] ?? 0
      points.set(this.points.subarray(first * 2, (first + n) * 2), cursor * 2)
      along.set(this.along.subarray(first, first + n), cursor)
      this.start[edge] = cursor
      cursor += n
      longest = Math.max(longest, n)
    }
    this.points = points
    this.along = along
    this.used = cursor
    this.garbage = 0
    this.longest = longest
  }

  #store(edge: number, n: number): void {
    const wasGeo = this.geo[edge] === 1
    if ((this.count[edge] ?? 0) === 0) this.edges++
    const start = this.#allocate(edge, n)
    const xs = this.#xs
    const ys = this.#ys
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    let total = 0
    for (let k = 0; k < n; k++) {
      const x = xs[k] ?? 0
      const y = ys[k] ?? 0
      if (k > 0) total += Math.hypot(x - (xs[k - 1] ?? 0), y - (ys[k - 1] ?? 0))
      this.points[(start + k) * 2] = x
      this.points[(start + k) * 2 + 1] = y
      this.along[start + k] = total
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    this.start[edge] = start
    this.count[edge] = n
    this.length[edge] = total
    this.bounds[edge * 4] = minX
    this.bounds[edge * 4 + 1] = minY
    this.bounds[edge * 4 + 2] = maxX
    this.bounds[edge * 4 + 3] = maxY
    const geo = this.#isGeo
    this.geo[edge] = geo ? 1 : 0
    if (geo !== wasGeo) this.geoEdges += geo ? 1 : -1
    this.longest = Math.max(this.longest, n)
    this.version++
  }
}
