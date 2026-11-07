import { readWindow, timeFilter } from '../core/time-range'
import type { Rgba } from '../dom/theme'
import { type GraphSnapshot, takeSnapshot } from '../host/export-source'
import type { GraphInstance } from '../host/mount-graph'
import type { LabelMode } from '../host/renderer'
import { themeColor } from '../theme/tokens'
import type { TimeWindowInput } from '../types'
import { GlyphAtlas } from '../webgl/glyph-atlas'
import { type ExportFrame, exportFrame } from './frame'
import { fitLabels } from './labels'
import { renderPng } from './png'
import { type SvgImage, writeSvg } from './svg'

/**
 * Part of the graph an export covers: `'view'` is what the graph shows now, `'graph'` frames every
 * node.
 */
export type ExportRegion = 'view' | 'graph'

/**
 * Labels an export draws: `'visible'` follows the screen rules (size threshold, no overlap),
 * `'all'` draws every label whatever its size or overlaps, `'none'` draws none.
 */
export type ExportLabels = 'visible' | 'all' | 'none'

/** Options of `exportPng` and `exportSvg`. */
export interface ExportOptions {
  /**
   * Part of the graph to export.
   * @default 'view'
   */
  readonly region?: ExportRegion
  /**
   * Scale of the export, in CSS pixels per world unit. Sizes set in screen pixels, such as edge
   * widths, labels and nodes with `units: 'screen'`, keep their size. Defaults to the current zoom.
   */
  readonly zoom?: number
  /**
   * Margin around the nodes, labels and loops when `region` is `'graph'`, in CSS pixels.
   * @default 32
   */
  readonly padding?: number
  /**
   * Labels to draw.
   * @default 'visible'
   */
  readonly labels?: ExportLabels
  /**
   * Background color, any CSS color resolved with the current theme. `'transparent'` leaves the
   * background empty.
   * @default 'var(--graph-paper)'
   */
  readonly background?: string
  /**
   * Moment of the moving dashes of the `flow` option, in milliseconds after they start. The image
   * is still: at `0`, every dash pattern starts at the source of its edge.
   * @default 0
   */
  readonly time?: number
  /**
   * Time window of the export: elements with a `time` show only while they exist in it, as on
   * screen. `null` draws every element whatever its time. Defaults to the window of the graph.
   */
  readonly window?: TimeWindowInput | null
}

/** Options of `exportPng`. */
export interface PngExportOptions extends ExportOptions {
  /**
   * Image pixels per CSS pixel. Large images are drawn in tiles, so the size is bounded by memory,
   * not by the GPU. Defaults to the device pixel ratio of the graph.
   */
  readonly pixelRatio?: number
}

/** Options of `exportSvg`. */
export interface SvgExportOptions extends ExportOptions {
  /**
   * Copies every node image into the document as a data URL, so the file stands alone. Without it,
   * images stay linked by their URL.
   * @default true
   */
  readonly embedImages?: boolean
}

interface Prepared {
  readonly snapshot: GraphSnapshot
  readonly frame: ExportFrame
  readonly background: Rgba
  readonly labels: LabelMode
  readonly measure: GlyphAtlas
  readonly time: number
}

async function prepare(graph: object, options: ExportOptions): Promise<Prepared> {
  await document.fonts?.ready
  const snapshot = takeSnapshot(graph)
  const { scene, positions, states } = snapshot
  const boxes = snapshot.containers?.boxes ?? null
  const region = options.region ?? 'view'
  const labels = options.labels ?? 'visible'
  const padding = Math.max(0, options.padding ?? 32)
  const measure = new GlyphAtlas(snapshot.theme.font)
  const shownWindow =
    options.window === undefined
      ? snapshot.window
      : timeFilter(readWindow(options.window), snapshot.fade)
  let frame = exportFrame(
    {
      nodes: scene.nodes,
      edges: scene.edges,
      positions,
      boxes,
      view: snapshot.view,
      width: snapshot.width,
      height: snapshot.height,
      window: shownWindow,
      hulls: snapshot.hulls.shapes,
      bundles: snapshot.bundles,
    },
    { region, zoom: options.zoom, padding },
  )
  if (region === 'graph' && labels !== 'none') {
    const source = {
      nodes: scene.nodes,
      edges: scene.edges,
      positions,
      states,
      boxes,
      bundles: snapshot.bundles,
    }
    frame = fitLabels(source, frame, labels, measure, padding)
  }
  if (!(frame.width >= 1 && frame.height >= 1)) {
    throw new RangeError('graph: nothing to export, the graph measures less than one pixel')
  }
  const background = snapshot.color(options.background ?? themeColor('paper'))
  const time = options.time ?? 0
  if (!Number.isFinite(time)) throw new RangeError('graph: the time must be a finite number')
  return { snapshot, frame, background, labels, measure, time: time / 1000 }
}

function readAsDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })
}

async function embed(src: string): Promise<string> {
  if (src.startsWith('data:')) return src
  const absolute = new URL(src, document.baseURI).href
  try {
    const response = await fetch(absolute)
    if (!response.ok) return absolute
    return (await readAsDataUrl(await response.blob())) ?? absolute
  } catch {
    return absolute
  }
}

async function aspectOf(src: string): Promise<number | null> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = src
  try {
    await image.decode()
  } catch {
    return null
  }
  const { naturalWidth, naturalHeight } = image
  return naturalWidth > 0 && naturalHeight > 0 ? naturalWidth / naturalHeight : 1
}

async function imageOf(src: string, copy: boolean): Promise<SvgImage | null> {
  const [aspect, href] = await Promise.all([
    aspectOf(src),
    copy ? embed(src) : new URL(src, document.baseURI).href,
  ])
  return aspect === null ? null : { href, aspect }
}

async function imageSources(
  snapshot: GraphSnapshot,
  copy: boolean,
): Promise<ReadonlyMap<string, SvgImage>> {
  const { nodes } = snapshot.scene
  const sources = new Set<string>()
  for (let index = 0; index < nodes.capacity; index++) {
    const src = nodes.image[index]
    if (src && nodes.alive[index] === 1) sources.add(src)
  }
  const list = [...sources]
  const images = await Promise.all(list.map((src) => imageOf(src, copy)))
  const found = new Map<string, SvgImage>()
  list.forEach((src, at) => {
    const image = images[at]
    if (image) found.set(src, image)
  })
  return found
}

/**
 * Serializes the graph into a standalone SVG document, without reading pixels back: shapes,
 * images, badges, group containers, edges, arrows and labels, with state styles and colors of the
 * current theme. Text uses the theme font, which the viewer needs to have.
 */
export async function exportSvg<S extends string>(
  graph: GraphInstance<S>,
  options: SvgExportOptions = {},
): Promise<string> {
  const { snapshot, frame, background, labels, measure, time } = await prepare(graph, options)
  const images = await imageSources(snapshot, options.embedImages ?? true)
  const current = takeSnapshot(graph)
  const { scene } = current
  return writeSvg({
    nodes: scene.nodes,
    edges: scene.edges,
    layers: scene.layers,
    positions: current.positions,
    states: current.states,
    grid: current.grid,
    hulls: current.hulls.shapes,
    containers: current.containers,
    bundles: current.bundles,
    palette: current.palette,
    theme: current.theme,
    frame,
    background,
    labels,
    measure,
    images,
    title: current.title,
    time,
  })
}

/**
 * Draws the graph offscreen at the chosen pixel ratio and encodes it as a PNG. The drawing uses a
 * WebGL context of its own, freed at the end, and tiles past 4,096 pixels.
 */
export async function exportPng<S extends string>(
  graph: GraphInstance<S>,
  options: PngExportOptions = {},
): Promise<Blob> {
  const { snapshot, frame, background, labels, time } = await prepare(graph, options)
  const pixelRatio = options.pixelRatio ?? snapshot.pixelRatio
  if (!(pixelRatio > 0) || !Number.isFinite(pixelRatio)) {
    throw new RangeError('graph: the pixel ratio must be a positive number')
  }
  return renderPng(() => takeSnapshot(graph), snapshot, {
    frame,
    pixelRatio,
    labels,
    background,
    time,
  })
}
