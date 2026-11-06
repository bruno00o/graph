import type { DensitySettings } from './density'

export interface ToWorker {
  readonly xy: Float32Array
  readonly ends: Uint32Array
  readonly settings: DensitySettings
}

export interface FromWorker {
  readonly offsets: Uint32Array
  readonly points: Float32Array
}
