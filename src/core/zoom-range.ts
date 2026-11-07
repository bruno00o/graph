import { Boundaries } from './boundaries'

export const zoomFade = 0.25
const exactThresholds = 1024
const coarseSteps = 16
const fadeFactor = 2 ** zoomFade

export function zoomOpacity(min: number, max: number, zoom: number): number {
  const z = Math.fround(zoom)
  if (!(z > min && z < max)) return 0
  const inside = Math.min(min > 0 ? Math.log2(z / min) : zoomFade, Math.log2(max / z))
  return inside >= zoomFade ? 1 : inside / zoomFade
}

export function readMinZoom(value: unknown): number {
  return typeof value === 'number' && value > 0 && Number.isFinite(value) ? value : 0
}

export function readMaxZoom(value: unknown): number {
  return typeof value === 'number' && value > 0 ? value : Number.POSITIVE_INFINITY
}

function lowerBound(values: Float64Array, value: number): number {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((values[middle] ?? 0) < value) low = middle + 1
    else high = middle
  }
  return low
}

function upperBound(values: Float64Array, value: number): number {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((values[middle] ?? 0) <= value) low = middle + 1
    else high = middle
  }
  return low
}

export class ZoomRanges {
  min: Float32Array = new Float32Array(0)
  max: Float32Array = new Float32Array(0)
  count = 0
  readonly #thresholds: Boundaries = new Boundaries(exactThresholds, (visit) => {
    for (let index = 0; index < this.min.length; index++) {
      visit(this.min[index] || Number.NaN)
      visit(this.max[index] ?? Number.POSITIVE_INFINITY)
    }
  })

  reserve(capacity: number): void {
    if (capacity <= this.min.length) return
    const min = new Float32Array(capacity)
    min.set(this.min)
    const max = new Float32Array(capacity).fill(Number.POSITIVE_INFINITY)
    max.set(this.max)
    this.min = min
    this.max = max
  }

  set(index: number, min: number, max: number): void {
    this.reserve(index + 1)
    const low = Math.fround(min)
    const high = Math.fround(max)
    const lowBefore = this.min[index] ?? 0
    const highBefore = this.max[index] ?? Number.POSITIVE_INFINITY
    if (low === lowBefore && high === highBefore) return
    const before = lowBefore > 0 || highBefore < Number.POSITIVE_INFINITY
    const ranged = low > 0 || high < Number.POSITIVE_INFINITY
    if (before !== ranged) this.count += ranged ? 1 : -1
    if (lowBefore > 0) this.#thresholds.remove(lowBefore)
    this.#thresholds.remove(highBefore)
    this.min[index] = low
    this.max[index] = high
    if (low > 0) this.#thresholds.add(low)
    this.#thresholds.add(high)
  }

  clear(index: number): void {
    if (index < this.min.length) this.set(index, 0, Number.POSITIVE_INFINITY)
  }

  shown(index: number, zoom: number): boolean {
    if (this.count === 0) return true
    const z = Math.fround(zoom)
    return z > (this.min[index] ?? 0) && z < (this.max[index] ?? Number.POSITIVE_INFINITY)
  }

  opacity(index: number, zoom: number): number {
    if (this.count === 0) return 1
    return zoomOpacity(this.min[index] ?? 0, this.max[index] ?? Number.POSITIVE_INFINITY, zoom)
  }

  step(zoom: number): number {
    if (this.count === 0) return 0
    const sorted = this.#thresholds.sorted(this.min.length)
    if (!sorted) return Math.floor(Math.log2(zoom) * coarseSteps)
    const z = Math.fround(zoom)
    return lowerBound(sorted, z) + upperBound(sorted, z)
  }

  fading(zoom: number): boolean {
    if (this.count === 0) return false
    const sorted = this.#thresholds.sorted(this.min.length)
    if (!sorted) return true
    const z = Math.fround(zoom)
    return upperBound(sorted, z * fadeFactor) > lowerBound(sorted, z / fadeFactor)
  }
}
