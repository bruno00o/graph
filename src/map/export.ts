import type { Map as MapLibreMap, MapOptions } from 'maplibre-gl'
import { worldSize, worldToGeo } from '../core/geo'
import type { Rgba } from '../dom/theme'
import { type ExportLabels, exportPng } from '../export'
import { takeSnapshot } from '../host/export-source'
import type { GraphInstance } from '../host/mount-graph'
import { themeColor } from '../theme/tokens'
import type { View } from '../types'
import { mapOf } from './binding'

/** Options of `exportMapPng`. */
export interface MapPngOptions {
  /**
   * Image pixels per CSS pixel, for both the map and the graph. Defaults to the pixel ratio of the
   * map.
   */
  readonly pixelRatio?: number
  /**
   * Labels to draw: `'visible'`, `'all'` or `'none'`.
   * @default 'visible'
   */
  readonly labels?: ExportLabels
  /**
   * Text burned into the bottom right corner, or `''` for none. Defaults to the attribution the map
   * shows, or else to the attribution of its sources.
   */
  readonly attribution?: string
  /**
   * Longest wait for the map tiles, in milliseconds. Past it, the export draws what has loaded.
   * @default 20000
   */
  readonly timeout?: number
}

type MapClass = new (options: MapOptions) => MapLibreMap

const attributionSize = 11
const attributionPadding = 4

function css(color: Rgba): string {
  return `rgba(${color[0]},${color[1]},${color[2]},${color[3] / 255})`
}

function plainText(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html')
  return (document.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function shownAttribution(map: MapLibreMap): string {
  const shown = map.getContainer().querySelector('.maplibregl-ctrl-attrib-inner')
  return (shown?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function attributionOf(map: MapLibreMap): string {
  const parts: string[] = []
  for (const name of Object.keys(map.getStyle().sources)) {
    const html = map.getSource(name)?.attribution
    const text = html ? plainText(html) : ''
    if (text && !parts.includes(text)) parts.push(text)
  }
  return parts.join(' | ')
}

function idle(map: MapLibreMap, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error: unknown) => {
      clearTimeout(timer)
      map.off('idle', done)
      map.off('error', failed)
      if (error === null) resolve()
      else reject(error)
    }
    const done = () => finish(null)
    const failed = (event: { error?: unknown }) => {
      if (map.isStyleLoaded()) return
      finish(event.error ?? new Error('graph: the map failed to load for the export'))
    }
    const timer = setTimeout(done, timeout)
    map.on('idle', done)
    map.on('error', failed)
  })
}

async function drawMap(
  live: MapLibreMap,
  view: View,
  width: number,
  height: number,
  pixelRatio: number,
  timeout: number,
): Promise<{ readonly canvas: HTMLCanvasElement; readonly attribution: string; done(): void }> {
  const container = document.createElement('div')
  container.setAttribute('aria-hidden', 'true')
  container.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;opacity:0;pointer-events:none;z-index:-1`
  document.body.append(container)
  const style = live.getStyle()
  const center = worldToGeo({ x: ((view.x % worldSize) + worldSize) % worldSize, y: view.y })
  const Constructor = live.constructor as MapClass
  const hidden = new Constructor({
    container,
    style: {
      ...style,
      layers: style.layers.filter((layer) => (layer.type as string) !== 'custom'),
    },
    center: [center.longitude, center.latitude],
    zoom: Math.log2(view.zoom),
    bearing: 0,
    pitch: 0,
    pixelRatio,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  })
  try {
    await idle(hidden, timeout)
  } catch (error) {
    hidden.remove()
    container.remove()
    throw error
  }
  return {
    canvas: hidden.getCanvas(),
    attribution: shownAttribution(live) || attributionOf(hidden) || attributionOf(live),
    done: () => {
      hidden.remove()
      container.remove()
    },
  }
}

function burnAttribution(
  context: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  scale: number,
  paper: Rgba,
  ink: Rgba,
  font: string,
): void {
  if (!text) return
  const size = attributionSize * scale
  const padding = attributionPadding * scale
  context.font = `${size}px ${font || 'system-ui, sans-serif'}`
  context.textBaseline = 'alphabetic'
  const room = width - padding * 4
  let line = text
  while (line.length > 1 && context.measureText(line).width > room) line = `${line.slice(0, -2)}…`
  const lineWidth = context.measureText(line).width
  const boxWidth = lineWidth + padding * 2
  const boxHeight = size + padding * 2
  context.fillStyle = css([paper[0], paper[1], paper[2], Math.round(paper[3] * 0.8)])
  context.fillRect(width - boxWidth, height - boxHeight, boxWidth, boxHeight)
  context.fillStyle = css(ink)
  context.fillText(line, width - boxWidth + padding, height - padding - size * 0.22)
}

function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('graph: the browser could not encode the map export'))
    }, 'image/png')
  })
}

/**
 * Exports what a map graph shows as a PNG: the map is drawn again offscreen at the chosen pixel
 * ratio, the graph above it, and the attribution of the map sources is burned into the bottom
 * right corner, as their licenses require.
 */
export async function exportMapPng<S extends string>(
  graph: GraphInstance<S>,
  options: MapPngOptions = {},
): Promise<Blob> {
  const live = mapOf(graph)
  const pixelRatio = options.pixelRatio ?? live.getPixelRatio()
  if (!(pixelRatio > 0) || !Number.isFinite(pixelRatio)) {
    throw new RangeError('graph: the pixel ratio must be a positive number')
  }
  const { width, height } = graph.store.get()
  if (!(width >= 1 && height >= 1)) {
    throw new RangeError('graph: nothing to export, the map measures less than one pixel')
  }
  const snapshot = takeSnapshot(graph)
  const [drawn, graphImage] = await Promise.all([
    drawMap(live, graph.view.get(), width, height, pixelRatio, options.timeout ?? 20_000),
    exportPng(graph, {
      pixelRatio,
      labels: options.labels ?? 'visible',
      background: 'transparent',
    }).then((blob) => createImageBitmap(blob)),
  ])
  try {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * pixelRatio))
    canvas.height = Math.max(1, Math.round(height * pixelRatio))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('graph: the browser refused a 2D canvas for the map export')
    context.drawImage(drawn.canvas, 0, 0, canvas.width, canvas.height)
    context.drawImage(graphImage, 0, 0, canvas.width, canvas.height)
    burnAttribution(
      context,
      options.attribution ?? drawn.attribution,
      canvas.width,
      canvas.height,
      pixelRatio,
      snapshot.color(themeColor('paper')),
      snapshot.color(themeColor('ink')),
      snapshot.theme.font,
    )
    return await encode(canvas)
  } finally {
    graphImage.close()
    drawn.done()
  }
}
