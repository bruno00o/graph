import { type EdgeColumns, type NodeColumns, noColor } from '../core/columns'
import { arcSpan, arcStations, latitudeOf } from '../core/geo-arc'
import type { GlobeCamera } from '../core/globe'
import { maxStates, noPaint } from '../core/state-buffers'
import { openTime, type TimeFilter, type TimeSpans } from '../core/time-range'
import type { ZoomRanges } from '../core/zoom-range'
import type { ResolvedTheme } from '../dom/theme'
import type { LabelArea, LensFrame, Renderer, RenderFrame, RenderInput } from '../host/renderer'
import type { View } from '../types'
import { arcVertex } from './arc-shaders'
import { createBackdrop } from './backdrop'
import { bundleUnits, createBundlePass } from './bundle-pass'
import { bundleCorners } from './bundle-shaders'
import { EdgeCover, layerCap } from './edge-cover'
import {
  type Attribute,
  createBuffer,
  createProgram,
  createVertexArray,
  DataTexture,
  formats,
} from './gl'
import { GlState } from './gl-state'
import { atlasFontSize, atlasWidth, GlyphAtlas } from './glyph-atlas'
import { ImageAtlas } from './image-atlas'
import {
  GlyphBuffer,
  glyphStride,
  LabelLayer,
  LabelPlan,
  sortBySize,
  sortDescending,
  sortEdgesByWidth,
} from './label-layer'
import {
  badgeFragment,
  badgeVertex,
  clippedEdgeFragment,
  cornerCurve,
  cornerEdge,
  cornerLabel,
  cornerNode,
  curveVertex,
  edgeVertex,
  labelFragment,
  labelVertex,
  lensFragment,
  lensVertex,
  nodeFragment,
  nodeVertex,
} from './shaders'

function blockBindings(
  gl: WebGL2RenderingContext,
  shared: boolean,
): { readonly Frame: number; readonly States: number } {
  if (!shared) return { Frame: 0, States: 1 }
  const count = gl.getParameter(gl.MAX_UNIFORM_BUFFER_BINDINGS) as number
  return { Frame: count - 2, States: count - 1 }
}
const paletteWidth = 256
const labelInterval = 120
const badgeStride = 20
const lensRing = 1.5
const lensShadow = 10
const lensMargin = 2

const units = {
  palette: 0,
  nodePosition: 1,
  nodeStyle: 2,
  nodePaint: 3,
  nodeState: 4,
  edgeTopology: 5,
  edgeStyle: 6,
  edgeState: 7,
  atlas: 8,
  images: 9,
  nodeDecor: 10,
  nodeBox: 11,
  ...bundleUnits,
  nodeZoom: 14,
  edgeZoom: 15,
  nodeTime: 16,
  edgeTime: 17,
} as const
const farZoom = 3e38
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const noPlane = [0, 0, 0, 1]

interface LabelSet {
  readonly layer: LabelLayer
  readonly buffers: readonly [WebGLBuffer, WebGLBuffer, WebGLBuffer, WebGLBuffer]
  readonly main: WebGLVertexArrayObject
  readonly highlight: WebGLVertexArrayObject
  readonly edgeMain: WebGLVertexArrayObject
  readonly edgeHighlight: WebGLVertexArrayObject
  stale: boolean
  moved: boolean
  time: number
  view: string
  duration: number
}

interface Target {
  readonly framebuffer: WebGLFramebuffer
  readonly color: WebGLTexture
  readonly depth: WebGLRenderbuffer
  readonly width: number
  readonly height: number
}

interface LensArea extends RenderFrame {
  readonly x0: number
  readonly y0: number
  readonly size: number
}

interface LensPass {
  readonly program: WebGLProgram
  readonly vao: WebGLVertexArrayObject
  readonly box: WebGLUniformLocation | null
  readonly canvas: WebGLUniformLocation | null
  readonly origin: WebGLUniformLocation | null
  readonly ring: WebGLUniformLocation | null
  readonly colors: WebGLUniformLocation | null
}

function waitOf(a: number, b: number): number {
  if (a < 0) return b
  if (b < 0) return a
  return Math.min(a, b)
}

function iota(length: number): Uint32Array {
  const values = new Uint32Array(length)
  for (let index = 0; index < length; index++) values[index] = index
  return values
}

function rgba(color: readonly number[]): readonly number[] {
  return color.map((channel) => channel / 255)
}

export function createWebglRenderer(
  canvas: HTMLCanvasElement,
  invalidate: () => void = () => {},
): Renderer {
  const context = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    stencil: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  })
  if (!context) throw new Error('graph: WebGL2 is not available')
  return createRenderer(context, invalidate, false)
}

export function createSharedRenderer(
  gl: WebGL2RenderingContext,
  invalidate: () => void = () => {},
): Renderer {
  const state = new GlState(gl)
  const inner = state.guard(() => createRenderer(gl, invalidate, true))
  let palette: { readonly colors: Uint8Array; readonly count: number } | null = null
  const applyPalette = () => {
    if (!palette) return
    inner.setPalette(palette.colors, palette.count)
    palette = null
  }
  return {
    sync: (input) =>
      state.guard(() => {
        applyPalette()
        inner.sync(input)
      }),
    setPalette: (colors, count) => {
      palette = { colors, count }
    },
    setTheme: (theme) => inner.setTheme(theme),
    render: (frame) =>
      state.guard(() => {
        applyPalette()
        return inner.render(frame)
      }),
    stats: () => inner.stats?.() ?? { nodeLabels: 0, edgeLabels: 0, labelTime: 0, textureBytes: 0 },
    ready: () => inner.ready?.() ?? Promise.resolve(),
    destroy: () => state.guard(() => inner.destroy()),
  }
}

