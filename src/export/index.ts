import type { NodeColumns } from '../core/columns'
import type { Positions } from '../core/positions'
import { readWindow, timeFilter } from '../core/time-range'
import { detailStep, type Sight } from '../core/visibility'
import type { Rgba } from '../dom/theme'
import { type GraphSnapshot, onPage, takeSnapshot } from '../host/export-source'
import type { GraphCore, GraphInstance } from '../host/mount-graph'
import type { ContainerFrame, HullInput, LabelMode, Renderer } from '../host/renderer'
import { themeColor } from '../theme/tokens'
import type { Key, TimeWindowInput } from '../types'
import { GlyphAtlas } from '../webgl/glyph-atlas'
import type { TextMeasure } from '../webgl/label-layer'
import { centered, type Diagram, type DiagramFrame, readDiagram } from './diagram'
import { writeDrawio } from './drawio'
import { type ExportFrame, exportFrame } from './frame'
import { frozenContainers, frozenHulls, frozenPositions, withoutDrafts } from './frozen'
import { fitLabels } from './labels'
import { openCanvas, type PngCanvas, renderPng } from './png'
import { checkSize, fitZoom } from './size'
import { type SvgImage, writeSvg } from './svg'
import { writeVsdx } from './vsdx'
import { widthMeasure } from './width-measure'

/**
 * Part of the graph an export covers: `'view'` is what the graph shows now, `'graph'` frames every
 * node, with the labels, curved edges and hulls that reach past them.
 */
export type ExportRegion = 'view' | 'graph'

/**
 * Labels an export draws: `'visible'` follows the screen rules (size threshold, no overlap),
 * `'all'` draws every label whatever its size or overlaps, `'none'` draws none.
 */
export type ExportLabels = 'visible' | 'all' | 'none'

/**
 * Output size of an export, in pixels. The region is fitted inside it with its aspect kept, and
 * the rest of the image shows the background. With one side only, the other follows the aspect of
 * the region.
 */
export interface ExportSize {
  /** Width of the image, in pixels. A value that is not a finite number of 1 or more throws. */
  readonly width?: number | undefined
  /** Height of the image, in pixels. A value that is not a finite number of 1 or more throws. */
  readonly height?: number | undefined
}

/** Options of `exportPng` and `exportSvg`. */
export interface ExportOptions {
  /**
   * Part of the graph to export.
   * @default 'view'
   */
  readonly region?: ExportRegion | undefined
  /**
   * Scale of the export, in CSS pixels per world unit. Sizes set in screen pixels, such as edge
   * widths, labels and nodes with `units: 'screen'`, keep their size. Defaults to the current zoom.
   * Throws a `RangeError` with `size`, which sets the zoom itself.
   */
  readonly zoom?: number | undefined
  /**
   * Exact size of the image, in pixels. The zoom is chosen so that the region fits inside it: with
   * `region: 'graph'`, the nodes, labels, curved edges and hulls and the `padding` around them; with
   * `region: 'view'`, the whole area the view shows, so a different aspect shows more of the
   * graph around it. A PNG has this size in pixels whatever `pixelRatio`, which keeps its meaning
   * of image pixels per CSS pixel: labels and edge widths are drawn at their CSS size times it,
   * and the area drawn is `size` divided by it. An SVG takes `size` as its width and height, in
   * CSS pixels. Defaults to the size the region has at its zoom.
   */
  readonly size?: ExportSize | undefined
  /**
   * Margin around the nodes, labels and curved edges when `region` is `'graph'`, in CSS pixels.
   * Must be finite, 0 or more. With `size`, the margin stays this wide in CSS pixels and the zoom
   * adapts.
   * @default 32
   */
  readonly padding?: number | undefined
  /**
   * Labels to draw.
   * @default 'visible'
   */
  readonly labels?: ExportLabels | undefined
  /**
   * Whether to draw the background grid of the graph. `false` leaves it out, as if the definition
   * had no `background`.
   * @default true
   */
  readonly grid?: boolean | undefined
  /**
   * Whether to draw the badges of the nodes. `false` leaves them out, and the nodes keep their
   * size and their labels.
   * @default true
   */
  readonly badges?: boolean | undefined
  /**
   * Background color, any CSS color resolved with the current theme. `'transparent'` leaves the
   * background empty.
   * @default 'var(--graph-paper)'
   */
  readonly background?: string | undefined
  /**
   * Moment of the moving dashes of the `flow` option, in milliseconds after they start. The image
   * is still: at `0`, every dash pattern starts at the source of its edge.
   * @default 0
   */
  readonly time?: number | undefined
  /**
   * Time window of the export: elements with a `time` show only while they exist in it, as on
   * screen. `null` draws every element whatever its time. Defaults to the window of the graph.
   */
  readonly window?: TimeWindowInput | null | undefined
}

