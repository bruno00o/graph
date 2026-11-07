import type { OrthogonalSettings } from './orthogonal'

export interface ToWorker {
  readonly xy: Float32Array
  readonly extents: Float32Array
  readonly parents: Int32Array
  readonly ends: Uint32Array
  readonly settings: OrthogonalSettings
}

export interface FromWorker {
  readonly offsets: Uint32Array
  readonly points: Float32Array
}