function createRenderer(
  gl: WebGL2RenderingContext,
  invalidate: () => void,
  shared: boolean,
): Renderer {
  const blocks = blockBindings(gl, shared)
  const capEdges = !shared && (gl.getContextAttributes()?.stencil ?? false)
  const format = formats(gl)
  const f32 = (length: number) => new Float32Array(length)
  const u32 = (length: number) => new Uint32Array(length)

  const nodePosition = new DataTexture(gl, format.rg32f, f32)
  const nodeStyle = new DataTexture(gl, format.rgba32f, f32)
  const nodePaint = new DataTexture(gl, format.rgba32ui, u32)
  const nodeState = new DataTexture(gl, format.r32ui, u32)
  const nodeDecor = new DataTexture(gl, format.rgba32ui, u32)
  const nodeBox = new DataTexture(gl, format.rgba32f, f32)
  const edgeTopology = new DataTexture(gl, format.rgba32ui, u32)
  const edgeStyle = new DataTexture(gl, format.rgba32f, f32)
  const edgeState = new DataTexture(gl, format.r32ui, u32)
  const nodeZoom = new DataTexture(gl, format.rg32f, f32)
  const edgeZoom = new DataTexture(gl, format.rg32f, f32)
  const nodeTime = new DataTexture(gl, format.rgba32f, f32)
  const edgeTime = new DataTexture(gl, format.rgba32f, f32)
  const rangeTextures = [nodeZoom, edgeZoom, nodeTime, edgeTime]
  let zoomUsed = false
  let timeUsed = false
  const nodeTextures = [nodePosition, nodeStyle, nodePaint, nodeState, nodeDecor, nodeBox]
  const images = new ImageAtlas(gl, invalidate)
  const floatBits = new Float32Array(1)
  const floatWord = new Uint32Array(floatBits.buffer)
  const edgeTextures = [edgeTopology, edgeStyle, edgeState]
  const cover = new EdgeCover()
  let coverStale = false

  const palette = gl.createTexture()
  let paletteRows = 0
  const atlasTexture = gl.createTexture()
  let atlasGeneration = -1
  let atlasRows = 0
  for (const texture of [palette, atlasTexture]) {
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const filter = texture === atlasTexture ? gl.LINEAR : gl.NEAREST
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  }

  const frameBlock = new Float32Array(68)
  const frameBuffer = gl.createBuffer()
  gl.bindBuffer(gl.UNIFORM_BUFFER, frameBuffer)
  gl.bufferData(gl.UNIFORM_BUFFER, frameBlock.byteLength, gl.DYNAMIC_DRAW)
  gl.bindBufferBase(gl.UNIFORM_BUFFER, blocks.Frame, frameBuffer)
  const statesBlock = new ArrayBuffer(3088)
  const statesBuffer = gl.createBuffer()
  gl.bindBuffer(gl.UNIFORM_BUFFER, statesBuffer)
  gl.bufferData(gl.UNIFORM_BUFFER, statesBlock.byteLength, gl.DYNAMIC_DRAW)
  gl.bindBufferBase(gl.UNIFORM_BUFFER, blocks.States, statesBuffer)
  let tableVersion = -1
  let highlightVersion = -1

  const nodeProgram = createProgram(gl, nodeVertex, nodeFragment, blocks)
  const edgeProgram = createProgram(gl, edgeVertex, clippedEdgeFragment, blocks)
  const labelProgram = createProgram(gl, labelVertex, labelFragment, blocks)
  const badgeProgram = createProgram(gl, badgeVertex, badgeFragment, blocks)
  const programs = [nodeProgram, edgeProgram, labelProgram, badgeProgram]
  const locations = new Map<
    WebGLProgram,
    {
      readonly layerSlot: WebGLUniformLocation | null
      readonly overlay: WebGLUniformLocation | null
      readonly flowTime: WebGLUniformLocation | null
      readonly bundleMix: WebGLUniformLocation | null
      readonly arcPiece: WebGLUniformLocation | null
    }
  >()
  let arcPiece = 0
  let flowTime = 0
  function prepare(program: WebGLProgram): void {
    gl.useProgram(program)
    for (const [name, unit] of Object.entries(units)) {
      const location = gl.getUniformLocation(program, name)
      if (location) gl.uniform1i(location, unit)
    }
    locations.set(program, {
      layerSlot: gl.getUniformLocation(program, 'layerSlot'),
      overlay: gl.getUniformLocation(program, 'overlay'),
      flowTime: gl.getUniformLocation(program, 'flowTime'),
      bundleMix: gl.getUniformLocation(program, 'bundleMix'),
      arcPiece: gl.getUniformLocation(program, 'arcPiece'),
    })
  }
  for (const program of programs) prepare(program)
  gl.useProgram(labelProgram)
  gl.uniform1f(gl.getUniformLocation(labelProgram, 'atlasFontSize'), atlasFontSize)

  const backdrop = createBackdrop(gl, blocks)
  const nodeCorner = createBuffer(gl, cornerNode, gl.STATIC_DRAW)
  const edgeCorner = createBuffer(gl, cornerEdge, gl.STATIC_DRAW)
  const curveCorner = createBuffer(gl, cornerCurve, gl.STATIC_DRAW)
  const labelCorner = createBuffer(gl, cornerLabel, gl.STATIC_DRAW)
  const nodeIndices = createBuffer(gl, new Uint32Array(0), gl.STATIC_DRAW)
  const edgeIndices = createBuffer(gl, new Uint32Array(0), gl.STATIC_DRAW)
  const nodeOverlayIndices = createBuffer(gl, new Uint32Array(0), gl.DYNAMIC_DRAW)
  const edgeOverlayIndices = createBuffer(gl, new Uint32Array(0), gl.DYNAMIC_DRAW)
  const curveIndices = createBuffer(gl, new Uint32Array(0), gl.DYNAMIC_DRAW)
  const containerIndices = createBuffer(gl, new Uint32Array(0), gl.DYNAMIC_DRAW)
  const badgeBuffer = createBuffer(gl, new Uint8Array(0), gl.DYNAMIC_DRAW)
  const badgeGlyphBuffer = createBuffer(gl, new Uint8Array(0), gl.DYNAMIC_DRAW)
  const warmIndex = createBuffer(gl, new Uint32Array(1), gl.STATIC_DRAW)
  const warmGlyph = createBuffer(gl, new Uint8Array(glyphStride), gl.STATIC_DRAW)
  const warmBadge = createBuffer(gl, new Uint8Array(badgeStride), gl.STATIC_DRAW)
  const buffers = [
    nodeCorner,
    edgeCorner,
    curveCorner,
    labelCorner,
    nodeIndices,
    edgeIndices,
    nodeOverlayIndices,
    edgeOverlayIndices,
    curveIndices,
    containerIndices,
    badgeBuffer,
    badgeGlyphBuffer,
    warmIndex,
    warmGlyph,
    warmBadge,
  ]

  const corner = (buffer: WebGLBuffer, size = 2): Attribute => ({
    name: 'corner',
    buffer,
    size,
    type: gl.FLOAT,
    divisor: 0,
  })
  const instance = (buffer: WebGLBuffer): Attribute => ({
    name: 'instance',
    buffer,
    size: 1,
    type: gl.UNSIGNED_INT,
    integer: true,
    divisor: 1,
  })
  const glyphs = (buffer: WebGLBuffer): Attribute[] => [
    corner(labelCorner),
    {
      name: 'glyphNode',
      buffer,
      size: 1,
      type: gl.UNSIGNED_INT,
      integer: true,
      divisor: 1,
      stride: glyphStride,
      offset: 0,
    },
    {
      name: 'glyphKind',
      buffer,
      size: 1,
      type: gl.UNSIGNED_INT,
      integer: true,
      divisor: 1,
      stride: glyphStride,
      offset: 4,
    },
    {
      name: 'glyphRect',
      buffer,
      size: 4,
      type: gl.FLOAT,
      divisor: 1,
      stride: glyphStride,
      offset: 8,
    },
    {
      name: 'glyphUv',
      buffer,
      size: 4,
      type: gl.UNSIGNED_SHORT,
      normalized: true,
      divisor: 1,
      stride: glyphStride,
      offset: 24,
    },
    {
      name: 'glyphColor',
      buffer,
      size: 1,
      type: gl.UNSIGNED_INT,
      integer: true,
      divisor: 1,
      stride: glyphStride,
      offset: 32,
    },
    {
      name: 'glyphSize',
      buffer,
      size: 1,
      type: gl.FLOAT,
      divisor: 1,
      stride: glyphStride,
      offset: 36,
    },
  ]
  const badgeField = (
    buffer: WebGLBuffer,
    name: string,
    offset: number,
    type: number = gl.UNSIGNED_INT,
  ): Attribute => ({
    name,
    buffer,
    size: 1,
    type,
    integer: type === gl.UNSIGNED_INT,
    divisor: 1,
    stride: badgeStride,
    offset,
  })
  const badgeAttributes = (buffer: WebGLBuffer): Attribute[] => [
    corner(nodeCorner),
    badgeField(buffer, 'badgeNode', 0),
    badgeField(buffer, 'badgeInfo', 4),
    badgeField(buffer, 'badgeFill', 8),
    badgeField(buffer, 'badgeRingColor', 12),
    badgeField(buffer, 'badgeText', 16, gl.FLOAT),
  ]
  const vertexArrays = {
    nodes: createVertexArray(gl, nodeProgram, [corner(nodeCorner), instance(nodeIndices)]),
    nodeOverlay: createVertexArray(gl, nodeProgram, [
      corner(nodeCorner),
      instance(nodeOverlayIndices),
    ]),
    containers: createVertexArray(gl, nodeProgram, [
      corner(nodeCorner),
      instance(containerIndices),
    ]),
    edges: createVertexArray(gl, edgeProgram, [corner(edgeCorner, 3), instance(edgeIndices)]),
    edgeOverlay: createVertexArray(gl, edgeProgram, [
      corner(edgeCorner, 3),
      instance(edgeOverlayIndices),
    ]),
    badges: createVertexArray(gl, badgeProgram, badgeAttributes(badgeBuffer)),
    badgeGlyphs: createVertexArray(gl, labelProgram, glyphs(badgeGlyphBuffer)),
  }
  const vertexCounts = new Map<WebGLProgram, number>([
    [nodeProgram, cornerNode.length / 2],
    [edgeProgram, cornerEdge.length / 3],
    [labelProgram, cornerLabel.length / 2],
    [badgeProgram, cornerNode.length / 2],
  ])
  let warmed = false
  const bundles = createBundlePass(gl, blocks, prepare, edgeOverlayIndices)
  const arcCorner = createBuffer(gl, bundleCorners(arcStations), gl.STATIC_DRAW)
  const geodesicIndices = createBuffer(gl, new Uint32Array(0), gl.DYNAMIC_DRAW)
  const spanIndices = createBuffer(gl, new Uint32Array(0), gl.DYNAMIC_DRAW)
  buffers.push(arcCorner, geodesicIndices, spanIndices)
  let arcPass: {
    readonly program: WebGLProgram
    readonly geodesic: WebGLVertexArrayObject
    readonly spans: WebGLVertexArrayObject
    readonly overlay: WebGLVertexArrayObject
  } | null = null
  let spanOrder = new Uint32Array(0)
  let spanValues = new Float32Array(0)
  let spanSorted = new Float32Array(0)
  let spanLength = 0
  let spansStale = true

  function sortSpans(): void {
    spansStale = false
    const scene = input?.scene
    const positions = input?.positions
    if (!scene || !positions) return
    const edges = scene.edges
    if (spanValues.length < edges.capacity) {
      spanValues = new Float32Array(edges.capacity)
      spanOrder = new Uint32Array(edges.capacity)
    }
    spanLength = 0
    for (let index = 0; index < edges.capacity; index++) {
      const source = edges.source[index] ?? 0
      const target = edges.target[index] ?? 0
      if (edges.alive[index] !== 1 || source === target || edges.geodesic[index] === 1) continue
      const ax = positions.x(source)
      const ay = positions.y(source)
      const dx = positions.x(target)
      const dy = positions.y(target)
      const span = Math.hypot(dx - ax, dy - ay) * Math.cos(latitudeOf((ay + dy) / 2))
      if (!(span > 0)) continue
      spanValues[index] = span
      spanOrder[spanLength++] = index
    }
    sortDescending(spanOrder, spanLength, spanValues)
    if (spanSorted.length < spanLength) spanSorted = new Float32Array(spanOrder.length)
    for (let at = 0; at < spanLength; at++) spanSorted[at] = spanValues[spanOrder[at] ?? 0] ?? 0
    gl.bindBuffer(gl.ARRAY_BUFFER, spanIndices)
    gl.bufferData(gl.ARRAY_BUFFER, spanOrder.subarray(0, spanLength), gl.DYNAMIC_DRAW)
  }

  function spanCount(threshold: number): number {
    if (spansStale) sortSpans()
    let low = 0
    let high = spanLength
    while (low < high) {
      const middle = (low + high) >>> 1
      if ((spanSorted[middle] ?? 0) > threshold) low = middle + 1
      else high = middle
    }
    return low
  }

  function arcs(): NonNullable<typeof arcPass> {
    if (arcPass) return arcPass
    const program = createProgram(gl, arcVertex, clippedEdgeFragment, blocks)
    prepare(program)
    programs.push(program)
    vertexCounts.set(program, arcStations * 2)
    const strip = corner(arcCorner)
    arcPass = {
      program,
      geodesic: createVertexArray(gl, program, [strip, instance(geodesicIndices)]),
      spans: createVertexArray(gl, program, [strip, instance(spanIndices)]),
      overlay: createVertexArray(gl, program, [strip, instance(edgeOverlayIndices)]),
    }
    return arcPass
  }

  let curvePass: {
    readonly program: WebGLProgram
    readonly main: WebGLVertexArrayObject
    readonly overlay: WebGLVertexArrayObject
  } | null = null

  function curves(): NonNullable<typeof curvePass> {
    if (curvePass) return curvePass
    const program = createProgram(gl, curveVertex, clippedEdgeFragment, blocks)
    prepare(program)
    programs.push(program)
    vertexCounts.set(program, cornerCurve.length / 3)
    curvePass = {
      program,
      main: createVertexArray(gl, program, [corner(curveCorner, 3), instance(curveIndices)]),
      overlay: createVertexArray(gl, program, [
        corner(curveCorner, 3),
        instance(edgeOverlayIndices),
      ]),
    }
    return curvePass
  }

  let nodeCapacity = 0
  let edgeCapacity = 0
  let nodeOverlayCount = 0
  let containerCount = 0
  let containerVersion = -1
  let edgeOverlayCount = 0
  const curved = new Set<number>()
  let curvedFlags = new Uint8Array(0)
  let curvedChanged = false
  const geodesics = new Set<number>()
  let geodesicChanged = false
  let input: RenderInput | null = null
  const atlas = new GlyphAtlas('system-ui, sans-serif')
  const mainLabels = createLabelSet()
  let lensLabels: LabelSet | null = null
  const labelSets: LabelSet[] = [mainLabels]
  const labelPlan = new LabelPlan()
  let labelOrder = new Uint32Array(0)
  let labelOrderLength = 0
  let screenLabels = false
  let largestLabel = 0
  let edgeLabelOrder = new Uint32Array(0)
  let edgeLabelOrderLength = 0
  let largestEdgeLabel = 0
  let edgeOrderStale = true
  let originX = 0
  let originY = 0
  let orderStale = true
  let contentVersion = 0
  let timeWindow: TimeFilter | null = null
  let cachedVersion = -1
  let cachedKey = ''
  let cache: Target | null = null
  let lensTarget: Target | null = null
  let lensPass: LensPass | null = null
  const lensColors = new Float32Array(12)

  function createLabelSet(): LabelSet {
    const empty = () => createBuffer(gl, new Uint8Array(0), gl.DYNAMIC_DRAW)
    const buffers = [empty(), empty(), empty(), empty()] as const
    const vao = (buffer: WebGLBuffer) => createVertexArray(gl, labelProgram, glyphs(buffer))
    return {
      layer: new LabelLayer(),
      buffers,
      main: vao(buffers[0]),
      highlight: vao(buffers[1]),
      edgeMain: vao(buffers[2]),
      edgeHighlight: vao(buffers[3]),
      stale: true,
      moved: false,
      time: Number.NEGATIVE_INFINITY,
      view: '',
      duration: 0,
    }
  }

  function destroyLabelSet(set: LabelSet): void {
    for (const buffer of set.buffers) gl.deleteBuffer(buffer)
    for (const vao of [set.main, set.highlight, set.edgeMain, set.edgeHighlight])
      gl.deleteVertexArray(vao)
  }

  function invalidateLabels(): void {
    for (const set of labelSets) set.stale = true
  }

  function moveLabels(): void {
    for (const set of labelSets) set.moved = true
  }

  function touch(): void {
    contentVersion++
  }
  const imageOf: (string | null)[] = []
  const badged = new Set<number>()
  const badgeGlyphs = new GlyphBuffer()
  let badgeData = new ArrayBuffer(badgeStride * 64)
  let badgeCount = 0
  let badgesStale = false
  let badgeGeneration = -1

  function packNode(nodes: NodeColumns, index: number): void {
    for (const set of labelSets) set.layer.forgetNode(index)
    const at = index * 4
    const flags =
      (nodes.shape[index] ?? 0) |
      ((nodes.screenUnits[index] ?? 0) << 2) |
      ((nodes.alive[index] ?? 0) << 3)
    nodeStyle.data[at] = nodes.size[index] ?? 0
    nodeStyle.data[at + 1] = nodes.strokeWidth[index] ?? 0
    nodeStyle.data[at + 2] = nodes.opacity[index] ?? 1
    nodeStyle.data[at + 3] = flags
    nodePaint.data[at] = nodes.fill[index] ?? 0
    nodePaint.data[at + 1] = nodes.stroke[index] ?? 0
    nodePaint.data[at + 2] = nodes.slot[index] ?? 0
    nodePaint.data[at + 3] = nodes.outline[index] ?? noColor
    const src = nodes.alive[index] === 1 ? (nodes.image[index] ?? null) : null
    const previous = imageOf[index] ?? null
    if (src !== previous) {
      if (previous) images.release(previous)
      if (src) images.acquire(src)
      imageOf[index] = src
    }
    floatBits[0] = nodes.imageScale[index] ?? 1
    nodeDecor.data[at] = src ? images.layer(src) + 1 : 0
    nodeDecor.data[at + 1] = nodes.imageColor[index] ?? noColor
    nodeDecor.data[at + 2] = floatWord[0] ?? 0
    floatBits[0] = nodes.outlineWidth[index] ?? 0
    nodeDecor.data[at + 3] = floatWord[0] ?? 0
    const badges = nodes.alive[index] === 1 ? nodes.badges[index] : null
    if (!badges && badged.size === 0) return
    if (badges || badged.has(index)) badgesStale = true
    if (badges) badged.add(index)
    else badged.delete(index)
  }

  function refreshImages(nodes: NodeColumns): void {
    const loaded = images.takeLoaded()
    if (!loaded) return
    let first = Number.POSITIVE_INFINITY
    let last = -1
    for (let index = 0; index < nodes.capacity; index++) {
      const src = imageOf[index]
      if (!src || !loaded.has(src)) continue
      nodeDecor.data[index * 4] = images.layer(src) + 1
      first = Math.min(first, index)
      last = Math.max(last, index)
    }
    nodeDecor.upload(first, last)
    touch()
  }

  function rebuildBadges(): void {
    if (!input) return
    touch()
    const nodes = input.scene.nodes
    const generation = atlas.generation
    badgeGlyphs.clear()
    badgeCount = 0
    let words = new Uint32Array(badgeData)
    let floats = new Float32Array(badgeData)
    for (const index of badged) {
      for (const badge of nodes.badges[index] ?? []) {
        if ((badgeCount + 1) * badgeStride > badgeData.byteLength) {
          const grown = new ArrayBuffer(badgeData.byteLength * 2)
          new Uint8Array(grown).set(new Uint8Array(badgeData))
          badgeData = grown
          words = new Uint32Array(badgeData)
          floats = new Float32Array(badgeData)
        }
        const line = badge.text ? atlas.line(badge.text, 500) : null
        const at = badgeCount * (badgeStride / 4)
        words[at] = index
        words[at + 1] = badge.corner | (line ? 4 : 0)
        words[at + 2] = badge.fill
        words[at + 3] = badge.ring
        floats[at + 4] = line?.width ?? 0
        if (line)
          badgeGlyphs.push(index, 2 | (badge.corner << 2), line, atlas.height, 0, 0, 1, badge.color)
        badgeCount++
      }
    }
    if (atlas.generation !== generation) {
      invalidateLabels()
      rebuildBadges()
      return
    }
    touch()
    badgesStale = false
    badgeGeneration = atlas.generation
    gl.bindBuffer(gl.ARRAY_BUFFER, badgeBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Uint8Array(badgeData, 0, badgeCount * badgeStride),
      gl.DYNAMIC_DRAW,
    )
    gl.bindBuffer(gl.ARRAY_BUFFER, badgeGlyphBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Uint8Array(badgeGlyphs.data, 0, badgeGlyphs.count * glyphStride),
      gl.DYNAMIC_DRAW,
    )
  }

  function packEdge(edges: EdgeColumns, index: number): void {
    for (const set of labelSets) set.layer.forgetEdge(index)
    const at = index * 4
    edgeTopology.data[at] = edges.source[index] ?? 0
    edgeTopology.data[at + 1] = edges.target[index] ?? 0
    edgeTopology.data[at + 2] = edges.color[index] ?? 0
    edgeTopology.data[at + 3] =
      (edges.dash[index] ?? 0) |
      ((edges.arrow[index] ?? 0) << 2) |
      ((edges.alive[index] ?? 0) << 4) |
      ((edges.geodesic[index] ?? 0) << 5) |
      ((edges.slot[index] ?? 0) << 6)
    edgeStyle.data[at] = edges.width[index] ?? 0
    edgeStyle.data[at + 1] = edges.opacity[index] ?? 1
    const bend = edges.bend[index] ?? 0
    edgeStyle.data[at + 2] = bend
    edgeStyle.data[at + 3] = edges.flow[index] ?? 0
    if (capEdges) {
      cover.set(index, edges.alive[index] === 1, edges.opacity[index] ?? 1, edges.color[index] ?? 0)
    }
    const isCurved =
      edges.alive[index] === 1 && (bend !== 0 || edges.source[index] === edges.target[index])
    const isGeodesic = edges.alive[index] === 1 && edges.geodesic[index] === 1
    if (isGeodesic !== geodesics.has(index)) {
      if (isGeodesic) geodesics.add(index)
      else geodesics.delete(index)
      geodesicChanged = true
    }
    if (isCurved !== (curvedFlags[index] === 1)) {
      curvedFlags[index] = isCurved ? 1 : 0
      if (isCurved) curved.add(index)
      else curved.delete(index)
      curvedChanged = true
    }
  }

  function syncNodes(next: RenderInput): void {
    const nodes = next.scene.nodes
    const grown = nodeTextures.map((texture) => texture.reserve(nodes.capacity)).some(Boolean)
    if (nodes.capacity > nodeCapacity) {
      nodeCapacity = nodes.capacity
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeIndices)
      gl.bufferData(gl.ARRAY_BUFFER, iota(nodeCapacity), gl.STATIC_DRAW)
    }
    let first = Number.POSITIVE_INFINITY
    let last = -1
    if (next.full || grown) {
      for (let index = 0; index < nodes.capacity; index++) packNode(nodes, index)
      first = 0
      last = nodes.capacity - 1
    } else {
      for (const index of next.dirty.nodes.indices()) {
        packNode(nodes, index)
        first = Math.min(first, index)
        last = Math.max(last, index)
      }
    }
    nodeStyle.upload(first, last)
    nodePaint.upload(first, last)
    nodeDecor.upload(first, last)
    if (last >= first) touch()
    if (next.positionsChanged || next.full || grown) {
      const xy = next.positions.xy
      nodePosition.data.set(xy.subarray(0, Math.min(xy.length, nodePosition.data.length)))
      nodePosition.upload(0, nodeCapacity - 1)
    }
    const states = next.states
    const range = states.nodeDirty.take()
    if (next.full || grown) {
      nodeState.data.set(
        states.nodeMask.subarray(0, Math.min(states.nodeMask.length, nodeState.data.length)),
      )
      nodeState.upload(0, nodeCapacity - 1)
    } else if (range) {
      nodeState.data.set(states.nodeMask.subarray(range[0], range[1] + 1), range[0])
      nodeState.upload(range[0], range[1])
      touch()
    }
    if (next.dirty.nodes.size > 0 || next.full) orderStale = true
    syncContainers(next, grown)
  }

  function packZoom(texture: DataTexture<Float32Array>, ranges: ZoomRanges, index: number): void {
    texture.data[index * 2] = ranges.min[index] ?? 0
    texture.data[index * 2 + 1] = Math.min(ranges.max[index] ?? farZoom, farZoom)
  }

  function syncZoom(next: RenderInput): void {
    const { nodes, edges } = next.scene
    let full = next.full
    if (!zoomUsed) {
      if (nodes.zoom.count === 0 && edges.zoom.count === 0) return
      zoomUsed = true
      full = true
    }
    const pairs = [
      [nodeZoom, nodes.zoom, nodes.capacity, next.dirty.nodes],
      [edgeZoom, edges.zoom, edges.capacity, next.dirty.edges],
    ] as const
    for (const [texture, ranges, capacity, dirty] of pairs) {
      const all = texture.reserve(capacity) || full
      let first = all ? 0 : Number.POSITIVE_INFINITY
      let last = all ? capacity - 1 : -1
      if (all) {
        for (let index = 0; index < capacity; index++) packZoom(texture, ranges, index)
      } else {
        for (const index of dirty.indices()) {
          packZoom(texture, ranges, index)
          first = Math.min(first, index)
          last = Math.max(last, index)
        }
      }
      texture.upload(first, last)
      if (last >= first) touch()
    }
  }

  function packSpan(texture: DataTexture<Float32Array>, spans: TimeSpans, index: number): void {
    const at = index * 4
    const data = texture.data
    if (at + 3 < spans.packed.length) {
      data[at] = spans.packed[at] ?? -openTime
      data[at + 1] = spans.packed[at + 1] ?? 0
      data[at + 2] = spans.packed[at + 2] ?? openTime
      data[at + 3] = spans.packed[at + 3] ?? 0
    } else {
      data[at] = -openTime
      data[at + 1] = 0
      data[at + 2] = openTime
      data[at + 3] = 0
    }
  }

  function syncTime(next: RenderInput): void {
    const { nodes, edges } = next.scene
    let full = next.full
    if (!timeUsed) {
      if (nodes.time.count === 0 && edges.time.count === 0) return
      timeUsed = true
      full = true
    }
    const pairs = [
      [nodeTime, nodes.time, nodes.capacity, next.dirty.nodes],
      [edgeTime, edges.time, edges.capacity, next.dirty.edges],
    ] as const
    for (const [texture, spans, capacity, dirty] of pairs) {
      const all = texture.reserve(capacity) || full
      let first = all ? 0 : Number.POSITIVE_INFINITY
      let last = all ? capacity - 1 : -1
      if (all) {
        const length = Math.min(spans.packed.length, capacity * 4)
        texture.data.set(spans.packed.subarray(0, length))
        for (let index = length / 4; index < capacity; index++) packSpan(texture, spans, index)
      } else {
        for (const index of dirty.indices()) {
          packSpan(texture, spans, index)
          first = Math.min(first, index)
          last = Math.max(last, index)
        }
      }
      texture.upload(first, last)
    }
  }

  function windowFading(window: TimeFilter | null | undefined): boolean {
    if (!window || window.fade <= 0 || !input) return false
    return input.scene.nodes.time.count + input.scene.edges.time.count > 0
  }

  function syncContainers(next: RenderInput, grown: boolean): void {
    const containers = next.containers
    if (!containers || (containers.version === containerVersion && !grown && !next.full)) return
    containerVersion = containers.version
    const data = nodeBox.data
    data.set(containers.boxes.subarray(0, Math.min(containers.boxes.length, data.length)))
    nodeBox.upload(0, nodeCapacity - 1)
    containerCount = containers.count
    gl.bindBuffer(gl.ARRAY_BUFFER, containerIndices)
    gl.bufferData(gl.ARRAY_BUFFER, containers.order.subarray(0, containerCount), gl.DYNAMIC_DRAW)
    moveLabels()
    touch()
  }

  function syncEdges(next: RenderInput): void {
    const edges = next.scene.edges
    const grown = edgeTextures.map((texture) => texture.reserve(edges.capacity)).some(Boolean)
    if (curvedFlags.length < edges.capacity) {
      const flags = new Uint8Array(edges.capacity)
      flags.set(curvedFlags)
      curvedFlags = flags
    }
    if (edges.capacity > edgeCapacity) {
      edgeCapacity = edges.capacity
      gl.bindBuffer(gl.ARRAY_BUFFER, edgeIndices)
      gl.bufferData(gl.ARRAY_BUFFER, iota(edgeCapacity), gl.STATIC_DRAW)
    }
    let first = Number.POSITIVE_INFINITY
    let last = -1
    if (next.full || grown) {
      for (let index = 0; index < edges.capacity; index++) packEdge(edges, index)
      first = 0
      last = edges.capacity - 1
    } else {
      for (const index of next.dirty.edges.indices()) {
        packEdge(edges, index)
        first = Math.min(first, index)
        last = Math.max(last, index)
      }
    }
    edgeTopology.upload(first, last)
    edgeStyle.upload(first, last)
    if (last >= first) touch()
    if (curvedChanged) {
      curvedChanged = false
      gl.bindBuffer(gl.ARRAY_BUFFER, curveIndices)
      gl.bufferData(gl.ARRAY_BUFFER, Uint32Array.from(curved), gl.DYNAMIC_DRAW)
    }
    if (geodesicChanged) {
      geodesicChanged = false
      gl.bindBuffer(gl.ARRAY_BUFFER, geodesicIndices)
      gl.bufferData(gl.ARRAY_BUFFER, Uint32Array.from(geodesics), gl.DYNAMIC_DRAW)
    }
    const states = next.states
    const range = states.edgeDirty.take()
    if (next.full || grown) {
      edgeState.data.set(
        states.edgeMask.subarray(0, Math.min(states.edgeMask.length, edgeState.data.length)),
      )
      edgeState.upload(0, edgeCapacity - 1)
    } else if (range) {
      edgeState.data.set(states.edgeMask.subarray(range[0], range[1] + 1), range[0])
      edgeState.upload(range[0], range[1])
      touch()
    }
    if (next.dirty.edges.size > 0 || next.full) edgeOrderStale = true
    if (next.dirty.edges.size > 0 || next.full || next.positionsChanged) spansStale = true
  }

  function syncStates(next: RenderInput): void {
    const states = next.states
    if (states.tableVersion !== tableVersion || next.full) {
      tableVersion = states.tableVersion
      new Float32Array(statesBlock, 0, 256).set(states.numbers)
      new Uint32Array(statesBlock, 1024, 256).set(states.paint)
      new Uint32Array(statesBlock, 2048, 256).set(states.labels)
      new Uint32Array(statesBlock, 3072, 4).set([states.nodeRaise, states.edgeRaise, 0, 0])
      gl.bindBuffer(gl.UNIFORM_BUFFER, statesBuffer)
      gl.bufferSubData(gl.UNIFORM_BUFFER, 0, statesBlock)
      invalidateLabels()
      touch()
    }
    if (states.highlightVersion !== highlightVersion || next.full) {
      highlightVersion = states.highlightVersion
      nodeOverlayCount = states.highlightedNodes.length
      edgeOverlayCount = states.highlightedEdges.length
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeOverlayIndices)
      gl.bufferData(gl.ARRAY_BUFFER, Uint32Array.from(states.highlightedNodes), gl.DYNAMIC_DRAW)
      gl.bindBuffer(gl.ARRAY_BUFFER, edgeOverlayIndices)
      gl.bufferData(gl.ARRAY_BUFFER, Uint32Array.from(states.highlightedEdges), gl.DYNAMIC_DRAW)
      invalidateLabels()
      touch()
    }
  }

  function syncAtlas(): void {
    if (atlas.generation !== atlasGeneration || atlas.height !== atlasRows) {
      atlasGeneration = atlas.generation
      atlasRows = atlas.height
      atlas.takeDirty()
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8,
        atlasWidth,
        atlas.height,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        atlas.pixels,
      )
      touch()
      return
    }
    const range = atlas.takeDirty()
    if (!range) return
    touch()
    gl.bindTexture(gl.TEXTURE_2D, atlasTexture)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      range[0],
      atlasWidth,
      range[1] - range[0] + 1,
      gl.RED,
      gl.UNSIGNED_BYTE,
      atlas.pixels.subarray(range[0] * atlasWidth, (range[1] + 1) * atlasWidth),
    )
  }

  function selectLabels(set: LabelSet, frame: LabelArea, now: number): number {
    if (!input) return -1
    const key = `${frame.view.x},${frame.view.y},${frame.view.zoom},${frame.width},${frame.height},${frame.mode},${timeWindow?.serial ?? 0},${frame.globe?.mix ?? 0}`
    if (!set.stale && !set.moved && key === set.view) return -1
    const wait = labelInterval - (now - set.time)
    if (!set.stale && wait > 0) return wait
    const nodes = input.scene.nodes
    if (orderStale) {
      if (labelOrder.length < nodes.capacity) labelOrder = new Uint32Array(nodes.capacity)
      const sorted = sortBySize(nodes, labelOrder, labelPlan)
      labelOrderLength = sorted.length
      screenLabels = sorted.screenLabels
      largestLabel = sorted.largest
      orderStale = false
    }
    const edges = input.scene.edges
    if (edgeOrderStale) {
      if (edgeLabelOrder.length < edges.capacity) edgeLabelOrder = new Uint32Array(edges.capacity)
      const sortedEdges = sortEdgesByWidth(edges, edgeLabelOrder)
      edgeLabelOrderLength = sortedEdges.length
      largestEdgeLabel = sortedEdges.largest
      edgeOrderStale = false
    }
    const generation = atlas.generation
    const layer = set.layer
    layer.select(
      {
        nodes,
        positions: input.positions,
        view: frame.view,
        sight: { zoom: frame.view.zoom, time: timeWindow },
        width: frame.width,
        height: frame.height,
        nodeMask: input.states.nodeMask,
        boxes: input.containers?.boxes ?? null,
        labelFlags: input.states.labelFlags,
        highlighted: input.states.highlightedNodes,
        raise: input.states.nodeRaise,
        order: labelOrder,
        orderLength: labelOrderLength,
        plan: labelPlan,
        screenLabels,
        largestLabel,
        edges,
        edgeMask: input.states.edgeMask,
        edgeLabelFlags: input.states.edgeLabelFlags,
        highlightedEdges: input.states.highlightedEdges,
        edgeRaise: input.states.edgeRaise,
        edgeOrder: edgeLabelOrder,
        edgeOrderLength: edgeLabelOrderLength,
        largestEdgeLabel,
        mode: frame.mode,
        paths: input.bundles ?? null,
        globe: frame.globe && frame.globe.mix > 0 ? frame.globe : null,
      },
      atlas,
    )
    if (atlas.generation !== generation) {
      invalidateLabels()
      return selectLabels(set, frame, now)
    }
    syncAtlas()
    const uploads = [layer.main, layer.highlight, layer.edgeMain, layer.edgeHighlight] as const
    uploads.forEach((glyphs, at) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, set.buffers[at] ?? null)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Uint8Array(glyphs.data, 0, glyphs.count * glyphStride),
        gl.DYNAMIC_DRAW,
      )
    })
    set.stale = false
    set.moved = false
    set.time = now
    set.view = key
    set.duration = performance.now() - now
    if (set === mainLabels) touch()
    return -1
  }

  function edgeLayerCap(zoom: number): number {
    if (!input || windowFading(timeWindow)) return 0
    const edges = input.scene.edges
    if (input.scene.nodes.zoom.fading(zoom) || edges.zoom.fading(zoom)) return 0
    if (coverStale) {
      coverStale = false
      for (let index = 0; index < edges.capacity; index++) {
        cover.set(
          index,
          edges.alive[index] === 1,
          edges.opacity[index] ?? 1,
          edges.color[index] ?? 0,
        )
      }
    }
    const { numbers, paint, edgeRaise } = input.states
    let opacity = 1
    let alpha = 1
    for (let bit = 0; bit < maxStates; bit++) {
      if (((edgeRaise >>> bit) & 1) === 1) continue
      const at = (maxStates + bit) * 4
      const factor = numbers[at] ?? -1
      if (factor >= 0) opacity = Math.min(opacity, factor)
      const stroke = paint[at + 1] ?? noPaint
      if (stroke !== noPaint) alpha = Math.min(alpha, cover.alphaOf(stroke))
    }
    return layerCap(cover.lowest() * opacity * alpha)
  }

  function textureBytes(): number {
    let bytes =
      paletteRows * paletteWidth * 4 + atlasRows * atlasWidth + images.bytes + bundles.bytes
    for (const texture of [...nodeTextures, ...edgeTextures, ...rangeTextures]) {
      bytes += texture.data.byteLength
    }
    return bytes
  }

  function draw(
    program: WebGLProgram,
    vao: WebGLVertexArrayObject,
    count: number,
    slot: number,
    overlay: number,
    vertices: number = vertexCounts.get(program) ?? 4,
  ): void {
    if (count === 0) return
    const location = locations.get(program)
    gl.useProgram(program)
    gl.uniform1i(location?.layerSlot ?? null, slot)
    gl.uniform1i(location?.overlay ?? null, overlay)
    if (location?.flowTime) gl.uniform1f(location.flowTime, flowTime)
    if (location?.bundleMix) gl.uniform1f(location.bundleMix, bundles.mix)
    if (location?.arcPiece) gl.uniform1f(location.arcPiece, arcPiece)
    gl.bindVertexArray(vao)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, vertices, count)
  }

  function warm(): void {
    const passes: Array<readonly [WebGLProgram, Attribute[]]> = [
      [nodeProgram, [corner(nodeCorner), instance(warmIndex)]],
      [edgeProgram, [corner(edgeCorner, 3), instance(warmIndex)]],
      [labelProgram, glyphs(warmGlyph)],
      [badgeProgram, badgeAttributes(warmBadge)],
    ]
    const box = shared ? (gl.getParameter(gl.SCISSOR_BOX) as Int32Array) : null
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(0, 0, 0, 0)
    for (const [program, attributes] of passes) {
      const vao = createVertexArray(gl, program, attributes)
      draw(program, vao, 1, 0, 0)
      gl.bindVertexArray(null)
      gl.deleteVertexArray(vao)
    }
    gl.disable(gl.SCISSOR_TEST)
    if (box) gl.scissor(box[0] ?? 0, box[1] ?? 0, box[2] ?? 0, box[3] ?? 0)
    warmed = true
  }

  function writeFrame(
    view: View,
    width: number,
    height: number,
    pixelRatio: number,
    all: boolean,
    globe: GlobeCamera | null,
  ) {
    const viewX = view.x - originX
    const viewY = view.y - originY
    const centerX = Math.fround(viewX)
    const centerY = Math.fround(viewY)
    frameBlock[0] = centerX
    frameBlock[1] = centerY
    frameBlock[24] = viewX - centerX
    frameBlock[25] = viewY - centerY
    frameBlock[2] = width
    frameBlock[3] = height
    frameBlock[4] = view.zoom
    frameBlock[5] = pixelRatio
    frameBlock[26] =
      zoomUsed && input && input.scene.nodes.zoom.count + input.scene.edges.zoom.count > 0 ? 1 : 0
    frameBlock[6] = 6
    frameBlock[7] = all ? 0 : 8
    const timed =
      timeWindow !== null &&
      timeUsed &&
      input !== null &&
      input.scene.nodes.time.count + input.scene.edges.time.count > 0
    if (timeWindow) frameBlock.set(timeWindow.packed, 28)
    frameBlock[32] = timed ? 1 : 0
    frameBlock[33] = timeWindow?.fade ?? 0
    frameBlock[34] = timeWindow?.point ? 1 : 0
    frameBlock.set(globe ? globe.matrix : identity, 36)
    frameBlock.set(globe ? globe.plane : noPlane, 52)
    frameBlock[56] = globe ? (globe.view.x - view.x) * view.zoom + (width - globe.width) / 2 : 0
    frameBlock[57] = globe ? (globe.view.y - view.y) * view.zoom + (height - globe.height) / 2 : 0
    frameBlock[58] = globe?.width ?? width
    frameBlock[59] = globe?.height ?? height
    frameBlock[60] = originX
    frameBlock[61] = originY
    frameBlock[62] = globe?.mix ?? 0
    frameBlock[63] = globe?.depth ?? 1
    frameBlock[64] = globe?.scale ?? view.zoom
    frameBlock[65] = globe ? Math.min(arcSpan(globe), 3e38) : 3e38
    gl.bindBuffer(gl.UNIFORM_BUFFER, frameBuffer)
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, frameBlock)
  }

  function drawGeodesics(
    vao: WebGLVertexArrayObject,
    count: number,
    slot: number,
    overlay: number,
    globe: GlobeCamera | null,
  ): void {
    const program = arcs().program
    draw(program, vao, count, slot, overlay)
    if (globe) return
    arcPiece = 1
    draw(program, vao, count, slot, overlay)
    arcPiece = 0
  }

  function drawScene(frame: RenderFrame, set: LabelSet, all: boolean): void {
    const globe = frame.globe && frame.globe.mix > 0 ? frame.globe : null
    writeFrame(frame.view, frame.width, frame.height, frame.pixelRatio, all, globe)
    const spans = globe ? spanCount(arcSpan(globe) * 0.9) : 0
    let stencilClean = false
    const edgeLayers = capEdges ? edgeLayerCap(frame.view.zoom) : 0
    backdrop.drawGrid(frame)
    draw(nodeProgram, vertexArrays.containers, containerCount, 0, 2)
    backdrop.drawHulls()
    for (const layer of input?.scene.layers ?? []) {
      if (layer.kind === 'edges') {
        if (edgeLayers > 0) {
          if (!stencilClean) {
            gl.clearStencil(0)
            gl.clear(gl.STENCIL_BUFFER_BIT)
            stencilClean = true
          }
          gl.enable(gl.STENCIL_TEST)
          gl.stencilFunc(gl.GREATER, edgeLayers, 0xff)
          gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR)
        }
        draw(edgeProgram, vertexArrays.edges, edgeCapacity, layer.slot, 0)
        if (curved.size > 0) {
          const pass = curves()
          draw(pass.program, pass.main, curved.size, layer.slot, 0)
        }
        bundles.draw((program, vao, count, vertices) =>
          draw(program, vao, count, layer.slot, 0, vertices),
        )
        if (spans > 0) draw(arcs().program, arcs().spans, spans, layer.slot, 0)
        if (geodesics.size > 0) drawGeodesics(arcs().geodesic, geodesics.size, layer.slot, 0, globe)
        if (edgeLayers > 0) gl.disable(gl.STENCIL_TEST)
      } else {
        draw(nodeProgram, vertexArrays.nodes, nodeCapacity, layer.slot, 0)
        stencilClean = false
      }
    }
    const layer = set.layer
    draw(badgeProgram, vertexArrays.badges, badgeCount, 0, 0)
    draw(labelProgram, vertexArrays.badgeGlyphs, badgeGlyphs.count, 0, 0)
    draw(labelProgram, set.edgeMain, layer.edgeMain.count, 0, 0)
    draw(labelProgram, set.main, layer.main.count, 0, 0)
    draw(edgeProgram, vertexArrays.edgeOverlay, edgeOverlayCount, 0, 1)
    if (curvePass && curved.size > 0) {
      draw(curvePass.program, curvePass.overlay, edgeOverlayCount, 0, 1)
    }
    bundles.overlay(edgeOverlayCount, (program, vao, count, vertices) =>
      draw(program, vao, count, 0, 1, vertices),
    )
    if (globe || geodesics.size > 0) {
      drawGeodesics(arcs().overlay, edgeOverlayCount, 0, 1, globe)
    }
    draw(nodeProgram, vertexArrays.nodeOverlay, nodeOverlayCount, 0, 1)
    if (nodeOverlayCount > 0) {
      draw(badgeProgram, vertexArrays.badges, badgeCount, 0, 1)
      draw(labelProgram, vertexArrays.badgeGlyphs, badgeGlyphs.count, 0, 1)
    }
    draw(labelProgram, set.edgeHighlight, layer.edgeHighlight.count, 0, 1)
    draw(labelProgram, set.highlight, layer.highlight.count, 0, 1)
    gl.bindVertexArray(null)
  }

  function createTarget(previous: Target | null, width: number, height: number): Target {
    if (previous && previous.width === width && previous.height === height) return previous
    if (previous) destroyTarget(previous)
    const color = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, color)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height)
    const depth = gl.createRenderbuffer()
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth)
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height)
    const framebuffer = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, depth)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindRenderbuffer(gl.RENDERBUFFER, null)
    return { framebuffer, color, depth, width, height }
  }

  function destroyTarget(target: Target): void {
    gl.deleteFramebuffer(target.framebuffer)
    gl.deleteTexture(target.color)
    gl.deleteRenderbuffer(target.depth)
  }

  function releaseLens(): void {
    if (cache) destroyTarget(cache)
    if (lensTarget) destroyTarget(lensTarget)
    cache = null
    lensTarget = null
    cachedVersion = -1
  }

  function lensProgram(): LensPass {
    if (lensPass) return lensPass
    const program = createProgram(gl, lensVertex, lensFragment, {})
    gl.useProgram(program)
    gl.uniform1i(gl.getUniformLocation(program, 'lensImage'), 0)
    lensPass = {
      program,
      vao: createVertexArray(gl, program, [corner(nodeCorner)]),
      box: gl.getUniformLocation(program, 'lensBox'),
      canvas: gl.getUniformLocation(program, 'lensCanvas'),
      origin: gl.getUniformLocation(program, 'lensOrigin'),
      ring: gl.getUniformLocation(program, 'lensRing'),
      colors: gl.getUniformLocation(program, 'lensColors'),
    }
    return lensPass
  }

  function lensFrame(lens: LensFrame, ratio: number): LensArea {
    const reach = Math.ceil(lens.radius * ratio) + lensMargin
    const size = reach * 2
    const x0 = Math.floor(lens.x * ratio) - reach
    const y0 = Math.floor(lens.y * ratio) - reach
    const zoom = lens.view.zoom
    return {
      view: {
        x: lens.view.x + ((x0 + reach) / ratio - lens.x) / zoom,
        y: lens.view.y + ((y0 + reach) / ratio - lens.y) / zoom,
        zoom,
      },
      width: size / ratio,
      height: size / ratio,
      pixelRatio: ratio,
      x0,
      y0,
      size,
    }
  }

  function drawLens(lens: LensFrame, ratio: number, area: LensArea, target: Target): void {
    const width = gl.drawingBufferWidth
    const height = gl.drawingBufferHeight
    const pass = lensProgram()
    const radius = lens.radius * ratio
    gl.useProgram(pass.program)
    gl.uniform4f(
      pass.box,
      lens.x * ratio,
      height - lens.y * ratio,
      radius,
      radius + lensShadow * ratio,
    )
    gl.uniform2f(pass.canvas, width, height)
    gl.uniform2i(pass.origin, area.x0, height - target.height - area.y0)
    gl.uniform2f(pass.ring, lensRing * ratio, 0.5 * ratio)
    gl.uniform4fv(pass.colors, lensColors)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, target.color)
    gl.bindVertexArray(pass.vao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
    gl.bindTexture(gl.TEXTURE_2D, palette)
  }

  return {
    sync(next) {
      originX = next.positions.originX
      originY = next.positions.originY
      input = next
      images.flush()
      syncNodes(next)
      refreshImages(next.scene.nodes)
      syncEdges(next)
      syncZoom(next)
      syncTime(next)
      syncStates(next)
      if (bundles.sync(next.bundles)) {
        moveLabels()
        touch()
      }
      if (backdrop.sync(next)) touch()
      const changed = next.dirty.nodes.size > 0 || next.dirty.edges.size > 0 || next.full
      if (changed) invalidateLabels()
      if (next.positionsChanged) moveLabels()
      if (changed || next.positionsChanged || next.dirty.layers) touch()
    },

    setPalette(colors, count) {
      touch()
      const rows = Math.max(1, Math.ceil(count / paletteWidth))
      const data = new Uint8Array(rows * paletteWidth * 4)
      data.set(colors.subarray(0, Math.min(colors.length, data.length)))
      cover.setPalette(data, count)
      coverStale = capEdges
      gl.bindTexture(gl.TEXTURE_2D, palette)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
      if (rows !== paletteRows) {
        paletteRows = rows
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          paletteWidth,
          rows,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          data,
        )
      } else {
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          paletteWidth,
          rows,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          data,
        )
      }
    },

    setTheme(theme: ResolvedTheme) {
      touch()
      frameBlock.set(rgba(theme.halo), 8)
      frameBlock.set(rgba(theme.labelInk), 12)
      frameBlock.set(rgba(theme.labelMuted), 16)
      frameBlock.set(rgba(theme.labelHalo), 20)
      lensColors.set(rgba(theme.lensFill), 0)
      lensColors.set(rgba(theme.lensRing), 4)
      lensColors.set(rgba(theme.lensShadow), 8)
      if (atlas.setFont(theme.font)) invalidateLabels()
    },

    render(frame) {
      const width = gl.drawingBufferWidth
      const height = gl.drawingBufferHeight
      const lens = shared ? null : (frame.lens ?? null)
      const ratio = frame.pixelRatio
      const window = frame.window ?? null
      if (window !== timeWindow) {
        timeWindow = window
        touch()
      }
      flowTime = frame.time ?? 0
      const area: LabelArea = frame.labels ?? { ...frame, mode: 'visible' }
      const all = area.mode === 'all'
      gl.bindBufferBase(gl.UNIFORM_BUFFER, blocks.Frame, frameBuffer)
      gl.bindBufferBase(gl.UNIFORM_BUFFER, blocks.States, statesBuffer)
      if (badgesStale || badgeGeneration !== atlas.generation) rebuildBadges()
      const inLens = lens ? lensFrame(lens, ratio) : null
      if (inLens && !lensLabels) {
        lensLabels = createLabelSet()
        labelSets.push(lensLabels)
      }
      const generation = atlas.generation
      const now = performance.now()
      let wait = selectLabels(mainLabels, area, now)
      if (inLens && lensLabels) {
        wait = waitOf(wait, selectLabels(lensLabels, { ...inLens, mode: 'visible' }, now))
        if (mainLabels.stale) selectLabels(mainLabels, area, now)
      }
      if (atlas.generation !== generation) rebuildBadges()
      syncAtlas()
      images.prepare()
      if (shared) {
        for (const capability of [gl.DEPTH_TEST, gl.STENCIL_TEST, gl.CULL_FACE, gl.SCISSOR_TEST])
          gl.disable(capability)
      }
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      bind()
      if (!warmed) warm()
      if (!lens || !inLens) {
        if (cache || lensTarget) releaseLens()
        gl.viewport(0, 0, width, height)
        if (!shared) {
          gl.clearColor(0, 0, 0, 0)
          gl.clear(gl.COLOR_BUFFER_BIT)
        }
        drawScene(frame, mainLabels, all)
        return wait
      }
      gl.clearColor(0, 0, 0, 0)
      cache = createTarget(cache, width, height)
      const key = `${frame.view.x},${frame.view.y},${frame.view.zoom},${frame.width},${frame.height},${ratio},${flowTime},${bundles.mix}`
      if (cachedVersion !== contentVersion || cachedKey !== key) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, cache.framebuffer)
        gl.viewport(0, 0, width, height)
        gl.clear(gl.COLOR_BUFFER_BIT)
        drawScene(frame, mainLabels, all)
        cachedVersion = contentVersion
        cachedKey = key
      }
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, cache.framebuffer)
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null)
      gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST)
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
      lensTarget = createTarget(lensTarget, inLens.size, inLens.size)
      gl.bindFramebuffer(gl.FRAMEBUFFER, lensTarget.framebuffer)
      gl.viewport(0, 0, inLens.size, inLens.size)
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (lensLabels) drawScene(inLens, lensLabels, false)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, width, height)
      drawLens(lens, ratio, inLens, lensTarget)
      return wait
    },

    stats() {
      return {
        nodeLabels: mainLabels.layer.nodeLabels,
        edgeLabels: mainLabels.layer.edgeLabels,
        labelTime: mainLabels.duration,
        textureBytes: textureBytes(),
      }
    },

    ready: () => images.settled(),

    destroy() {
      for (const texture of [...nodeTextures, ...edgeTextures, ...rangeTextures]) texture.destroy()
      gl.deleteTexture(palette)
      gl.deleteTexture(atlasTexture)
      images.destroy()
      backdrop.destroy()
      bundles.destroy()
      releaseLens()
      for (const set of labelSets) destroyLabelSet(set)
      for (const buffer of [...buffers, frameBuffer, statesBuffer]) gl.deleteBuffer(buffer)
      for (const vao of Object.values(vertexArrays)) gl.deleteVertexArray(vao)
      if (curvePass) {
        gl.deleteVertexArray(curvePass.main)
        gl.deleteVertexArray(curvePass.overlay)
      }
      if (arcPass) {
        gl.deleteVertexArray(arcPass.geodesic)
        gl.deleteVertexArray(arcPass.spans)
        gl.deleteVertexArray(arcPass.overlay)
      }
      if (lensPass) {
        gl.deleteVertexArray(lensPass.vao)
        gl.deleteProgram(lensPass.program)
      }
      for (const program of programs) gl.deleteProgram(program)
      if (!shared) gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }

  function bind(): void {
    const textures: Array<readonly [number, WebGLTexture]> = [
      [units.palette, palette],
      [units.nodePosition, nodePosition.texture],
      [units.nodeStyle, nodeStyle.texture],
      [units.nodePaint, nodePaint.texture],
      [units.nodeState, nodeState.texture],
      [units.edgeTopology, edgeTopology.texture],
      [units.edgeStyle, edgeStyle.texture],
      [units.edgeState, edgeState.texture],
      [units.atlas, atlasTexture],
      [units.nodeDecor, nodeDecor.texture],
      [units.nodeBox, nodeBox.texture],
      [units.nodeZoom, nodeZoom.texture],
      [units.edgeZoom, edgeZoom.texture],
      [units.nodeTime, nodeTime.texture],
      [units.edgeTime, edgeTime.texture],
    ]
    for (const [unit, texture] of textures) {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, texture)
    }
    bundles.bind()
    gl.activeTexture(gl.TEXTURE0 + units.images)
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, images.texture)
  }
}