/** Options of `exportPng`. */
export interface PngExportOptions extends ExportOptions {
  /**
   * Image pixels per CSS pixel. Large images are drawn in tiles, so the size is bounded by memory,
   * not by the GPU. Defaults to the ratio the graph draws at: the device pixel ratio, or the
   * `pixelRatio` of the definition, which `'auto'` lowers to 1 when WebGL runs in software.
   */
  readonly pixelRatio?: number | undefined
}

/** An image as `exportSvg` writes it, given by its `images` option. */
export interface ExportImage {
  /** URL written in the document, such as a data URL, a file path or a web address. */
  readonly href: string
  /** Width of the image, in pixels. With `height`, it gives the aspect the image is cut to. */
  readonly width: number
  /** Height of the image, in pixels. A width or height that is not above 0 counts as square. */
  readonly height: number
}

/** Options of `exportSvg`. */
export interface SvgExportOptions extends ExportOptions {
  /**
   * Copies every node image into the document as a data URL, so the file stands alone. Without it,
   * images stay linked by their URL. A graph without a page ignores it.
   * @default true
   */
  readonly embedImages?: boolean | undefined
  /**
   * Reads the images of the nodes and badges, once per source URL: returns the URL to write and
   * the size of the image, or `null` to leave the image out. It replaces the loading of the page
   * and `embedImages`. Without it, a graph without a page writes each URL as it is and draws its
   * image square.
   */
  readonly images?: ((src: string) => ExportImage | null | Promise<ExportImage | null>) | undefined
}

/**
 * State styles an editable export keeps: `'all'` keeps every state in force, as the SVG does;
 * `'custom'` keeps the states the definition adds and leaves out `selected`, `hovered` and
 * `focused`, so the file does not freeze a selection or a hover; `'none'` keeps none. Hidden
 * elements stay out whatever this option.
 */
export type ExportStates = 'all' | 'custom' | 'none'

/** Options of `exportDrawio` and `exportVsdx`. */
export interface DiagramExportOptions {
  /**
   * Part of the graph to export. `'graph'` takes every node shown; `'view'` takes the nodes the
   * view shows, even in part, and the edges between them.
   * @default 'graph'
   */
  readonly region?: ExportRegion | undefined
  /**
   * Scale of the diagram, in diagram units per world unit. A diagram unit is a draw.io unit, and
   * 1/96 inch in Visio. Sizes set in screen pixels, such as edge widths, labels and nodes with
   * `units: 'screen'`, keep their size in diagram units. Throws a `RangeError` with `size`, which
   * sets the zoom itself.
   * @default 1
   */
  readonly zoom?: number | undefined
  /**
   * Size of the page, in diagram units. The zoom is chosen so that the region fits inside it, as
   * with `exportSvg`. Defaults to the size the region has at its zoom.
   */
  readonly size?: ExportSize | undefined
  /**
   * Margin around the nodes, edges and labels when `region` is `'graph'`, in diagram units. Must
   * be finite, 0 or more.
   * @default 32
   */
  readonly padding?: number | undefined
  /**
   * Time window of the export: elements with a `time` are kept only while they exist in it, as on
   * screen. `null` keeps every element whatever its time. Defaults to the window of the graph.
   */
  readonly window?: TimeWindowInput | null | undefined
  /**
   * State styles to keep, from `'all'`, `'custom'` and `'none'`.
   * @default 'custom'
   */
  readonly states?: ExportStates | undefined
  /**
   * Background of the page, any CSS color resolved with the current theme. `'transparent'` leaves
   * the page without a background.
   * @default 'var(--graph-paper)'
   */
  readonly background?: string | undefined
}

interface Prepared {
  readonly snapshot: GraphSnapshot
  readonly frame: ExportFrame
  readonly positions: Positions
  readonly containers: ContainerFrame | null
  readonly hulls: HullInput
  readonly background: Rgba
  readonly labels: LabelMode
  readonly measure: TextMeasure
  readonly time: number
  readonly pixelRatio: number
  readonly page: boolean
}

function softwareOf(renderer: Renderer): boolean {
  return renderer.limits?.().software ?? false
}

function checkRatio(pixelRatio: number): number {
  if (!(pixelRatio > 0) || !Number.isFinite(pixelRatio)) {
    throw new RangeError('graph: the pixel ratio must be a positive number')
  }
  return pixelRatio
}

