import type { BundlePaths } from '../types'

export interface DensitySettings {
  readonly radius: number
  readonly iterations: number
}

export interface DensityTuning {
  readonly decay: number
  readonly pull: number
  readonly smooth: number
  readonly taper: number
  readonly samples: number
  readonly short: number
}

export const densityDefaults: DensitySettings = { radius: 0.06, iterations: 12 }

export const densityTuning: DensityTuning = {
  decay: 0.78,
  pull: 0.3,
  smooth: 0.5,
  taper: 0.18,
  samples: 120,
  short: 1.5,
}

const cellsPerRadius = 3
const maxSide = 1024
const maxSegments = 48

export class DensityBundler {
  readonly count: number
  readonly iterations: number
  readonly offsets: Uint32Array
  readonly x: Float32Array
  readonly y: Float32Array
  #iteration = 0
  readonly #extent: number
  readonly #spacing: number
  readonly #minX: number
  readonly #minY: number
  readonly #width: number
  readonly #height: number
  readonly #radius: number
  #density: Float32Array = new Float32Array(0)
  #scratch: Float32Array = new Float32Array(0)
  readonly #lengths: Float64Array = new Float64Array(maxSegments + 1)
  readonly #rx: Float32Array = new Float32Array(maxSegments + 1)
  readonly #ry: Float32Array = new Float32Array(maxSegments + 1)

  readonly #tuning: DensityTuning

