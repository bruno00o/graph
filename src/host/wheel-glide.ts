import { reducedMotion } from './reduced-motion'

const tick = 120
const pinchDelta = 30
const cadence = 2

export interface WheelSample {
  readonly mode: number
  readonly delta: number
  readonly ticks: number | undefined
  readonly pinch: boolean
}

const fixedPoint = 65536 / 40
const slack = 1e-6

function whole(value: number): boolean {
  return Math.abs(value - Math.round(value)) < slack
}

function lineDelta(size: number): boolean {
  return whole(size * fixedPoint) && !whole(size * 4)
}

export function wheelNotch(sample: WheelSample): boolean {
  if (sample.mode !== 0) return true
  const size = Math.abs(sample.delta)
  if (!(size > 0) || !Number.isFinite(size)) return false
  if (lineDelta(size)) return true
  const ticks = Math.abs(sample.ticks ?? 0)
  if (!(ticks > 0) || ticks % tick !== 0 || Math.abs(ticks - 3 * size) <= 1) return false
  return !(sample.pinch && ticks === tick && size < pinchDelta)
}

export function glideDuration(gap: number, sample: WheelSample, longest: number): number {
  if (!(longest > 0 && gap > 0) || reducedMotion() || !wheelNotch(sample)) return 0
  return Math.min(longest, cadence * gap)
}
