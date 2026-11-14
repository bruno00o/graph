import {
  type ShapeGeometryData,
  type ShapeGlyphs,
  type ShapeLayer,
  type ShapeView,
  shapeKinds,
} from '../core/shape-engine'
import { type ShapeStore, unpinned } from '../core/shape-store'
import type { StateBuffers } from '../core/state-buffers'
import { openTime } from '../core/time-range'
import { detailedFrom } from '../shapes/simplify'
import { onSphere } from '../shapes/subdivide'
import { withCopies } from '../shapes/wrap'
import { createBuffer, createProgram, createVertexArray, DataTexture, formats } from './gl'
import { atlasFontSize } from './glyph-atlas'
import { glyphAttributes, glyphStride } from './glyph-attributes'
import { cornerLabel, labelFragment } from './shaders'
import {
  pinned,
  shapeAlive,
  shapeClosed,
  shapeFillFragment,
  shapeFillVertex,
  shapeIndexMask,
  shapeLabelVertex,
  shapePlaceUnit,
  shapePointsUnit,
  shapeRanged,
  shapeRect,
  shapeRingPolygon,
  shapeRoundFragment,
  shapeRoundVertex,
  shapeStateUnit,
  shapeStrokeFragment,
  shapeStrokeVertex,
  shapeStyleUnit,
  shapeTimed,
  shapeTimeUnit,
  shapeWindow,
  shapeZoomUnit,
  sphereVariant,
} from './shape-shaders'
import { textureUnits as units } from './texture-units'

interface Run {
  readonly round: boolean
  readonly pinned: boolean
  readonly first: number
  readonly count: number
  readonly records: number
  readonly recordCount: number
}

interface Pass {
  readonly program: WebGLProgram
  readonly flags: WebGLUniformLocation | null
  readonly hidden: WebGLUniformLocation | null
  readonly pass: WebGLUniformLocation | null
}

type ProgramKind = 'fill' | 'stroke' | 'round'

type Programs = Record<ProgramKind, Pass | null>

const programSources: Record<ProgramKind, readonly [string, string, boolean]> = {
  fill: [shapeFillVertex, shapeFillFragment, true],
  stroke: [shapeStrokeVertex, shapeStrokeFragment, true],
  round: [shapeRoundVertex, shapeRoundFragment, false],
}

interface LabelBuffers {
  readonly buffers: readonly [WebGLBuffer, WebGLBuffer]
  readonly vaos: readonly [WebGLVertexArrayObject, WebGLVertexArrayObject]
  readonly counts: [number, number]
}

interface LabelPass {
  readonly pass: Pass
  readonly corner: WebGLBuffer
}

interface Passes {
  readonly roundVao: WebGLVertexArrayObject
  readonly fillBuffer: WebGLBuffer
  readonly roundBuffer: WebGLBuffer
  readonly points: DataTexture<Float32Array>
  readonly styles: DataTexture<Uint32Array>
  readonly states: DataTexture<Uint32Array>
  readonly zoom: DataTexture<Float32Array>
  readonly time: DataTexture<Float32Array>
}

interface Parts {
  readonly geometry: ShapeGeometryData
  readonly pinned: boolean
  readonly slot: number
  readonly round: number
  readonly vertexStart: number
  readonly vertexCap: number
  readonly pointStart: number
  readonly pointCap: number
  fills: Uint32Array[]
  windows: Uint32Array[]
  errors: number[]
  minX: number
  minY: number
  maxX: number
  maxY: number
  cull: boolean
}

interface Frame {
  readonly indexBuffer: WebGLBuffer
  readonly windowBuffer: WebGLBuffer
  readonly fillVao: WebGLVertexArrayObject
  readonly strokeVao: WebGLVertexArrayObject
  runs: Run[]
  fillSpans: Int32Array
  strokeSpans: Int32Array
  stamp: number
  edits: number
  bucket: number
  lod: boolean
  reach: number
  cover: readonly [number, number, number, number] | null
}

const fillStride = 12
const farZoom = 3e38
const raisedSpans = 64
const maxEdits = 4096
const noHidden = new Uint32Array(4)
const roundStride = 28
const windowVertices = (shapeWindow + 1) * 2
const tolerance = 0.5
const coverMargin = 0.5
const strokeReach = 32
const noWindows = new Uint32Array(0)

class Packer {
  bytes: ArrayBuffer
  floats: Float32Array
  words: Uint32Array
  used = 0

  constructor(size: number) {
    this.bytes = new ArrayBuffer(size * 4)
    this.floats = new Float32Array(this.bytes)
    this.words = new Uint32Array(this.bytes)
  }

  reserve(more: number): void {
    const need = this.used + more
    if (need <= this.floats.length) return
    const next = new ArrayBuffer(Math.max(need, this.floats.length * 2) * 4)
    new Uint32Array(next).set(this.words.subarray(0, this.used))
    this.bytes = next
    this.floats = new Float32Array(next)
    this.words = new Uint32Array(next)
  }
}