  constructor(
    xy: Float32Array,
    ends: Uint32Array,
    settings: DensitySettings,
    tuning: DensityTuning = densityTuning,
  ) {
    this.#tuning = tuning
    const count = ends.length >>> 1
    this.count = count
    this.iterations = Math.max(0, Math.round(settings.iterations))
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (let at = 0; at < ends.length; at++) {
      const node = ends[at] ?? 0
      const px = xy[node * 2] ?? 0
      const py = xy[node * 2 + 1] ?? 0
      if (px < minX) minX = px
      if (px > maxX) maxX = px
      if (py < minY) minY = py
      if (py > maxY) maxY = py
    }
    if (count === 0) {
      minX = minY = maxX = maxY = 0
    }
    this.#minX = minX
    this.#minY = minY
    this.#width = maxX - minX
    this.#height = maxY - minY
    const extent = Math.max(this.#width, this.#height, 1e-6)
    this.#extent = extent
    this.#spacing = extent / tuning.samples
    this.#radius = Math.max(settings.radius, 0) * extent
    const offsets = new Uint32Array(count + 1)
    for (let edge = 0; edge < count; edge++) {
      const segments = this.#segmentsOf(xy, ends, edge)
      offsets[edge + 1] = (offsets[edge] ?? 0) + segments + 1
    }
    this.offsets = offsets
    const total = offsets[count] ?? 0
    this.x = new Float32Array(total)
    this.y = new Float32Array(total)
    for (let edge = 0; edge < count; edge++) {
      const source = ends[edge * 2] ?? 0
      const target = ends[edge * 2 + 1] ?? 0
      const ax = xy[source * 2] ?? 0
      const ay = xy[source * 2 + 1] ?? 0
      const bx = xy[target * 2] ?? 0
      const by = xy[target * 2 + 1] ?? 0
      const first = offsets[edge] ?? 0
      const segments = (offsets[edge + 1] ?? 0) - first - 1
      for (let k = 0; k <= segments; k++) {
        const u = k / segments
        this.x[first + k] = ax + (bx - ax) * u
        this.y[first + k] = ay + (by - ay) * u
      }
    }
  }

  get done(): boolean {
    return this.#iteration >= this.iterations || this.#radius <= 0
  }

  get progress(): number {
    return this.iterations === 0 ? 1 : Math.min(1, this.#iteration / this.iterations)
  }

  #segmentsOf(xy: Float32Array, ends: Uint32Array, edge: number): number {
    const source = ends[edge * 2] ?? 0
    const target = ends[edge * 2 + 1] ?? 0
    const length = Math.hypot(
      (xy[target * 2] ?? 0) - (xy[source * 2] ?? 0),
      (xy[target * 2 + 1] ?? 0) - (xy[source * 2 + 1] ?? 0),
    )
    if (source === target || !(length > this.#spacing * 2)) return 1
    return Math.min(maxSegments, Math.round(length / this.#spacing))
  }

  step(): void {
    if (this.done) return
    const bandwidth = this.#radius * this.#tuning.decay ** this.#iteration
    const cell = Math.max(bandwidth / cellsPerRadius, this.#extent / (maxSide - 16))
    const reach = Math.max(1, Math.round(bandwidth / cell))
    const margin = reach + 2
    const cols = Math.ceil(this.#width / cell) + margin * 2 + 1
    const rows = Math.ceil(this.#height / cell) + margin * 2 + 1
    const originX = this.#minX - margin * cell
    const originY = this.#minY - margin * cell
    const cells = cols * rows
    if (this.#density.length < cells) {
      this.#density = new Float32Array(cells)
      this.#scratch = new Float32Array(cells)
    }
    const density = this.#density
    const scratch = this.#scratch
    density.fill(0, 0, cells)
    this.#splat(density, cols, originX, originY, cell)
    blur(density, scratch, cols, rows, reach)
    this.#advect(density, cols, rows, originX, originY, cell, bandwidth)
    this.#smooth()
    this.#resample()
    this.#iteration++
  }

  run(): BundlePaths {
    while (!this.done) this.step()
    return this.paths()
  }

  paths(): BundlePaths {
    const points = new Float32Array(this.x.length * 2)
    for (let at = 0; at < this.x.length; at++) {
      points[at * 2] = this.x[at] ?? 0
      points[at * 2 + 1] = this.y[at] ?? 0
    }
    return { offsets: this.offsets, points }
  }

  #splat(
    density: Float32Array,
    cols: number,
    originX: number,
    originY: number,
    cell: number,
  ): void {
    const { offsets, x, y } = this
    const spacing = this.#spacing
    for (let edge = 0; edge < this.count; edge++) {
      const first = offsets[edge] ?? 0
      const last = (offsets[edge + 1] ?? 0) - 1
      const segments = last - first
      if (segments < 2) continue
      const length = Math.hypot((x[last] ?? 0) - (x[first] ?? 0), (y[last] ?? 0) - (y[first] ?? 0))
      const share = length / segments / spacing
      for (let k = 1; k < segments; k++) {
        const weight = this.#taper(k / segments) * share
        const fx = ((x[first + k] ?? 0) - originX) / cell
        const fy = ((y[first + k] ?? 0) - originY) / cell
        const cx = Math.floor(fx)
        const cy = Math.floor(fy)
        const tx = fx - cx
        const ty = fy - cy
        const at = cy * cols + cx
        density[at] = (density[at] ?? 0) + weight * (1 - tx) * (1 - ty)
        density[at + 1] = (density[at + 1] ?? 0) + weight * tx * (1 - ty)
        density[at + cols] = (density[at + cols] ?? 0) + weight * (1 - tx) * ty
        density[at + cols + 1] = (density[at + cols + 1] ?? 0) + weight * tx * ty
      }
    }
  }

  #advect(
    density: Float32Array,
    cols: number,
    rows: number,
    originX: number,
    originY: number,
    cell: number,
    bandwidth: number,
  ): void {
    const { offsets, x, y } = this
    const scale = (this.#tuning.pull * bandwidth * bandwidth) / (2 * cell)
    const limit = bandwidth * 0.5
    const floor = 1e-6
    const shortest = this.#tuning.short * this.#radius
    for (let edge = 0; edge < this.count; edge++) {
      const first = offsets[edge] ?? 0
      const segments = (offsets[edge + 1] ?? 0) - first - 1
      if (segments < 2) continue
      const last = first + segments
      const span = Math.hypot((x[last] ?? 0) - (x[first] ?? 0), (y[last] ?? 0) - (y[first] ?? 0))
      const mobility = shortest > 0 ? Math.min(1, span / shortest) : 1
      for (let k = 1; k < segments; k++) {
        const at = first + k
        const fx = ((x[at] ?? 0) - originX) / cell
        const fy = ((y[at] ?? 0) - originY) / cell
        const cx = Math.min(cols - 3, Math.max(1, Math.floor(fx)))
        const cy = Math.min(rows - 3, Math.max(1, Math.floor(fy)))
        const tx = fx - cx
        const ty = fy - cy
        const index = cy * cols + cx
        const d00 = density[index] ?? 0
        const d10 = density[index + 1] ?? 0
        const d01 = density[index + cols] ?? 0
        const d11 = density[index + cols + 1] ?? 0
        const value =
          d00 * (1 - tx) * (1 - ty) + d10 * tx * (1 - ty) + d01 * (1 - tx) * ty + d11 * tx * ty
        if (value <= floor) continue
        const gx00 = d10 - (density[index - 1] ?? 0)
        const gx10 = (density[index + 2] ?? 0) - d00
        const gx01 = d11 - (density[index + cols - 1] ?? 0)
        const gx11 = (density[index + cols + 2] ?? 0) - d01
        const gy00 = d01 - (density[index - cols] ?? 0)
        const gy10 = d11 - (density[index - cols + 1] ?? 0)
        const gy01 = (density[index + cols * 2] ?? 0) - d00
        const gy11 = (density[index + cols * 2 + 1] ?? 0) - d10
        const gx =
          gx00 * (1 - tx) * (1 - ty) + gx10 * tx * (1 - ty) + gx01 * (1 - tx) * ty + gx11 * tx * ty
        const gy =
          gy00 * (1 - tx) * (1 - ty) + gy10 * tx * (1 - ty) + gy01 * (1 - tx) * ty + gy11 * tx * ty
        let mx = (gx / value) * scale
        let my = (gy / value) * scale
        const step = Math.hypot(mx, my)
        if (step > limit) {
          mx *= limit / step
          my *= limit / step
        }
        const weight = this.#taper(k / segments) * mobility
        x[at] = (x[at] ?? 0) + mx * weight
        y[at] = (y[at] ?? 0) + my * weight
      }
    }
  }

  #taper(u: number): number {
    return Math.min(1, Math.min(u, 1 - u) / this.#tuning.taper)
  }

  #smooth(): void {
    const { offsets, x, y } = this
    const smoothWeight = this.#tuning.smooth
    const rx = this.#rx
    const ry = this.#ry
    for (let edge = 0; edge < this.count; edge++) {
      const first = offsets[edge] ?? 0
      const segments = (offsets[edge + 1] ?? 0) - first - 1
      if (segments < 2) continue
      for (let k = 0; k <= segments; k++) {
        rx[k] = x[first + k] ?? 0
        ry[k] = y[first + k] ?? 0
      }
      for (let k = 1; k < segments; k++) {
        const at = first + k
        x[at] =
          (rx[k] ?? 0) * (1 - smoothWeight) +
          ((rx[k - 1] ?? 0) + (rx[k + 1] ?? 0)) * smoothWeight * 0.5
        y[at] =
          (ry[k] ?? 0) * (1 - smoothWeight) +
          ((ry[k - 1] ?? 0) + (ry[k + 1] ?? 0)) * smoothWeight * 0.5
      }
    }
  }

  #resample(): void {
    const { offsets, x, y } = this
    const lengths = this.#lengths
    const rx = this.#rx
    const ry = this.#ry
    for (let edge = 0; edge < this.count; edge++) {
      const first = offsets[edge] ?? 0
      const segments = (offsets[edge + 1] ?? 0) - first - 1
      if (segments < 2) continue
      lengths[0] = 0
      for (let k = 0; k <= segments; k++) {
        rx[k] = x[first + k] ?? 0
        ry[k] = y[first + k] ?? 0
        if (k > 0) {
          lengths[k] =
            (lengths[k - 1] ?? 0) +
            Math.hypot((rx[k] ?? 0) - (rx[k - 1] ?? 0), (ry[k] ?? 0) - (ry[k - 1] ?? 0))
        }
      }
      const total = lengths[segments] ?? 0
      if (!(total > 0)) continue
      let span = 1
      for (let k = 1; k < segments; k++) {
        const target = (total * k) / segments
        while (span < segments && (lengths[span] ?? 0) < target) span++
        const from = lengths[span - 1] ?? 0
        const width = (lengths[span] ?? 0) - from
        const t = width > 0 ? (target - from) / width : 0
        x[first + k] = (rx[span - 1] ?? 0) + ((rx[span] ?? 0) - (rx[span - 1] ?? 0)) * t
        y[first + k] = (ry[span - 1] ?? 0) + ((ry[span] ?? 0) - (ry[span - 1] ?? 0)) * t
      }
    }
  }
}

function blur(
  values: Float32Array,
  scratch: Float32Array,
  cols: number,
  rows: number,
  reach: number,
): void {
  const weights = new Float32Array(reach * 2 + 1)
  for (let k = -reach; k <= reach; k++) weights[k + reach] = 1 - (k / (reach + 1)) ** 2
  for (let row = 0; row < rows; row++) {
    const base = row * cols
    for (let col = 0; col < cols; col++) {
      let sum = 0
      const from = Math.max(0, col - reach)
      const to = Math.min(cols - 1, col + reach)
      for (let k = from; k <= to; k++)
        sum += (values[base + k] ?? 0) * (weights[k - col + reach] ?? 0)
      scratch[base + col] = sum
    }
  }
  for (let row = 0; row < rows; row++) {
    const out = row * cols
    values.fill(0, out, out + cols)
    const from = Math.max(0, row - reach)
    const to = Math.min(rows - 1, row + reach)
    for (let k = from; k <= to; k++) {
      const weight = weights[k - row + reach] ?? 0
      const source = k * cols
      for (let col = 0; col < cols; col++) {
        values[out + col] = (values[out + col] ?? 0) + (scratch[source + col] ?? 0) * weight
      }
    }
  }
}
