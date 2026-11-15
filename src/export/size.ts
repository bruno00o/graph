import type { ExportFrame } from './frame'

interface SizeInput {
  readonly width?: number | undefined
  readonly height?: number | undefined
}

export interface SizeBox {
  readonly width: number | null
  readonly height: number | null
}

const maxZoom = 2 ** 20
const minZoom = 2 ** -40
const tolerance = 2e-5

function checkSide(value: number | undefined, name: string): number | null {
  if (value === undefined) return null
  if (!Number.isFinite(value) || Math.round(value) < 1) {
    throw new RangeError(`graph: the export ${name} must be a finite number of pixels, 1 or more`)
  }
  return Math.round(value)
}

export function checkSize(size: SizeInput | undefined): SizeBox | null {
  if (size === undefined) return null
  const width = checkSide(size.width, 'width')
  const height = checkSide(size.height, 'height')
  if (width === null && height === null) {
    throw new RangeError('graph: the export size needs a width, a height or both')
  }
  return { width, height }
}

function overflow(frame: ExportFrame, width: number, height: number): number {
  return Math.max(frame.width / width, frame.height / height)
}

export function fitZoom(
  frameAt: (zoom: number) => ExportFrame,
  width: number,
  height: number,
  start: number,
): number {
  const at = (zoom: number) => overflow(frameAt(zoom), width, height)
  let zoom = Math.min(Math.max(start, minZoom), maxZoom)
  let ratio = at(zoom)
  let low = 0
  let lowRatio = 0
  let high = 0
  let highRatio = 0
  if (ratio <= 1) {
    low = zoom
    lowRatio = ratio
    while (ratio <= 1 && zoom < maxZoom) {
      zoom = Math.min(zoom * 2, maxZoom)
      ratio = at(zoom)
      if (ratio <= 1) {
        low = zoom
        lowRatio = ratio
      }
    }
    if (ratio <= 1) return low
    high = zoom
    highRatio = ratio
  } else {
    high = zoom
    highRatio = ratio
    while (ratio > 1 && zoom > minZoom) {
      zoom = Math.max(zoom * Math.max(0.5, 1 / ratio), minZoom)
      ratio = at(zoom)
      if (ratio > 1) {
        high = zoom
        highRatio = ratio
      }
    }
    if (ratio > 1) return zoom
    low = zoom
    lowRatio = ratio
  }
  let lowWeight = 1
  let highWeight = 1
  for (let step = 0; step < 40 && 1 - lowRatio > tolerance; step++) {
    const lowGap = (lowRatio - 1) * lowWeight
    const highGap = (highRatio - 1) * highWeight
    const next = (low * highGap - high * lowGap) / (highGap - lowGap)
    zoom = next > low && next < high ? next : (low + high) / 2
    ratio = at(zoom)
    if (ratio <= 1) {
      low = zoom
      lowRatio = ratio
      highWeight /= 2
    } else {
      high = zoom
      highRatio = ratio
      lowWeight /= 2
    }
  }
  return low
}