function ringPoints(rings: Uint32Array, closed: boolean): number {
  let total = 0
  let start = 0
  for (const end of rings) {
    if (end - start >= 2) total += end - start + (closed ? 1 : 0)
    start = end
  }
  return total
}

function writeRings(
  points: Float64Array,
  rings: Uint32Array,
  closed: boolean,
  polygon: boolean,
  at: number,
  originX: number,
  originY: number,
  word: number,
  data: Float32Array,
): Uint32Array {
  const windows: number[] = []
  let start = 0
  let into = at
  for (const end of rings) {
    const n = end - start
    if (n < 2) {
      start = end
      continue
    }
    const count = closed ? n + 1 : n
    let along = 0
    let px = points[start * 2] ?? 0
    let py = points[start * 2 + 1] ?? 0
    for (let k = 0; k < count; k++) {
      const i = start + (k < n ? k : 0)
      const x = points[i * 2] ?? 0
      const y = points[i * 2 + 1] ?? 0
      if (k > 0) along += Math.hypot(x - px, y - py)
      const texel = (into + k) * 4
      data[texel] = x - originX
      data[texel + 1] = y - originY
      data[texel + 2] = along
      px = x
      py = y
    }
    for (let k = 0; k < count; k++) data[(into + k) * 4 + 3] = along
    const flags = (count | (closed ? shapeClosed : 0) | (polygon ? shapeRingPolygon : 0)) >>> 0
    for (let k = 0; k < count - 1; k += shapeWindow) windows.push(into, flags, k, word)
    into += count
    start = end
  }
  return Uint32Array.from(windows)
}

function shifted(triangles: Uint32Array, base: number): Uint32Array {
  const out = new Uint32Array(triangles.length)
  for (let k = 0; k < triangles.length; k++) out[k] = (triangles[k] ?? 0) + base
  return out
}

