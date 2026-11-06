import { type EdgeColumns, type NodeColumns, noColor } from '../core/columns'
import type { ResolvedTheme } from '../dom/theme'
import type { LabelArea, Renderer, RenderInput } from '../host/renderer'
import { createBackdrop } from './backdrop'
import { bundleUnits, createBundlePass } from './bundle-pass'
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
import { GlyphBuffer, glyphStride, LabelLayer, sortBySize, sortEdgesByWidth } from './label-layer'
import {
  badgeFragment,
  badgeVertex,
  cornerCurve,
  cornerEdge,
  cornerLabel,
  cornerNode,
  curveVertex,
  edgeFragment,
  edgeVertex,
  labelFragment,
  labelVertex,
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
} as const

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
  const nodeTextures = [nodePosition, nodeStyle, nodePaint, nodeState, nodeDecor, nodeBox]
  const images = new ImageAtlas(gl, invalidate)
  const floatBits = new Float32Array(1)
  const floatWord = new Uint32Array(floatBits.buffer)
  const edgeTextures = [edgeTopology, edgeStyle, edgeState]

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

  const frameBlock = new Float32Array(28)
  const frameBuffer = gl.createBuffer()
  gl.bindBuffer(gl.UNIFORM_BUFFER, frameBuffer)
  gl.bufferData(gl.UNIFORM_BUFFER, frameBlock.byteLength, gl.DYNAMIC_DRAW)
  gl.bindBufferBase(gl.UNIFORM_BUFFER, blocks.Frame, frameBuffer)
  const statesBlock = new ArrayBuffer(3072)
  const statesBuffer = gl.createBuffer()
  gl.bindBuffer(gl.UNIFORM_BUFFER, statesBuffer)
  gl.bufferData(gl.UNIFORM_BUFFER, statesBlock.byteLength, gl.DYNAMIC_DRAW)
  gl.bindBufferBase(gl.UNIFORM_BUFFER, blocks.States, statesBuffer)
  let tableVersion = -1
  let highlightVersion = -1

  const nodeProgram = createProgram(gl, nodeVertex, nodeFragment, blocks)
  const edgeProgram = createProgram(gl, edgeVertex, edgeFragment, blocks)
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
    }
  >()
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
  const labelMainBuffer = createBuffer(gl, new Uint8Array(0), gl.DYNAMIC_DRAW)
  const labelHighlightBuffer = createBuffer(gl, new Uint8Array(0), gl.DYNAMIC_DRAW)
  const edgeLabelMainBuffer = createBuffer(gl, new Uint8Array(0), gl.DYNAMIC_DRAW)
  const edgeLabelHighlightBuffer = createBuffer(gl, new Uint8Array(0), gl.DYNAMIC_DRAW)
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
    labelMainBuffer,
    labelHighlightBuffer,
    edgeLabelMainBuffer,
    edgeLabelHighlightBuffer,
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
    labels: createVertexArray(gl, labelProgram, glyphs(labelMainBuffer)),
    labelHighlight: createVertexArray(gl, labelProgram, glyphs(labelHighlightBuffer)),
    edgeLabels: createVertexArray(gl, labelProgram, glyphs(edgeLabelMainBuffer)),
    edgeLabelHighlight: createVertexArray(gl, labelProgram, glyphs(edgeLabelHighlightBuffer)),
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
  let curvePass: {
    readonly program: WebGLProgram
    readonly main: WebGLVertexArrayObject
    readonly overlay: WebGLVertexArrayObject
  } | null = null

  function curves(): NonNullable<typeof curvePass> {
    if (curvePass) return curvePass
    const program = createProgram(gl, curveVertex, edgeFragment, blocks)
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
  let input: RenderInput | null = null
  const atlas = new GlyphAtlas('system-ui, sans-serif')
  const labels = new LabelLayer()
  let labelOrder = new Uint32Array(0)
  let labelOrderLength = 0
  let screenLabels = false
  let largestLabel = 0
  let edgeLabelOrder = new Uint32Array(0)
  let edgeLabelOrderLength = 0
  let largestEdgeLabel = 0
  let edgeOrderStale = true
  let labelsStale = true
  let originX = 0
  let originY = 0
  let labelsMoved = false
  let orderStale = true
  let lastLabelTime = Number.NEGATIVE_INFINITY
  let lastLabelView = ''
  let labelTime = 0
  const imageOf: (string | null)[] = []
  const badged = new Set<number>()
  const badgeGlyphs = new GlyphBuffer()
  let badgeData = new ArrayBuffer(badgeStride * 64)
  let badgeCount = 0
  let badgesStale = false
  let badgeGeneration = -1

  function packNode(nodes: NodeColumns, index: number): void {
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
  }

  function rebuildBadges(): void {
    if (!input) return
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
      labelsStale = true
      rebuildBadges()
      return
    }
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
    const at = index * 4
    edgeTopology.data[at] = edges.source[index] ?? 0
    edgeTopology.data[at + 1] = edges.target[index] ?? 0
    edgeTopology.data[at + 2] = edges.color[index] ?? 0
    edgeTopology.data[at + 3] =
      (edges.dash[index] ?? 0) |
      ((edges.arrow[index] ?? 0) << 2) |
      ((edges.alive[index] ?? 0) << 4) |
      ((edges.slot[index] ?? 0) << 5)
    edgeStyle.data[at] = edges.width[index] ?? 0
    edgeStyle.data[at + 1] = edges.opacity[index] ?? 1
    const bend = edges.bend[index] ?? 0
    edgeStyle.data[at + 2] = bend
    edgeStyle.data[at + 3] = edges.flow[index] ?? 0
    const isCurved =
      edges.alive[index] === 1 && (bend !== 0 || edges.source[index] === edges.target[index])
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
    }
    if (next.dirty.nodes.size > 0 || next.full) orderStale = true
    syncContainers(next, grown)
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
    labelsMoved = true
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
    if (curvedChanged) {
      curvedChanged = false
      gl.bindBuffer(gl.ARRAY_BUFFER, curveIndices)
      gl.bufferData(gl.ARRAY_BUFFER, Uint32Array.from(curved), gl.DYNAMIC_DRAW)
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
    }
    if (next.dirty.edges.size > 0 || next.full) edgeOrderStale = true
  }

  function syncStates(next: RenderInput): void {
    const states = next.states
    if (states.tableVersion !== tableVersion || next.full) {
      tableVersion = states.tableVersion
      new Float32Array(statesBlock, 0, 256).set(states.numbers)
      new Uint32Array(statesBlock, 1024, 256).set(states.paint)
      new Uint32Array(statesBlock, 2048, 256).set(states.labels)
      gl.bindBuffer(gl.UNIFORM_BUFFER, statesBuffer)
      gl.bufferSubData(gl.UNIFORM_BUFFER, 0, statesBlock)
      labelsStale = true
    }
    if (states.highlightVersion !== highlightVersion || next.full) {
      highlightVersion = states.highlightVersion
      nodeOverlayCount = states.highlightedNodes.length
      edgeOverlayCount = states.highlightedEdges.length
      gl.bindBuffer(gl.ARRAY_BUFFER, nodeOverlayIndices)
      gl.bufferData(gl.ARRAY_BUFFER, Uint32Array.from(states.highlightedNodes), gl.DYNAMIC_DRAW)
      gl.bindBuffer(gl.ARRAY_BUFFER, edgeOverlayIndices)
      gl.bufferData(gl.ARRAY_BUFFER, Uint32Array.from(states.highlightedEdges), gl.DYNAMIC_DRAW)
      labelsStale = true
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
      return
    }
    const range = atlas.takeDirty()
    if (!range) return
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

  function selectLabels(frame: LabelArea, now: number): number {
    if (!input) return -1
    const key = `${frame.view.x},${frame.view.y},${frame.view.zoom},${frame.width},${frame.height},${frame.mode}`
    if (!labelsStale && !labelsMoved && key === lastLabelView) return -1
    const wait = labelInterval - (now - lastLabelTime)
    if (!labelsStale && wait > 0) return wait
    const nodes = input.scene.nodes
    if (orderStale) {
      if (labelOrder.length < nodes.capacity) labelOrder = new Uint32Array(nodes.capacity)
      const sorted = sortBySize(nodes, labelOrder)
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
    labels.select(
      {
        nodes,
        positions: input.positions,
        view: frame.view,
        width: frame.width,
        height: frame.height,
        nodeMask: input.states.nodeMask,
        boxes: input.containers?.boxes ?? null,
        labelFlags: input.states.labelFlags,
        highlighted: input.states.highlightedNodes,
        order: labelOrder,
        orderLength: labelOrderLength,
        screenLabels,
        largestLabel,
        edges,
        edgeMask: input.states.edgeMask,
        edgeLabelFlags: input.states.edgeLabelFlags,
        highlightedEdges: input.states.highlightedEdges,
        edgeOrder: edgeLabelOrder,
        edgeOrderLength: edgeLabelOrderLength,
        largestEdgeLabel,
        mode: frame.mode,
        paths: input.bundles ?? null,
      },
      atlas,
    )
    if (atlas.generation !== generation) return selectLabels(frame, now)
    syncAtlas()
    const uploads = [
      [labelMainBuffer, labels.main],
      [labelHighlightBuffer, labels.highlight],
      [edgeLabelMainBuffer, labels.edgeMain],
      [edgeLabelHighlightBuffer, labels.edgeHighlight],
    ] as const
    for (const [buffer, glyphs] of uploads) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Uint8Array(glyphs.data, 0, glyphs.count * glyphStride),
        gl.DYNAMIC_DRAW,
      )
    }
    labelsStale = false
    labelsMoved = false
    lastLabelTime = now
    lastLabelView = key
    labelTime = performance.now() - now
    return -1
  }

  function textureBytes(): number {
    let bytes =
      paletteRows * paletteWidth * 4 + atlasRows * atlasWidth + images.bytes + bundles.bytes
    for (const texture of [...nodeTextures, ...edgeTextures]) bytes += texture.data.byteLength
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

  return {
    sync(next) {
      originX = next.positions.originX
      originY = next.positions.originY
      input = next
      images.flush()
      syncNodes(next)
      refreshImages(next.scene.nodes)
      syncEdges(next)
      syncStates(next)
      if (bundles.sync(next.bundles)) labelsMoved = true
      backdrop.sync(next)
      if (next.dirty.nodes.size > 0 || next.dirty.edges.size > 0 || next.full) labelsStale = true
      if (next.positionsChanged) labelsMoved = true
    },

    setPalette(colors, count) {
      const rows = Math.max(1, Math.ceil(count / paletteWidth))
      const data = new Uint8Array(rows * paletteWidth * 4)
      data.set(colors.subarray(0, Math.min(colors.length, data.length)))
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
      frameBlock.set(rgba(theme.halo), 8)
      frameBlock.set(rgba(theme.labelInk), 12)
      frameBlock.set(rgba(theme.labelMuted), 16)
      frameBlock.set(rgba(theme.labelHalo), 20)
      if (atlas.setFont(theme.font)) labelsStale = true
    },

    render(frame) {
      const width = gl.drawingBufferWidth
      const height = gl.drawingBufferHeight
      const viewX = frame.view.x - originX
      const viewY = frame.view.y - originY
      const centerX = Math.fround(viewX)
      const centerY = Math.fround(viewY)
      frameBlock[0] = centerX
      frameBlock[1] = centerY
      frameBlock[24] = viewX - centerX
      frameBlock[25] = viewY - centerY
      frameBlock[2] = frame.width
      frameBlock[3] = frame.height
      frameBlock[4] = frame.view.zoom
      frameBlock[5] = frame.pixelRatio
      flowTime = frame.time ?? 0
      const area: LabelArea = frame.labels ?? { ...frame, mode: 'visible' }
      frameBlock[6] = 6
      frameBlock[7] = area.mode === 'all' ? 0 : 8
      gl.bindBufferBase(gl.UNIFORM_BUFFER, blocks.Frame, frameBuffer)
      gl.bindBufferBase(gl.UNIFORM_BUFFER, blocks.States, statesBuffer)
      gl.bindBuffer(gl.UNIFORM_BUFFER, frameBuffer)
      gl.bufferSubData(gl.UNIFORM_BUFFER, 0, frameBlock)
      if (badgesStale || badgeGeneration !== atlas.generation) rebuildBadges()
      const generation = atlas.generation
      const wait = selectLabels(area, performance.now())
      if (atlas.generation !== generation) rebuildBadges()
      syncAtlas()
      images.prepare()
      gl.viewport(0, 0, width, height)
      if (shared) {
        for (const capability of [gl.DEPTH_TEST, gl.STENCIL_TEST, gl.CULL_FACE, gl.SCISSOR_TEST])
          gl.disable(capability)
      } else {
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
      }
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      bind()
      if (!warmed) warm()
      backdrop.drawGrid(frame)
      draw(nodeProgram, vertexArrays.containers, containerCount, 0, 2)
      backdrop.drawHulls()
      for (const layer of input?.scene.layers ?? []) {
        if (layer.kind === 'edges') {
          draw(edgeProgram, vertexArrays.edges, edgeCapacity, layer.slot, 0)
          if (curved.size > 0) {
            const pass = curves()
            draw(pass.program, pass.main, curved.size, layer.slot, 0)
          }
          bundles.draw((program, vao, count, vertices) =>
            draw(program, vao, count, layer.slot, 0, vertices),
          )
        } else draw(nodeProgram, vertexArrays.nodes, nodeCapacity, layer.slot, 0)
      }
      draw(badgeProgram, vertexArrays.badges, badgeCount, 0, 0)
      draw(labelProgram, vertexArrays.badgeGlyphs, badgeGlyphs.count, 0, 0)
      draw(labelProgram, vertexArrays.edgeLabels, labels.edgeMain.count, 0, 0)
      draw(labelProgram, vertexArrays.labels, labels.main.count, 0, 0)
      draw(edgeProgram, vertexArrays.edgeOverlay, edgeOverlayCount, 0, 1)
      if (curvePass && curved.size > 0) {
        draw(curvePass.program, curvePass.overlay, edgeOverlayCount, 0, 1)
      }
      bundles.overlay(edgeOverlayCount, (program, vao, count, vertices) =>
        draw(program, vao, count, 0, 1, vertices),
      )
      draw(nodeProgram, vertexArrays.nodeOverlay, nodeOverlayCount, 0, 1)
      if (nodeOverlayCount > 0) {
        draw(badgeProgram, vertexArrays.badges, badgeCount, 0, 1)
        draw(labelProgram, vertexArrays.badgeGlyphs, badgeGlyphs.count, 0, 1)
      }
      draw(labelProgram, vertexArrays.edgeLabelHighlight, labels.edgeHighlight.count, 0, 1)
      draw(labelProgram, vertexArrays.labelHighlight, labels.highlight.count, 0, 1)
      gl.bindVertexArray(null)
      return wait
    },

    stats() {
      return {
        nodeLabels: labels.nodeLabels,
        edgeLabels: labels.edgeLabels,
        labelTime,
        textureBytes: textureBytes(),
      }
    },

    ready: () => images.settled(),

    destroy() {
      for (const texture of [...nodeTextures, ...edgeTextures]) texture.destroy()
      gl.deleteTexture(palette)
      gl.deleteTexture(atlasTexture)
      images.destroy()
      backdrop.destroy()
      bundles.destroy()
      for (const buffer of [...buffers, frameBuffer, statesBuffer]) gl.deleteBuffer(buffer)
      for (const vao of Object.values(vertexArrays)) gl.deleteVertexArray(vao)
      if (curvePass) {
        gl.deleteVertexArray(curvePass.main)
        gl.deleteVertexArray(curvePass.overlay)
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
