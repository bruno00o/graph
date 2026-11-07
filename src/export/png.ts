import { IndexSet } from '../core/index-set'
import type { Rgba } from '../dom/theme'
import type { GraphSnapshot } from '../host/export-source'
import type { LabelArea, LabelMode, Renderer, RenderInput } from '../host/renderer'
import type { ExportFrame } from './frame'
import { PngWriter } from './png-encoder'

const tileLimit = 4096
const stripPixels = 1 << 24

export interface PngRequest {
  readonly frame: ExportFrame
  readonly pixelRatio: number
  readonly labels: LabelMode
  readonly background: Rgba
  readonly time: number
}

function load(renderer: Renderer, snapshot: GraphSnapshot): void {
  renderer.setTheme(snapshot.theme)
  renderer.setPalette(snapshot.palette, snapshot.scene.palette.colors.length)
  const input: RenderInput = {
    scene: snapshot.scene,
    dirty: { nodes: new IndexSet(), edges: new IndexSet(), palette: true, layers: true },
    positions: snapshot.positions,
    positionsChanged: true,
    states: snapshot.states.copy(),
    full: true,
    grid: snapshot.grid,
    hulls: snapshot.hulls,
    containers: snapshot.containers ?? undefined,
    bundles: snapshot.bundles,
    bridges: snapshot.bridges ?? null,
  }
  renderer.sync(input)
}

export function composite(pixels: Uint8Array, length: number, background: Rgba): void {
  const out = new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, length)
  const alpha = background[3]
  const red = (background[0] * alpha) / 255
  const green = (background[1] * alpha) / 255
  const blue = (background[2] * alpha) / 255
  for (let at = 0; at < length; at += 4) {
    const keep = (255 - (pixels[at + 3] ?? 0)) / 255
    const a = (pixels[at + 3] ?? 0) + alpha * keep
    const r = (pixels[at] ?? 0) + red * keep
    const g = (pixels[at + 1] ?? 0) + green * keep
    const b = (pixels[at + 2] ?? 0) + blue * keep
    if (a >= 254.5) {
      out[at] = r
      out[at + 1] = g
      out[at + 2] = b
      out[at + 3] = 255
    } else if (a < 0.5) {
      out[at] = 0
      out[at + 1] = 0
      out[at + 2] = 0
      out[at + 3] = 0
    } else {
      const unit = 255 / a
      out[at] = r * unit
      out[at + 1] = g * unit
      out[at + 2] = b * unit
      out[at + 3] = a
    }
  }
}

export async function renderPng(
  take: () => GraphSnapshot,
  first: GraphSnapshot,
  request: PngRequest,
): Promise<Blob> {
  const { frame, pixelRatio, labels, time } = request
  const width = Math.max(1, Math.round(frame.width * pixelRatio))
  const height = Math.max(1, Math.round(frame.height * pixelRatio))
  const canvas = document.createElement('canvas')
  canvas.width = Math.min(width, tileLimit)
  canvas.height = Math.min(height, tileLimit)
  const renderer = first.createRenderer(canvas, () => {})
  try {
    const gl = canvas.getContext('webgl2')
    if (!gl) throw new Error('graph: WebGL2 is not available')
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array
    const limit = Math.min(
      tileLimit,
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
      viewport[0] ?? tileLimit,
      viewport[1] ?? tileLimit,
    )
    load(renderer, first)
    await Promise.all([renderer.ready?.(), document.fonts?.ready])
    load(renderer, take())
    const strip = Math.max(1, Math.min(limit, height, Math.floor(stripPixels / width)))
    const cssWidth = width / pixelRatio
    const cssHeight = height / pixelRatio
    const { view } = frame
    const camera = first.globe
    const globe =
      camera &&
      Math.abs(camera.view.x - view.x) * view.zoom < 0.01 &&
      Math.abs(camera.view.y - view.y) * view.zoom < 0.01 &&
      Math.abs(camera.view.zoom / view.zoom - 1) < 1e-6 &&
      Math.abs(camera.width - cssWidth) < 0.5 &&
      Math.abs(camera.height - cssHeight) < 0.5
        ? camera
        : null
    const area: LabelArea = { view, width: cssWidth, height: cssHeight, mode: labels, globe }
    const writer = new PngWriter(width, height, pixelRatio)
    const rows = new Uint8Array(width * strip * 4)
    const tile = new Uint8Array(Math.min(limit, width) * strip * 4)
    for (let top = 0; top < height; top += strip) {
      const tileHeight = Math.min(strip, height - top)
      for (let left = 0; left < width; left += limit) {
        const tileWidth = Math.min(limit, width - left)
        if (canvas.width !== tileWidth) canvas.width = tileWidth
        if (canvas.height !== tileHeight) canvas.height = tileHeight
        if (gl.drawingBufferWidth !== tileWidth || gl.drawingBufferHeight !== tileHeight) {
          throw new Error('graph: the browser refused a drawing buffer for the export')
        }
        renderer.render({
          view: {
            x: view.x + ((left + tileWidth / 2) / pixelRatio - cssWidth / 2) / view.zoom,
            y: view.y + ((top + tileHeight / 2) / pixelRatio - cssHeight / 2) / view.zoom,
            zoom: view.zoom,
          },
          width: tileWidth / pixelRatio,
          height: tileHeight / pixelRatio,
          pixelRatio,
          labels: area,
          time,
          globe,
          window: frame.window ?? null,
          layers: frame.layers ?? null,
        })
        const pixels = tile.subarray(0, tileWidth * tileHeight * 4)
        gl.readPixels(0, 0, tileWidth, tileHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        if (gl.isContextLost())
          throw new Error('graph: the WebGL context was lost during the export')
        for (let row = 0; row < tileHeight; row++) {
          const from = (tileHeight - 1 - row) * tileWidth * 4
          rows.set(pixels.subarray(from, from + tileWidth * 4), (row * width + left) * 4)
        }
      }
      composite(rows, tileHeight * width * 4, request.background)
      await writer.write(rows, tileHeight)
    }
    return await writer.finish()
  } finally {
    renderer.destroy()
  }
}