export function createShapeLayer(
  gl: WebGL2RenderingContext,
  blocks: Readonly<Record<string, number>>,
): ShapeLayer {
  let passes: Passes | null = null
  let version = -1
  let fillVersion = -1
  let styleVersion = -1
  let draftVersion = 0
  const widths = new Float32Array(1)
  const widthBits = new Uint32Array(widths.buffer)
  let shownX = Number.NaN
  let shownY = Number.NaN
  let flags = 0
  let zoomUsed = false
  let timeUsed = false
  let capacity = 0
  let rank = new Uint32Array(0)
  let highlighted: readonly number[] = []
  let raised: number[] = []
  let raisedFor: readonly number[] | null = null
  let raisedVersion = -1
  let variants: (Programs | null)[] = [null, null, null, null]
  let place: DataTexture<Float32Array> | null = null
  let placeKey = ''
  let labelPass: LabelPass | null = null
  let shown: ShapeStore | null = null
  const labelSets = new Map<object, LabelBuffers>()
  const frames = new Map<object, Frame>()
  let sphere = false
  let built: ShapeStore | null = null
  let parts: (Parts | null)[] = []
  let order: Uint32Array = new Uint32Array(0)
  let stamp = 0
  let edits: number[] = []
  let detailed = false
  const vertices = new Packer(1024)
  const rounds = new Packer(256)
  let pointsUsed = 0
  const current: { hidden: Uint32Array; pass: number } = { hidden: noHidden, pass: 0 }

  function program(vertex: string, fragment: string): Pass {
    const made = createProgram(gl, vertex, fragment, blocks)
    gl.useProgram(made)
    const samplers = [
      ['palette', units.palette],
      ['atlas', units.atlas],
      ['shapeStyle', shapeStyleUnit],
      ['shapeState', shapeStateUnit],
      ['shapeZoom', shapeZoomUnit],
      ['shapeTime', shapeTimeUnit],
      ['shapePlace', shapePlaceUnit],
      ['shapePoints', shapePointsUnit],
      ['nodePosition', units.nodePosition],
      ['nodeStyle', units.nodeStyle],
      ['nodeState', units.nodeState],
      ['nodeZoom', units.nodeZoom],
      ['nodeTime', units.nodeTime],
    ] as const
    for (const [name, unit] of samplers) {
      const location = gl.getUniformLocation(made, name)
      if (location) gl.uniform1i(location, unit)
    }
    return {
      program: made,
      flags: gl.getUniformLocation(made, 'shapeFlags'),
      hidden: gl.getUniformLocation(made, 'hiddenShapes'),
      pass: gl.getUniformLocation(made, 'shapePass'),
    }
  }

  function create(): Passes {
    if (passes) return passes
    const fillBuffer = gl.createBuffer()
    const roundBuffer = gl.createBuffer()
    const roundVao = gl.createVertexArray()
    gl.bindVertexArray(roundVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, roundBuffer)
    for (let location = 0; location < 3; location++) {
      gl.enableVertexAttribArray(location)
      gl.vertexAttribDivisor(location, 1)
    }
    gl.bindVertexArray(null)
    passes = {
      roundVao,
      fillBuffer,
      roundBuffer,
      points: new DataTexture(
        gl,
        formats(gl).rgba32f,
        (length) => new Float32Array(length),
        gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      ),
      styles: new DataTexture(gl, formats(gl).rgba32ui, (length) => new Uint32Array(length)),
      states: new DataTexture(gl, formats(gl).r32ui, (length) => new Uint32Array(length)),
      zoom: new DataTexture(gl, formats(gl).rg32f, (length) => new Float32Array(length)),
      time: new DataTexture(gl, formats(gl).rgba32f, (length) => new Float32Array(length)),
    }
    return passes
  }

  function frameFor(key: object, made: Passes): Frame {
    const known = frames.get(key)
    if (known) return known
    const indexBuffer = gl.createBuffer()
    const windowBuffer = gl.createBuffer()
    const fillVao = gl.createVertexArray()
    gl.bindVertexArray(fillVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, made.fillBuffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, fillStride, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_INT, fillStride, 8)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
    const strokeVao = gl.createVertexArray()
    gl.bindVertexArray(strokeVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, windowBuffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribDivisor(0, 1)
    gl.bindVertexArray(null)
    const frame: Frame = {
      indexBuffer,
      windowBuffer,
      fillVao,
      strokeVao,
      runs: [],
      fillSpans: new Int32Array(0),
      strokeSpans: new Int32Array(0),
      stamp: -1,
      edits: 0,
      bucket: 0,
      lod: false,
      reach: 0,
      cover: null,
    }
    frames.set(key, frame)
    return frame
  }

  function dropFrame(key: object): void {
    const frame = frames.get(key)
    if (!frame) return
    frames.delete(key)
    gl.deleteBuffer(frame.indexBuffer)
    gl.deleteBuffer(frame.windowBuffer)
    gl.deleteVertexArray(frame.fillVao)
    gl.deleteVertexArray(frame.strokeVao)
  }

  function passOf(kind: ProgramKind, pin: boolean): Pass {
    const at = (pin ? 2 : 0) + (sphere ? 1 : 0)
    const set = variants[at] ?? { fill: null, stroke: null, round: null }
    variants[at] = set
    const known = set[kind]
    if (known) return known
    const [vertex, fragment, sphereFragment] = programSources[kind]
    const placed = pin ? pinned(vertex) : vertex
    const made = program(
      sphere ? sphereVariant(placed) : placed,
      sphere && sphereFragment ? sphereVariant(fragment) : fragment,
    )
    set[kind] = made
    return made
  }

  function writePlace(store: ShapeStore, originX: number, originY: number): void {
    const labels = store.labels
    if (!place && store.pinCount === 0 && !labels) return
    const key = `${store.version}:${store.styleVersion}:${store.anchorVersion}:${originX}:${originY}`
    if (place && key === placeKey) return
    placeKey = key
    place ??= new DataTexture(gl, formats(gl).rgba32f, (length) => new Float32Array(length))
    place.reserve(store.capacity)
    const data = place.data
    const pins = store.pinNode
    const anchors = labels?.anchor
    for (let index = 0; index < store.capacity; index++) {
      const at = index * 4
      const pin = pins?.[index] ?? unpinned
      const x = anchors?.[index * 2] ?? Number.NaN
      const known = !Number.isNaN(x)
      data[at] = known ? x - (pin === unpinned ? originX : 0) : 0
      data[at + 1] = known ? (anchors?.[index * 2 + 1] ?? 0) - (pin === unpinned ? originY : 0) : 0
      data[at + 2] = pin
      data[at + 3] = 0
    }
    if (store.capacity > 0) place.upload(0, store.capacity - 1)
  }

  function labelProgram(): LabelPass {
    if (labelPass) return labelPass
    const pass = program(shapeLabelVertex, labelFragment)
    gl.uniform1f(gl.getUniformLocation(pass.program, 'atlasFontSize'), atlasFontSize)
    labelPass = { pass, corner: createBuffer(gl, cornerLabel, gl.STATIC_DRAW) }
    return labelPass
  }

  function forgetSet(set: object): void {
    dropFrame(set)
    const entry = labelSets.get(set)
    if (!entry) return
    labelSets.delete(set)
    for (const buffer of entry.buffers) gl.deleteBuffer(buffer)
    for (const vao of entry.vaos) gl.deleteVertexArray(vao)
  }

  function pointRound(at: number): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, passes?.roundBuffer ?? null)
    const base = at * roundStride
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, roundStride, base)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, roundStride, base + 16)
    gl.vertexAttribIPointer(2, 1, gl.UNSIGNED_INT, roundStride, base + 24)
  }

  function pointWindows(frame: Frame, at: number): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, frame.windowBuffer)
    gl.vertexAttribIPointer(0, 4, gl.UNSIGNED_INT, 16, at * 16)
  }

  function writeStyle(store: ShapeStore, data: Uint32Array, index: number): void {
    const at = index * 4
    if (store.alive[index] !== 1) {
      data[at] = 0xffffffff
      data[at + 1] = 0xffffffff
      data[at + 3] = 0
      return
    }
    widths[0] = store.strokeWidth[index] ?? 0
    data[at] = store.fill[index] ?? 0xffffffff
    data[at + 1] = store.stroke[index] ?? 0xffffffff
    data[at + 2] = widthBits[0] ?? 0
    data[at + 3] =
      ((store.dash[index] ?? 0) |
        (Math.round((store.opacity[index] ?? 1) * 255) << 8) |
        (((store.slot[index] ?? 0) & 255) << 16) |
        (store.draft[index] === 1 ? 0 : shapeAlive)) >>>
      0
  }

  function writeDrafts(store: ShapeStore, made: Passes): void {
    const data = made.styles.data
    for (const index of store.draftTouched) {
      if (index >= store.capacity) continue
      writeStyle(store, data, index)
      made.styles.upload(index, index)
    }
  }

  function writeStyles(store: ShapeStore, made: Passes): void {
    const styles = made.styles
    styles.reserve(store.capacity)
    const data = styles.data
    for (let index = 0; index < store.capacity; index++) writeStyle(store, data, index)
    styles.upload(0, store.capacity - 1)
    zoomUsed ||= store.zoom.count > 0
    timeUsed ||= store.time.count > 0
    flags = (zoomUsed ? shapeRanged : 0) | (timeUsed ? shapeTimed : 0)
    if (zoomUsed) {
      made.zoom.reserve(store.capacity)
      const ranges = made.zoom.data
      for (let index = 0; index < store.capacity; index++) {
        ranges[index * 2] = store.zoom.min[index] ?? 0
        ranges[index * 2 + 1] = Math.min(store.zoom.max[index] ?? farZoom, farZoom)
      }
      made.zoom.upload(0, store.capacity - 1)
    }
    if (timeUsed) {
      made.time.reserve(store.capacity)
      const spans = made.time.data
      const packed = store.time.packed
      for (let index = 0; index < store.capacity; index++) {
        const at = index * 4
        const known = at + 3 < packed.length
        spans[at] = known ? (packed[at] ?? -openTime) : -openTime
        spans[at + 1] = known ? (packed[at + 1] ?? 0) : 0
        spans[at + 2] = known ? (packed[at + 2] ?? openTime) : openTime
        spans[at + 3] = known ? (packed[at + 3] ?? 0) : 0
      }
      made.time.upload(0, store.capacity - 1)
    }
  }

  function writeStates(states: StateBuffers, made: Passes, full: boolean): boolean {
    const texture = made.states
    const masks = states.shapeMask
    const range = states.shapeDirty.take()
    if (full) {
      texture.reserve(capacity)
      const length = Math.min(masks.length, texture.data.length)
      texture.data.fill(0)
      texture.data.set(masks.subarray(0, length))
      texture.upload(0, capacity - 1)
      return true
    }
    if (!range) return false
    const end = Math.min(range[1] + 1, texture.data.length, masks.length)
    if (end <= range[0]) return false
    texture.data.set(masks.subarray(range[0], end), range[0])
    texture.upload(range[0], end - 1)
    return true
  }

  function sortRaised(): void {
    if (raisedFor === highlighted && raisedVersion === stamp) return
    raisedFor = highlighted
    raisedVersion = stamp
    raised = highlighted.filter((index) => (rank[index] ?? 0) > 0)
    raised.sort((a, b) => (rank[a] ?? 0) - (rank[b] ?? 0))
  }

  function drawnOf(read: ShapeGeometryData, pin: boolean): ShapeGeometryData {
    if (read.round) return read
    if (sphere) return onSphere(read)
    return pin ? read : withCopies(read)
  }

  function levelled(read: ShapeGeometryData, drawn: ShapeGeometryData): boolean {
    return drawn === read && !sphere && read.round === null
  }

  function pointsOf(read: ShapeGeometryData, drawn: ShapeGeometryData): number {
    let total = ringPoints(drawn.rings, drawn.closed)
    if (!levelled(read, drawn)) return total
    for (const level of read.levels ?? []) total += ringPoints(level.rings, read.closed)
    return total
  }

  function writeRound(at: number, geometry: ShapeGeometryData, index: number, pin: boolean) {
    const r = geometry.round
    if (!r) return
    const originX = pin ? 0 : shownX
    const originY = pin ? 0 : shownY
    const rect = geometry.kind === shapeKinds.rectangle
    const f = rounds.floats
    const word = index & shapeIndexMask
    const base = at * 7
    f[base] = (r[0] ?? 0) - originX
    f[base + 1] = (r[1] ?? 0) - originY
    f[base + 2] = r[2] ?? 0
    f[base + 3] = rect ? (r[3] ?? 0) : (r[2] ?? 0)
    f[base + 4] = rect ? 0 : (r[3] ?? 0)
    f[base + 5] = rect ? (r[4] ?? 0) : 0
    rounds.words[base + 6] = rect ? (word | shapeRect) >>> 0 : word
  }

  function writeShape(index: number, entry: Parts, read: ShapeGeometryData, made: Passes): void {
    const pin = entry.pinned
    const drawn = drawnOf(read, pin)
    const originX = pin ? 0 : shownX
    const originY = pin ? 0 : shownY
    const word = index & shapeIndexMask
    const polygon = drawn.kind === shapeKinds.polygon
    const points = drawn.points
    const count = points.length / 2
    const floats = vertices.floats
    const words = vertices.words
    let at = entry.vertexStart * 3
    if (polygon) {
      for (let k = 0; k < count; k++) {
        floats[at] = (points[k * 2] ?? 0) - originX
        floats[at + 1] = (points[k * 2 + 1] ?? 0) - originY
        words[at + 2] = word
        at += 3
      }
    }
    const data = made.points.data
    let into = entry.pointStart
    const fills: Uint32Array[] = [
      polygon ? shifted(drawn.triangles, entry.vertexStart) : new Uint32Array(0),
    ]
    const windows: Uint32Array[] = [
      writeRings(points, drawn.rings, drawn.closed, polygon, into, originX, originY, word, data),
    ]
    const errors = [0]
    into += ringPoints(drawn.rings, drawn.closed)
    if (levelled(read, drawn)) {
      for (const level of read.levels ?? []) {
        fills.push(polygon ? shifted(level.triangles, entry.vertexStart) : new Uint32Array(0))
        windows.push(
          writeRings(
            level.points,
            level.rings,
            drawn.closed,
            polygon,
            into,
            originX,
            originY,
            word,
            data,
          ),
        )
        errors.push(level.error)
        into += ringPoints(level.rings, read.closed)
      }
    }
    entry.fills = fills
    entry.windows = windows
    entry.errors = errors
    entry.minX = drawn.minX
    entry.minY = drawn.minY
    entry.maxX = drawn.maxX
    entry.maxY = drawn.maxY
    entry.cull = !pin && !sphere && drawn === read
    if (errors.length > 1) detailed = true
  }

  function slack(size: number): number {
    return size + Math.ceil(size / 8) + 4
  }

  function rebuild(store: ShapeStore, made: Passes): void {
    built = store
    order = store.drawOrder()
    parts = new Array(store.capacity).fill(null)
    rank = new Uint32Array(store.capacity)
    detailed = false
    vertices.used = 0
    rounds.used = 0
    pointsUsed = 0
    const placed: [number, Parts, ShapeGeometryData][] = []
    order.forEach((index, at) => {
      const read = store.geometry[index]
      if (!read) return
      rank[index] = at + 1
      const pin = store.pinned(index)
      const drawn = drawnOf(read, pin)
      const roundAt = read.round ? rounds.used / 7 : -1
      if (read.round) {
        rounds.reserve(7)
        rounds.used += 7
      }
      const expected =
        read.pending && read.points.length / 2 >= detailedFrom && levelled(read, drawn)
          ? Math.ceil(read.points.length * 0.2) + read.rings.length * 8
          : 0
      const vertexCap = drawn.kind === shapeKinds.polygon ? slack(drawn.points.length / 2) : 0
      const pointCap = read.round ? 0 : slack(pointsOf(read, drawn) + expected)
      const entry: Parts = {
        geometry: read,
        pinned: pin,
        slot: store.slot[index] ?? 0,
        round: roundAt,
        vertexStart: vertices.used / 3,
        vertexCap,
        pointStart: pointsUsed,
        pointCap,
        fills: [],
        windows: [],
        errors: [0],
        minX: read.minX,
        minY: read.minY,
        maxX: read.maxX,
        maxY: read.maxY,
        cull: false,
      }
      vertices.reserve(vertexCap * 3)
      vertices.used += vertexCap * 3
      pointsUsed += pointCap
      parts[index] = entry
      placed.push([index, entry, read])
    })
    made.points.reserve(pointsUsed)
    vertices.words.fill(0, 0, vertices.used)
    for (const [index, entry, read] of placed) {
      if (entry.round >= 0) writeRound(entry.round, read, index, entry.pinned)
      else writeShape(index, entry, read, made)
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, made.fillBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Uint8Array(vertices.bytes, 0, vertices.used * 4),
      gl.STATIC_DRAW,
    )
    gl.bindBuffer(gl.ARRAY_BUFFER, made.roundBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(rounds.bytes, 0, rounds.used * 4), gl.STATIC_DRAW)
    if (pointsUsed > 0) made.points.upload(0, pointsUsed - 1)
    restamp()
  }

  function restamp(): void {
    stamp++
    edits = []
  }

  function patch(store: ShapeStore, index: number, made: Passes): boolean {
    const entry = parts[index]
    const read = store.geometry[index]
    if (!entry || !read || store.pinned(index) !== entry.pinned) return false
    if ((store.slot[index] ?? 0) !== entry.slot || (read.round !== null) !== entry.round >= 0) {
      return false
    }
    const next: Parts = { ...entry, geometry: read }
    parts[index] = next
    if (read.round) {
      writeRound(entry.round, read, index, entry.pinned)
      gl.bindBuffer(gl.ARRAY_BUFFER, made.roundBuffer)
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        entry.round * roundStride,
        new Uint8Array(rounds.bytes, entry.round * roundStride, roundStride),
      )
      return true
    }
    const drawn = drawnOf(read, entry.pinned)
    const vertexCount = drawn.kind === shapeKinds.polygon ? drawn.points.length / 2 : 0
    const pointCount = pointsOf(read, drawn)
    if (vertexCount > entry.vertexCap || pointCount > entry.pointCap) return false
    writeShape(index, next, read, made)
    if (vertexCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, made.fillBuffer)
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        entry.vertexStart * fillStride,
        new Uint8Array(vertices.bytes, entry.vertexStart * fillStride, vertexCount * fillStride),
      )
    }
    if (pointCount > 0) made.points.upload(entry.pointStart, entry.pointStart + pointCount - 1)
    return true
  }

  function update(store: ShapeStore, made: Passes): boolean {
    const next = store.drawOrder()
    let same = next.length === order.length
    for (let at = 0; same && at < next.length; at++) same = next[at] === order[at]
    if (!same) {
      rebuild(store, made)
      return true
    }
    let changed = false
    for (const index of next) {
      const entry = parts[index]
      const read = store.geometry[index]
      if (
        entry &&
        entry.geometry === read &&
        entry.pinned === store.pinned(index) &&
        entry.slot === (store.slot[index] ?? 0)
      ) {
        continue
      }
      if (!patch(store, index, made)) {
        rebuild(store, made)
        return true
      }
      edits.push(index)
      changed = true
    }
    if (edits.length > maxEdits) restamp()
    return changed
  }

  function outside(entry: Parts, cover: Frame['cover'], reach: number): boolean {
    return (
      cover !== null &&
      entry.cull &&
      entry.round < 0 &&
      (entry.maxX + reach < cover[0] ||
        entry.minX - reach > cover[2] ||
        entry.maxY + reach < cover[1] ||
        entry.minY - reach > cover[3])
    )
  }

  function editFrame(frame: Frame): boolean {
    const scale = 2 ** (frame.bucket / 2)
    gl.bindVertexArray(frame.fillVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, frame.windowBuffer)
    for (let at = frame.edits; at < edits.length; at++) {
      const index = edits[at] ?? 0
      const entry = parts[index]
      if (!entry || entry.round >= 0) continue
      const shown = !outside(entry, frame.cover, frame.reach)
      const level = frame.lod ? levelOf(entry, scale) : 0
      const fill = shown ? (entry.fills[level] ?? entry.fills[0] ?? noWindows) : noWindows
      const stroke = shown ? (entry.windows[level] ?? entry.windows[0] ?? noWindows) : noWindows
      const fillRoom = frame.fillSpans[index * 2 + 1] ?? 0
      const strokeRoom = frame.strokeSpans[index * 2 + 1] ?? 0
      if (fill.length > fillRoom || stroke.length / 4 > strokeRoom) {
        gl.bindVertexArray(null)
        return false
      }
      if (fillRoom > 0) {
        const words = new Uint32Array(fillRoom)
        words.set(fill)
        gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, (frame.fillSpans[index * 2] ?? 0) * 4, words)
      }
      if (strokeRoom > 0) {
        const words = new Uint32Array(strokeRoom * 4)
        words.set(stroke)
        gl.bufferSubData(gl.ARRAY_BUFFER, (frame.strokeSpans[index * 2] ?? 0) * 16, words)
      }
    }
    gl.bindVertexArray(null)
    frame.edits = edits.length
    return true
  }

  function levelOf(entry: Parts, scale: number): number {
    const errors = entry.errors
    let level = 0
    for (let at = 1; at < errors.length; at++) {
      if ((errors[at] ?? 0) * scale > tolerance) break
      level = at
    }
    return level
  }

  function covers(frame: Frame, view: ShapeView): boolean {
    const cover = frame.cover
    if (!cover) return false
    const halfX = view.width / 2 / view.zoom
    const halfY = view.height / 2 / view.zoom
    return (
      view.x - halfX >= cover[0] &&
      view.y - halfY >= cover[1] &&
      view.x + halfX <= cover[2] &&
      view.y + halfY <= cover[3]
    )
  }

  function frameOf(key: object, view: ShapeView, made: Passes): Frame {
    const frame = frameFor(key, made)
    const lod = detailed && !sphere
    const bucket = lod ? Math.ceil(Math.log2(Math.max(view.zoom * view.pixelRatio, 1e-9)) * 2) : 0
    if (frame.stamp === stamp && (!lod || (frame.bucket === bucket && covers(frame, view)))) {
      if (frame.edits === edits.length || editFrame(frame)) return frame
    }
    frame.stamp = stamp
    frame.edits = edits.length
    frame.bucket = bucket
    frame.lod = lod
    const scale = 2 ** (bucket / 2)
    let cover: [number, number, number, number] | null = null
    let reach = 0
    if (lod) {
      const halfX = (view.width / 2 / view.zoom) * (1 + coverMargin * 2)
      const halfY = (view.height / 2 / view.zoom) * (1 + coverMargin * 2)
      cover = [view.x - halfX, view.y - halfY, view.x + halfX, view.y + halfY]
      reach = strokeReach / view.zoom
    }
    frame.cover = cover
    frame.reach = reach
    const fillSpans = new Int32Array((built?.capacity ?? 0) * 2)
    const strokeSpans = new Int32Array((built?.capacity ?? 0) * 2)
    const indices = new Packer(1024)
    const windows = new Packer(1024)
    const runs: Run[] = []
    let current: {
      round: boolean
      pinned: boolean
      slot: number
      first: number
      records: number
    } | null = null
    let roundCount = 0
    const close = () => {
      if (!current) return
      runs.push({
        round: current.round,
        pinned: current.pinned,
        first: current.first,
        count: (current.round ? roundCount : indices.used) - current.first,
        records: current.records,
        recordCount: windows.used / 4 - current.records,
      })
    }
    for (const index of order) {
      const entry = parts[index]
      if (!entry) continue
      const isRound = entry.round >= 0
      if (outside(entry, cover, reach)) continue
      if (
        !current ||
        current.round !== isRound ||
        current.slot !== entry.slot ||
        current.pinned !== entry.pinned
      ) {
        close()
        current = {
          round: isRound,
          pinned: entry.pinned,
          slot: entry.slot,
          first: isRound ? entry.round : indices.used,
          records: windows.used / 4,
        }
        roundCount = isRound ? entry.round : 0
      }
      if (isRound) {
        roundCount = entry.round + 1
        continue
      }
      const level = lod ? levelOf(entry, scale) : 0
      const fill = entry.fills[level] ?? entry.fills[0] ?? noWindows
      const stroke = entry.windows[level] ?? entry.windows[0] ?? noWindows
      fillSpans[index * 2] = indices.used
      fillSpans[index * 2 + 1] = fill.length
      strokeSpans[index * 2] = windows.used / 4
      strokeSpans[index * 2 + 1] = stroke.length / 4
      indices.reserve(fill.length)
      indices.words.set(fill, indices.used)
      indices.used += fill.length
      windows.reserve(stroke.length)
      windows.words.set(stroke, windows.used)
      windows.used += stroke.length
    }
    close()
    frame.runs = runs
    frame.fillSpans = fillSpans
    frame.strokeSpans = strokeSpans
    gl.bindVertexArray(null)
    gl.bindBuffer(gl.ARRAY_BUFFER, frame.windowBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Uint8Array(windows.bytes, 0, windows.used * 4),
      gl.DYNAMIC_DRAW,
    )
    gl.bindVertexArray(frame.fillVao)
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint8Array(indices.bytes, 0, indices.used * 4),
      gl.DYNAMIC_DRAW,
    )
    gl.bindVertexArray(null)
    return frame
  }

  function use(pass: Pass, hidden: Uint32Array, shapePass: number): void {
    gl.useProgram(pass.program)
    gl.uniform1ui(pass.flags, flags)
    gl.uniform4uiv(pass.hidden, hidden)
    gl.uniform1i(pass.pass, shapePass)
  }

  function drawFill(frame: Frame, pin: boolean, first: number, count: number) {
    if (count <= 0) return
    use(passOf('fill', pin), current.hidden, current.pass)
    gl.bindVertexArray(frame.fillVao)
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, first * 4)
  }

  function drawStroke(frame: Frame, pin: boolean, first: number, count: number) {
    if (count <= 0) return
    use(passOf('stroke', pin), current.hidden, current.pass)
    gl.bindVertexArray(frame.strokeVao)
    pointWindows(frame, first)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, windowVertices, count)
  }

  function drawRound(made: Passes, pin: boolean, first: number, count: number) {
    if (count <= 0) return
    use(passOf('round', pin), current.hidden, current.pass)
    gl.bindVertexArray(made.roundVao)
    pointRound(first)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count)
  }

  function drawRuns(made: Passes, frame: Frame): void {
    for (const run of frame.runs) {
      if (run.round) {
        drawRound(made, run.pinned, run.first, run.count)
        continue
      }
      drawFill(frame, run.pinned, run.first, run.count)
      drawStroke(frame, run.pinned, run.records, run.recordCount)
    }
  }

  function drawRaised(made: Passes, frame: Frame): void {
    sortRaised()
    if (raised.length === 0) return
    current.pass = 1
    if (raised.length > raisedSpans) {
      drawRuns(made, frame)
      return
    }
    for (const index of raised) {
      const entry = parts[index]
      if (!entry) continue
      if (entry.round >= 0) {
        drawRound(made, entry.pinned, entry.round, 1)
        continue
      }
      const fills = frame.fillSpans
      const strokes = frame.strokeSpans
      drawFill(frame, entry.pinned, fills[index * 2] ?? 0, fills[index * 2 + 1] ?? 0)
      drawStroke(frame, entry.pinned, strokes[index * 2] ?? 0, strokes[index * 2 + 1] ?? 0)
    }
  }

  function bind(made: Passes): void {
    const active = gl.getParameter(gl.ACTIVE_TEXTURE) as number
    const bound = [
      [shapeStyleUnit, made.styles.texture],
      [shapeStateUnit, made.states.texture],
      [shapeZoomUnit, made.zoom.texture],
      [shapeTimeUnit, made.time.texture],
      [shapePlaceUnit, place?.texture ?? null],
      [shapePointsUnit, made.points.texture],
    ] as const
    for (const [unit, texture] of bound) {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, texture)
    }
    gl.activeTexture(active)
  }

  return {
    sync({ store, states, originX, originY }) {
      const moved = originX !== shownX || originY !== shownY
      highlighted = states.highlightedShapes
      if (!passes && !store.any) {
        version = store.version
        styleVersion = store.styleVersion
        draftVersion = store.draftVersion
        return false
      }
      const made = create()
      const grown = store.capacity !== capacity
      capacity = store.capacity
      shownX = originX
      shownY = originY
      let changed = false
      if (moved || built !== store) {
        rebuild(store, made)
        changed = true
      } else if (store.version !== version || store.fillVersion !== fillVersion) {
        changed = update(store, made)
      }
      if (store.styleVersion !== styleVersion || grown || store.draftVersion > draftVersion + 1) {
        writeStyles(store, made)
        changed = true
      } else if (store.draftVersion !== draftVersion) {
        writeDrafts(store, made)
        changed = true
      }
      if (writeStates(states, made, grown)) changed = true
      writePlace(store, originX, originY)
      shown = store
      version = store.version
      fillVersion = store.fillVersion
      styleVersion = store.styleVersion
      draftVersion = store.draftVersion
      return changed
    },

    draw(layers, view, key) {
      if (!passes) return
      const made = passes
      if (view.globe !== sphere) {
        sphere = view.globe
        const active = gl.getParameter(gl.ACTIVE_TEXTURE) as number
        gl.activeTexture(gl.TEXTURE0 + shapePointsUnit)
        if (built) rebuild(built, made)
        gl.activeTexture(active)
      }
      if (order.length === 0) return
      const frame = frameOf(key, view, made)
      if (frame.runs.length === 0) return
      current.hidden = layers ? layers.masks.subarray(8, 12) : noHidden
      current.pass = 0
      bind(made)
      drawRuns(made, frame)
      drawRaised(made, frame)
      gl.bindVertexArray(null)
    },

    labels(set, main, highlight) {
      if (!passes || (main.count + highlight.count === 0 && !labelSets.has(set))) return
      if (shown) writePlace(shown, shownX, shownY)
      let entry = labelSets.get(set)
      if (!entry) {
        const { pass, corner } = labelProgram()
        const made = [gl.createBuffer(), gl.createBuffer()] as const
        const vao = (buffer: WebGLBuffer) =>
          createVertexArray(gl, pass.program, glyphAttributes(gl, corner, buffer))
        entry = { buffers: made, vaos: [vao(made[0]), vao(made[1])], counts: [0, 0] }
        labelSets.set(set, entry)
      }
      const lists: readonly ShapeGlyphs[] = [main, highlight]
      lists.forEach((glyphs, at) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, entry.buffers[at] ?? null)
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Uint8Array(glyphs.data, 0, glyphs.count * glyphStride),
          gl.DYNAMIC_DRAW,
        )
        entry.counts[at] = glyphs.count
      })
    },

    drawLabels(set, pass, layers) {
      const entry = labelSets.get(set)
      const count = entry?.counts[pass] ?? 0
      if (!passes || !entry || !labelPass || count === 0) return
      bind(passes)
      use(labelPass.pass, layers ? layers.masks.subarray(8, 12) : noHidden, pass)
      gl.bindVertexArray(entry.vaos[pass] ?? null)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count)
      gl.bindVertexArray(null)
    },

    forget: forgetSet,

    destroy() {
      for (const set of [...labelSets.keys()]) forgetSet(set)
      for (const key of [...frames.keys()]) dropFrame(key)
      if (labelPass) {
        gl.deleteProgram(labelPass.pass.program)
        gl.deleteBuffer(labelPass.corner)
        labelPass = null
      }
      for (const set of variants) {
        for (const made of set ? [set.fill, set.stroke, set.round] : []) {
          if (made) gl.deleteProgram(made.program)
        }
      }
      variants = [null, null, null, null]
      place?.destroy()
      place = null
      placeKey = ''
      if (!passes) return
      gl.deleteVertexArray(passes.roundVao)
      gl.deleteBuffer(passes.fillBuffer)
      gl.deleteBuffer(passes.roundBuffer)
      for (const texture of [
        passes.points,
        passes.styles,
        passes.states,
        passes.zoom,
        passes.time,
      ]) {
        texture.destroy()
      }
      passes = null
      built = null
      parts = []
      order = new Uint32Array(0)
      capacity = 0
    },
  }
}
