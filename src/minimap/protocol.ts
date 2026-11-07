import type { RasterContainers, RasterEdges, RasterFit, RasterNodes } from './raster'

export interface MinimapPaint {
  readonly width: number
  readonly height: number
  readonly padding: number
  readonly minRadius: number
  readonly selectedRadius: number
  readonly edgeAlpha: number
  readonly nodeColor: number | null
  readonly selectedColor: number | null
}

export interface DrawRequest {
  readonly type: 'draw'
  readonly paint: MinimapPaint
  readonly nodes?: RasterNodes
  readonly edges?: RasterEdges | null
  readonly colors?: Uint32Array
  readonly xy?: Float32Array
  readonly containers?: RasterContainers | null
  readonly masks?: Uint32Array | null
}

export type ToMinimapWorker = DrawRequest

export interface DrawnMessage {
  readonly type: 'drawn'
  readonly fit: RasterFit | null
  readonly frame: ImageBitmap
}
