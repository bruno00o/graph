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
  readonly #thresholds = new Set<number>()
  #sorted: Float64Array | null = null

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
    const before = (this.min[index] ?? 0) > 0 || (this.max[index] ?? Infinity) < Infinity
    const ranged = min > 0 || max < Number.POSITIVE_INFINITY
    if (before !== ranged) this.count += ranged ? 1 : -1
    this.min[index] = min
    this.max[index] = max
    if (!ranged) return
    this.#threshold(this.min[index] ?? 0)
    this.#threshold(this.max[index] ?? Number.POSITIVE_INFINITY)
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
    const sorted = this.#sortedThresholds()
    if (!sorted) return Math.floor(Math.log2(zoom) * coarseSteps)
    const z = Math.fround(zoom)
    return lowerBound(sorted, z) + upperBound(sorted, z)
  }

  fading(zoom: number): boolean {
    if (this.count === 0) return false
    const sorted = this.#sortedThresholds()
    if (!sorted) return true
    const z = Math.fround(zoom)
    return upperBound(sorted, z * fadeFactor) > lowerBound(sorted, z / fadeFactor)
  }

  #threshold(value: number): void {
    if (!(value > 0) || value === Number.POSITIVE_INFINITY || this.#thresholds.has(value)) return
    if (this.#thresholds.size > exactThresholds) return
    this.#thresholds.add(value)
    this.#sorted = null
  }

  #sortedThresholds(): Float64Array | null {
    if (this.#thresholds.size > exactThresholds) return null
    if (!this.#sorted) this.#sorted = Float64Array.from(this.#thresholds).sort()
    return this.#sorted
  }
}

interface RangedNodes {
  readonly zoom: ZoomRanges
}

interface RangedEdges {
  readonly zoom: ZoomRanges
  readonly source: Uint32Array
  readonly target: Uint32Array
}

export function edgeShown(
  nodes: RangedNodes,
  edges: RangedEdges,
  index: number,
  zoom: number,
): boolean {
  return (
    edges.zoom.shown(index, zoom) &&
    nodes.zoom.shown(edges.source[index] ?? 0, zoom) &&
    nodes.zoom.shown(edges.target[index] ?? 0, zoom)
  )
}

export function edgeOpacity(
  nodes: RangedNodes,
  edges: RangedEdges,
  index: number,
  zoom: number,
): number {
  if (nodes.zoom.count === 0 && edges.zoom.count === 0) return 1
  return Math.min(
    edges.zoom.opacity(index, zoom),
    nodes.zoom.opacity(edges.source[index] ?? 0, zoom),
    nodes.zoom.opacity(edges.target[index] ?? 0, zoom),
  )
}

export function detailStep(nodes: RangedNodes, edges: RangedNodes, zoom: number): number {
  return nodes.zoom.step(zoom) + edges.zoom.step(zoom)
}
