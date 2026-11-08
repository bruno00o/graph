import type { DrawRequest } from './protocol'
import {
  fitBox,
  graphBounds,
  type RasterContainers,
  type RasterEdges,
  type RasterFit,
  type RasterNodes,
  radiusCap,
  raster,
} from './raster'

export interface PaintSurface {
  width: number
  height: number
}

export interface PaintContext {
  createImageData(width: number, height: number): ImageData
  putImageData(image: ImageData, x: number, y: number): void
}

const noNodes: RasterNodes = {
  capacity: 0,
  alive: new Uint8Array(0),
  shape: new Uint8Array(0),
  size: new Float32Array(0),
  width: new Float32Array(0),
  fill: new Uint32Array(0),
  stroke: new Uint32Array(0),
  strokeWidth: new Float32Array(0),
  opacity: new Float32Array(0),
  screenUnits: new Uint8Array(0),
  container: new Uint8Array(0),
}

export class MinimapPainter {
  readonly #surface: PaintSurface
  readonly #context: PaintContext | null
  #image: ImageData | null = null
  #pixels: Uint32Array = new Uint32Array(0)
  #nodes: RasterNodes = noNodes
  #edges: RasterEdges | null = null
  #colors: Uint32Array = new Uint32Array(0)
  #xy: Float32Array = new Float32Array(0)
  #containers: RasterContainers | null = null
  #masks: Uint32Array | null = null

  constructor(surface: PaintSurface, context: PaintContext | null) {
    this.#surface = surface
    this.#context = context
  }

  draw(request: DrawRequest): RasterFit | null {
    if (request.nodes) this.#nodes = request.nodes
    if (request.edges !== undefined) this.#edges = request.edges
    if (request.colors) this.#colors = request.colors
    if (request.xy) this.#xy = request.xy
    if (request.containers !== undefined) this.#containers = request.containers
    if (request.masks !== undefined) this.#masks = request.masks
    const { paint } = request
    const width = Math.max(1, Math.round(paint.width))
    const height = Math.max(1, Math.round(paint.height))
    const surface = this.#surface
    if (surface.width !== width || surface.height !== height || !this.#image) {
      surface.width = width
      surface.height = height
      this.#image = this.#context?.createImageData(width, height) ?? null
      this.#pixels = this.#image ? new Uint32Array(this.#image.data.buffer) : new Uint32Array(0)
    }
    const scene = {
      nodes: this.#nodes,
      edges: this.#edges,
      xy: this.#xy,
      containers: this.#containers,
      colors: this.#colors,
      masks: this.#masks,
    }
    const box = graphBounds(scene)
    const fit = box ? fitBox(box, width, height, paint.padding) : null
    if (!this.#image || !this.#context) return fit
    if (box && fit) {
      raster(
        { pixels: this.#pixels, width, height },
        scene,
        {
          edgeAlpha: paint.edgeAlpha,
          minRadius: paint.minRadius,
          maxRadius: radiusCap(box.count, width, height, paint.minRadius),
          selectedRadius: paint.selectedRadius,
          nodeColor: paint.nodeColor,
          selectedColor: paint.selectedColor,
        },
        fit,
      )
    } else {
      this.#pixels.fill(0)
    }
    this.#context.putImageData(this.#image, 0, 0)
    return fit
  }
}