function checkPadding(padding: number | undefined): number {
  if (padding === undefined) return 32
  if (!(padding >= 0) || !Number.isFinite(padding)) {
    throw new RangeError('graph: the export padding must be a finite number, 0 or more')
  }
  return padding
}

async function prepare(
  graph: object,
  options: ExportOptions,
  ratioOf: (snapshot: GraphSnapshot) => number,
): Promise<Prepared> {
  const padding = checkPadding(options.padding)
  const size = checkSize(options.size)
  if (size && options.zoom !== undefined) {
    throw new RangeError('graph: the export takes a size or a zoom, not both')
  }
  const page = onPage(graph)
  if (page) await document.fonts?.ready
  const snapshot = takeSnapshot(graph)
  const { scene, states } = snapshot
  const positions = frozenPositions(snapshot.positions)
  const containers = frozenContainers(snapshot.containers)
  const boxes = containers?.boxes ?? null
  const region = options.region ?? 'view'
  const labels = options.labels ?? 'visible'
  const measure = page ? new GlyphAtlas(snapshot.theme.font) : widthMeasure(scene.textWidth)
  const shownWindow =
    options.window === undefined
      ? snapshot.window
      : timeFilter(readWindow(options.window), snapshot.fade)
  const sightAt = (zoom: number, time: Sight['time']): Sight => ({
    zoom,
    time,
    layers: snapshot.layers,
    hide: states.hide,
  })
  const screenDetail = detailStep(
    scene.nodes,
    scene.edges,
    sightAt(snapshot.view.zoom, snapshot.window),
  )
  let screenHulls: HullInput | null = null
  const sightHulls = new Map<number, HullInput>()
  const hullsAt = (zoom: number): HullInput => {
    const sight = sightAt(zoom, shownWindow)
    const detail = detailStep(scene.nodes, scene.edges, sight)
    if (shownWindow === snapshot.window && detail === screenDetail) {
      screenHulls ??= frozenHulls(snapshot.hulls)
      return screenHulls
    }
    let hulls = sightHulls.get(detail)
    if (!hulls) {
      hulls = snapshot.hullsFor(sight, positions, containers)
      sightHulls.set(detail, hulls)
    }
    return hulls
  }
  const fitsLabels = region === 'graph' && labels !== 'none'
  const frameAt = (zoom: number | undefined, withLabels: boolean): ExportFrame => {
    const hulls = hullsAt(zoom ?? snapshot.view.zoom).shapes ?? []
    const frame = exportFrame(
      {
        nodes: scene.nodes,
        edges: scene.edges,
        positions,
        boxes,
        view: snapshot.view,
        width: snapshot.width,
        height: snapshot.height,
        window: shownWindow,
        layers: snapshot.layers,
        hide: states.hide,
        hulls,
        bundles: snapshot.bundles,
        states,
        shapes: scene.shapes,
      },
      { region, zoom, padding },
    )
    if (!withLabels || !fitsLabels) return frame
    const source = {
      nodes: scene.nodes,
      edges: scene.edges,
      positions,
      states,
      boxes,
      bundles: snapshot.bundles,
      shapes: scene.shapes,
      hulls,
    }
    return fitLabels(source, frame, labels, measure, padding)
  }
  const pixelRatio = ratioOf(snapshot)
  const frame = withoutDrafts(scene.shapes, () => {
    if (!size) return frameAt(options.zoom, true)
    const boxWidth = size.width === null ? Number.POSITIVE_INFINITY : size.width / pixelRatio
    const boxHeight = size.height === null ? Number.POSITIVE_INFINITY : size.height / pixelRatio
    const start = snapshot.view.zoom
    let zoom: number
    if (region === 'view') {
      zoom = start * Math.min(boxWidth / snapshot.width, boxHeight / snapshot.height)
    } else {
      zoom = fitZoom((at) => frameAt(at, false), boxWidth, boxHeight, start)
      if (fitsLabels) zoom = fitZoom((at) => frameAt(at, true), boxWidth, boxHeight, zoom)
    }
    const content = frameAt(zoom, true)
    const width = size.width ?? Math.max(1, Math.ceil(content.width * pixelRatio - 1e-6))
    const height = size.height ?? Math.max(1, Math.ceil(content.height * pixelRatio - 1e-6))
    return { ...content, width: width / pixelRatio, height: height / pixelRatio }
  })
  if (!(frame.width >= 1 && frame.height >= 1)) {
    throw new RangeError('graph: nothing to export, the graph measures less than one pixel')
  }
  const background = snapshot.color(options.background ?? themeColor('paper'))
  const time = options.time ?? 0
  if (!Number.isFinite(time)) throw new RangeError('graph: the time must be a finite number')
  return {
    snapshot,
    frame,
    positions,
    containers,
    hulls: hullsAt(frame.view.zoom),
    background,
    labels,
    measure,
    time: time / 1000,
    pixelRatio,
    page: page === true,
  }
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

type ImageReader = (src: string) => SvgImage | null | Promise<SvgImage | null>

function imageReader(page: boolean, options: SvgExportOptions): ImageReader {
  const { images } = options
  if (images) {
    return async (src) => {
      const found = await images(src)
      if (!found) return null
      const aspect = found.width / found.height
      return { href: found.href, aspect: aspect > 0 && Number.isFinite(aspect) ? aspect : 1 }
    }
  }
  if (!page) return (src) => ({ href: src, aspect: 1 })
  const copy = options.embedImages ?? true
  return (src) => imageOf(src, copy)
}

async function imageSources(
  snapshot: GraphSnapshot,
  read: ImageReader,
): Promise<ReadonlyMap<string, SvgImage>> {
  const { nodes } = snapshot.scene
  const sources = new Set<string>()
  for (let index = 0; index < nodes.capacity; index++) {
    if (nodes.alive[index] !== 1) continue
    const src = nodes.image[index]
    if (src) sources.add(src)
    for (const badge of nodes.badges[index] ?? []) if (badge.image) sources.add(badge.image)
  }
  const list = [...sources]
  const images = await Promise.all(list.map(async (src) => read(src)))
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
 * current theme. Text uses the theme font, which the viewer needs to have. Also takes a graph made
 * by `createGraph`, whose labels are measured with its text measure.
 */
export async function exportSvg<S extends string>(
  graph: GraphCore<S>,
  options: SvgExportOptions = {},
): Promise<string> {
  const prepared = await prepare(graph, options, () => 1)
  const { snapshot, frame, positions, containers, hulls } = prepared
  const images = await imageSources(snapshot, imageReader(prepared.page, options))
  const current = takeSnapshot(graph)
  const { scene } = current
  return withoutDrafts(scene.shapes, () =>
    writeSvg({
      nodes: scene.nodes,
      edges: scene.edges,
      layers: scene.layers,
      positions,
      states: current.states,
      grid: options.grid === false ? null : current.grid,
      badges: options.badges !== false,
      shapes: scene.shapes,
      hulls: hulls.shapes ?? [],
      containers,
      bundles: current.bundles,
      bridges: current.bridges ?? null,
      palette: current.palette,
      theme: current.theme,
      frame,
      background: prepared.background,
      labels: prepared.labels,
      measure: prepared.measure,
      images,
      title: current.title,
      time: prepared.time,
    }),
  )
}

/**
 * Draws the graph offscreen at the chosen pixel ratio and encodes it as a PNG. The drawing uses a
 * WebGL context of its own, freed at the end, and tiles past 4,096 pixels. A graph made by
 * `createGraph` has no WebGL: rasterize its `exportSvg` document instead. Without WebGL2, it
 * rejects with a `DOMException` named `NotSupportedError`.
 */
export async function exportPng<S extends string>(
  graph: GraphInstance<S>,
  options: PngExportOptions = {},
): Promise<Blob> {
  if (onPage(graph) === false) {
    throw new TypeError(
      'graph: exportPng needs a page; for a graph made by createGraph, rasterize the document of ' +
        'exportSvg, as the server-side extracts guide shows',
    )
  }
  const probe: { canvas: PngCanvas | null } = { canvas: null }
  try {
    const prepared = await prepare(graph, options, (taken) => {
      if (options.pixelRatio !== undefined) return checkRatio(options.pixelRatio)
      if (taken.software !== null) return taken.pixelRatio
      const opened = openCanvas(taken)
      probe.canvas = opened
      return taken.ratioFor(softwareOf(opened.renderer))
    })
    const { snapshot, frame, positions, containers, hulls } = prepared
    const held = (taken: GraphSnapshot): GraphSnapshot => ({
      ...taken,
      positions,
      containers,
      hulls,
    })
    const opened = probe.canvas ?? openCanvas(snapshot)
    probe.canvas = null
    return await renderPng(() => held(takeSnapshot(graph)), held(snapshot), opened, {
      frame,
      pixelRatio: prepared.pixelRatio,
      labels: prepared.labels,
      background: prepared.background,
      time: prepared.time,
      grid: options.grid !== false,
      badges: options.badges !== false,
    })
  } finally {
    probe.canvas?.renderer.destroy()
  }
}

function checkStates(states: ExportStates | undefined): ExportStates {
  if (states === undefined) return 'custom'
  if (states !== 'all' && states !== 'custom' && states !== 'none') {
    throw new TypeError(`graph: unknown export states ${String(states)}`)
  }
  return states
}

function checkZoom(zoom: number): number {
  if (!(zoom > 0) || !Number.isFinite(zoom)) {
    throw new RangeError('graph: the export zoom must be a positive number')
  }
  return zoom
}

function parentsOf<S extends string>(graph: GraphCore<S>, nodes: NodeColumns): Int32Array {
  const indices = new Map<Key, number>()
  for (let index = 0; index < nodes.capacity; index++) {
    const key = nodes.keys[index]
    if (nodes.alive[index] === 1 && key !== undefined) indices.set(key, index)
  }
  const parents = new Int32Array(nodes.capacity).fill(-1)
  for (const [key, index] of indices) {
    const parent = graph.groups.parent(key)
    if (parent !== undefined) parents[index] = indices.get(parent) ?? -1
  }
  return parents
}

function absoluteUrl(src: string): string {
  const base = globalThis.document?.baseURI
  if (!base || src.startsWith('data:')) return src
  try {
    return new URL(src, base).href
  } catch {
    return src
  }
}

function diagramOf<S extends string>(graph: GraphCore<S>, options: DiagramExportOptions): Diagram {
  const padding = checkPadding(options.padding)
  const size = checkSize(options.size)
  if (size && options.zoom !== undefined) {
    throw new RangeError('graph: the export takes a size or a zoom, not both')
  }
  const states = checkStates(options.states)
  const snapshot = takeSnapshot(graph)
  const { scene, view } = snapshot
  const region = options.region ?? 'graph'
  const source = {
    nodes: scene.nodes,
    edges: scene.edges,
    layers: scene.layers,
    positions: snapshot.positions,
    states: snapshot.states,
    containers: snapshot.containers,
    parents: snapshot.containers ? parentsOf(graph, scene.nodes) : null,
    bundles: snapshot.bundles,
    palette: snapshot.palette,
    theme: snapshot.theme,
    window:
      options.window === undefined
        ? snapshot.window
        : timeFilter(readWindow(options.window), snapshot.fade),
    layerFilter: snapshot.layers,
    title: snapshot.title,
    background: snapshot.color(options.background ?? themeColor('paper')),
    imageUrl: onPage(graph) ? absoluteUrl : (src: string) => src,
    textWidth: scene.textWidth,
  }
  const frameAt = (zoom: number): DiagramFrame => ({
    region,
    zoom,
    padding,
    view,
    width: (snapshot.width * zoom) / view.zoom,
    height: (snapshot.height * zoom) / view.zoom,
  })
  const diagramAt = (zoom: number): Diagram => readDiagram(source, frameAt(zoom), states)
  if (!size) return diagramAt(checkZoom(options.zoom ?? 1))
  const boxWidth = size.width ?? Number.POSITIVE_INFINITY
  const boxHeight = size.height ?? Number.POSITIVE_INFINITY
  const zoom =
    region === 'view'
      ? view.zoom * Math.min(boxWidth / snapshot.width, boxHeight / snapshot.height)
      : fitZoom(
          (at) => {
            const { width, height } = diagramAt(at)
            return { view: { x: 0, y: 0, zoom: at }, width, height }
          },
          boxWidth,
          boxHeight,
          1,
        )
  const content = diagramAt(zoom)
  return centered(
    content,
    size.width ?? Math.max(1, Math.ceil(content.width - 1e-6)),
    size.height ?? Math.max(1, Math.ceil(content.height - 1e-6)),
  )
}

/**
 * Serializes the graph into an uncompressed draw.io (diagrams.net) file, with one page: nodes
 * become shapes and edges become connectors attached to them, so moving a node in the editor
 * drags its edges. Unfolded groups become containers holding their children. Colors are those of
 * the current theme.
 */
export async function exportDrawio<S extends string>(
  graph: GraphCore<S>,
  options: DiagramExportOptions = {},
): Promise<string> {
  return writeDrawio(diagramOf(graph, options))
}

/**
 * Serializes the graph into a Visio drawing (`.vsdx`, Visio 2013 and later), with one page: nodes
 * become shapes and edges become connectors glued to them, so moving a node in Visio keeps its
 * edges attached. Unfolded groups become Visio groups holding their children. One diagram unit is
 * 1/96 inch. Resolves to a `Blob` of type `application/vnd.ms-visio.drawing`.
 */
export async function exportVsdx<S extends string>(
  graph: GraphCore<S>,
  options: DiagramExportOptions = {},
): Promise<Blob> {
  return writeVsdx(diagramOf(graph, options))
}
