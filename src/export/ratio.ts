import type { PixelRatioOption } from '../types'

function checkRatio(pixelRatio: number): number {
  if (!(pixelRatio > 0) || !Number.isFinite(pixelRatio)) {
    throw new RangeError('graph: the pixel ratio must be a positive number')
  }
  return pixelRatio
}

export function exportRatio(option: PixelRatioOption, software: boolean): number {
  if (typeof option === 'number') return checkRatio(option)
  if (option !== 'auto' && option !== 'device') {
    throw new TypeError("graph: the pixel ratio must be 'auto', 'device' or a number")
  }
  const device = globalThis.devicePixelRatio || 1
  return option === 'auto' && software ? Math.min(device, 1) : device
}
