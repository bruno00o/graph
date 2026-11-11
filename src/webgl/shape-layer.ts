import type { LayerFilter } from '../core/mark-layers'
import { type ShapeLayer, shapeKinds } from '../core/shape-engine'
import type { ShapeStore } from '../core/shape-store'
import type { StateBuffers } from '../core/state-buffers'
import { openTime } from '../core/time-range'
import { createProgram, DataTexture, formats } from './gl'
import {
  shapeAlive,
  shapeFillFragment,
  shapeFillVertex,
  shapeIndexMask,
  shapePolygon,
  shapeRanged,
  shapeRect,
  shapeRoundFragment,
  shapeRoundVertex,
  shapeSkip,
  shapeStateUnit,
  shapeStrokeFragment,
  shapeStrokeVertex,
  shapeStyleUnit,
  shapeTimed,
  shapeTimeUnit,
  shapeZoomUnit,
} from './shape-shaders'

interface Run {
  readonly round: boolean
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

interface Passes {
  readonly fill: Pass
  readonly stroke: Pass
  readonly round: Pass
  readonly fillVao: WebGLVertexArrayObject
  readonly strokeVao: WebGLVertexArrayObject
  readonly roundVao: WebGLVertexArrayObject
  readonly fillBuffer: WebGLBuffer
  readonly indexBuffer: WebGLBuffer
  readonly strokeBuffer: WebGLBuffer
  readonly roundBuffer: WebGLBuffer
  readonly styles: DataTexture<Uint32Array>
  readonly states: DataTexture<Uint32Array>
  readonly zoom: DataTexture<Float32Array>
  readonly time: DataTexture<Float32Array>
}

const fillStride = 12
const farZoom = 3e38
const raisedSpans = 64
const noHidden = new Uint32Array(4)
const strokeStride = 20
const roundStride = 28

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

export function createShapeLayer(
  gl: WebGL2RenderingContext,
  blocks: Readonly<Record<string, number>>,
): ShapeLayer {
  let passes: Passes | null = null
  let version = -1
  let styleVersion = -1
  let shownX = Number.NaN
  let shownY = Number.NaN
  let runs: Run[] = []
  let flags = 0
  let zoomUsed = false
  let timeUsed = false
  let capacity = 0
  let rank = new Uint32Array(0)
  let fillSpans = new Int32Array(0)
  let strokeSpans = new Int32Array(0)
  let roundSpans = new Int32Array(0)
  let highlighted: readonly number[] = []
  let raised: number[] = []
  let raisedFor: readonly number[] | null = null
  let raisedVersion = -1

  function program(vertex: string, fragment: string): Pass {
    const made = createProgram(gl, vertex, fragment, blocks)
    gl.useProgram(made)
    gl.uniform1i(gl.getUniformLocation(made, 'palette'), 0)
    gl.uniform1i(gl.getUniformLocation(made, 'shapeStyle'), shapeStyleUnit)
    gl.uniform1i(gl.getUniformLocation(made, 'shapeState'), shapeStateUnit)
    gl.uniform1i(gl.getUniformLocation(made, 'shapeZoom'), shapeZoomUnit)
    gl.uniform1i(gl.getUniformLocation(made, 'shapeTime'), shapeTimeUnit)
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
    const indexBuffer = gl.createBuffer()
    const strokeBuffer = gl.createBuffer()
    const roundBuffer = gl.createBuffer()
    const fillVao = gl.createVertexArray()
    gl.bindVertexArray(fillVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, fillBuffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, fillStride, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_INT, fillStride, 8)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
    const strokeVao = gl.createVertexArray()
    gl.bindVertexArray(strokeVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, strokeBuffer)
    for (let location = 0; location < 5; location++) {
      gl.enableVertexAttribArray(location)
      gl.vertexAttribDivisor(location, 1)
    }
    const roundVao = gl.createVertexArray()
    gl.bindVertexArray(roundVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, roundBuffer)
    for (let location = 0; location < 3; location++) {
      gl.enableVertexAttribArray(location)
      gl.vertexAttribDivisor(location, 1)
    }
    gl.bindVertexArray(null)
    passes = {
      fill: program(shapeFillVertex, shapeFillFragment),
      stroke: program(shapeStrokeVertex, shapeStrokeFragment),
      round: program(shapeRoundVertex, shapeRoundFragment),
      fillVao,
      strokeVao,
      roundVao,
      fillBuffer,
      indexBuffer,
      strokeBuffer,
      roundBuffer,
      styles: new DataTexture(gl, formats(gl).rgba32ui, (length) => new Uint32Array(length)),
      states: new DataTexture(gl, formats(gl).r32ui, (length) => new Uint32Array(length)),
      zoom: new DataTexture(gl, formats(gl).rg32f, (length) => new Float32Array(length)),
      time: new DataTexture(gl, formats(gl).rgba32f, (length) => new Float32Array(length)),
    }
    return passes
  }

  function pointStroke(at: number): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, passes?.strokeBuffer ?? null)
    const base = at * strokeStride
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, strokeStride, base)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, strokeStride, base + strokeStride)
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, strokeStride, base + strokeStride * 2)
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, strokeStride, base + strokeStride * 3)
    gl.vertexAttribIPointer(4, 1, gl.UNSIGNED_INT, strokeStride, base + strokeStride + 16)
  }

  function pointRound(at: number): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, passes?.roundBuffer ?? null)
    const base = at * roundStride
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, roundStride, base)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, roundStride, base + 16)
    gl.vertexAttribIPointer(2, 1, gl.UNSIGNED_INT, roundStride, base + 24)
  }

  function writeStyles(store: ShapeStore, made: Passes): void {
    const styles = made.styles
    styles.reserve(store.capacity)
    const data = styles.data
    const widths = new Float32Array(1)
    const widthBits = new Uint32Array(widths.buffer)
    for (let index = 0; index < store.capacity; index++) {
      const at = index * 4
      if (store.alive[index] !== 1) {
        data[at] = 0xffffffff
        data[at + 1] = 0xffffffff
        data[at + 3] = 0
        continue
      }
      widths[0] = store.strokeWidth[index] ?? 0
      data[at] = store.fill[index] ?? 0xffffffff
      data[at + 1] = store.stroke[index] ?? 0xffffffff
      data[at + 2] = widthBits[0] ?? 0
      data[at + 3] =
        ((store.dash[index] ?? 0) |
          (Math.round((store.opacity[index] ?? 1) * 255) << 8) |
          (((store.slot[index] ?? 0) & 255) << 16) |
          shapeAlive) >>>
        0
    }
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
    if (raisedFor === highlighted && raisedVersion === version) return
    raisedFor = highlighted
    raisedVersion = version
    raised = highlighted.filter((index) => (rank[index] ?? 0) > 0)
    raised.sort((a, b) => (rank[a] ?? 0) - (rank[b] ?? 0))
  }

  function build(store: ShapeStore, originX: number, originY: number, made: Passes): void {
    const fill = new Packer(1024)
    const indices = new Packer(1024)
    const stroke = new Packer(1024)
    const round = new Packer(256)
    const next: Run[] = []
    rank = new Uint32Array(store.capacity)
    fillSpans = new Int32Array(store.capacity * 2)
    strokeSpans = new Int32Array(store.capacity * 2)
    roundSpans = new Int32Array(store.capacity).fill(-1)
    let position = 0
    let current: { round: boolean; slot: number; first: number; records: number } | null = null
    const close = () => {
      if (!current) return
      next.push({
        round: current.round,
        first: current.first,
        count: (current.round ? round.used / 7 : indices.used) - current.first,
        records: current.records,
        recordCount: stroke.used / 5 - current.records,
      })
    }
    for (const index of store.drawOrder()) {
      const geometry = store.geometry[index]
      if (!geometry) continue
      rank[index] = ++position
      const isRound = geometry.round !== null
      const slot = store.slot[index] ?? 0
      if (!current || current.round !== isRound || current.slot !== slot) {
        close()
        current = {
          round: isRound,
          slot,
          first: isRound ? round.used / 7 : indices.used,
          records: stroke.used / 5,
        }
      }
      const word = index & shapeIndexMask
      if (geometry.round) {
        const r = geometry.round
        const rect = geometry.kind === shapeKinds.rectangle
        round.reserve(7)
        const f = round.floats
        const at = round.used
        f[at] = (r[0] ?? 0) - originX
        f[at + 1] = (r[1] ?? 0) - originY
        f[at + 2] = r[2] ?? 0
        f[at + 3] = rect ? (r[3] ?? 0) : (r[2] ?? 0)
        f[at + 4] = rect ? 0 : (r[3] ?? 0)
        f[at + 5] = rect ? (r[4] ?? 0) : 0
        round.words[at + 6] = rect ? (word | shapeRect) >>> 0 : word
        roundSpans[index] = at / 7
        round.used += 7
        continue
      }
      fillSpans[index * 2] = indices.used
      strokeSpans[index * 2] = stroke.used / 5
      const points = geometry.points
      const polygon = geometry.kind === shapeKinds.polygon
      const triangles = geometry.triangles
      if (polygon && triangles.length > 0) {
        const base = fill.used / 3
        const count = points.length / 2
        fill.reserve(count * 3)
        const floats = fill.floats
        const words = fill.words
        let at = fill.used
        for (let k = 0; k < count; k++) {
          floats[at] = (points[k * 2] ?? 0) - originX
          floats[at + 1] = (points[k * 2 + 1] ?? 0) - originY
          words[at + 2] = word
          at += 3
        }
        fill.used = at
        indices.reserve(triangles.length)
        const target = indices.words
        let into = indices.used
        for (let k = 0; k < triangles.length; k++) target[into++] = base + (triangles[k] ?? 0)
        indices.used = into
      }
      const closed = geometry.closed
      const ringWord = (polygon ? word | shapePolygon : word) >>> 0
      let start = 0
      for (const end of geometry.rings) {
        stroke.reserve((end - start + 3) * 5)
        const floats = stroke.floats
        const words = stroke.words
        const first = stroke.used
        const lead = closed ? end - 1 : start
        floats[first] = (points[lead * 2] ?? 0) - originX
        floats[first + 1] = (points[lead * 2 + 1] ?? 0) - originY
        floats[first + 2] = 0
        words[first + 4] = shapeSkip
        let at = first + 5
        let along = 0
        let px = points[start * 2] ?? 0
        let py = points[start * 2 + 1] ?? 0
        for (let k = start; k < end; k++) {
          floats[at] = px - originX
          floats[at + 1] = py - originY
          floats[at + 2] = along
          words[at + 4] = !closed && k === end - 1 ? shapeSkip : ringWord
          at += 5
          const j = k + 1 < end ? k + 1 : start
          const nx = points[j * 2] ?? 0
          const ny = points[j * 2 + 1] ?? 0
          if (closed || j !== start) {
            const dx = nx - px
            const dy = ny - py
            along += Math.sqrt(dx * dx + dy * dy)
          }
          px = nx
          py = ny
        }
        const tail = closed ? [start, start + 1 < end ? start + 1 : start] : [end - 1]
        for (const k of tail) {
          floats[at] = (points[k * 2] ?? 0) - originX
          floats[at + 1] = (points[k * 2 + 1] ?? 0) - originY
          floats[at + 2] = along
          words[at + 4] = shapeSkip
          at += 5
        }
        const perimeter = closed ? along : 0
        for (let record = first; record < at; record += 5) floats[record + 3] = perimeter
        stroke.used = at
        start = end
      }
      fillSpans[index * 2 + 1] = indices.used - (fillSpans[index * 2] ?? 0)
      strokeSpans[index * 2 + 1] = stroke.used / 5 - (strokeSpans[index * 2] ?? 0)
    }
    close()
    stroke.reserve(15)
    for (let pad = 0; pad < 3; pad++) {
      stroke.words[stroke.used + 4] = shapeSkip
      stroke.used += 5
    }
    runs = next
    gl.bindBuffer(gl.ARRAY_BUFFER, made.fillBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(fill.bytes, 0, fill.used * 4), gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, made.strokeBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(stroke.bytes, 0, stroke.used * 4), gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, made.roundBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(round.bytes, 0, round.used * 4), gl.STATIC_DRAW)
    gl.bindVertexArray(null)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, made.indexBuffer)
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint8Array(indices.bytes, 0, indices.used * 4),
      gl.STATIC_DRAW,
    )
  }

  function use(pass: Pass, hidden: Uint32Array, shapePass: number): void {
    gl.useProgram(pass.program)
    gl.uniform1ui(pass.flags, flags)
    gl.uniform4uiv(pass.hidden, hidden)
    gl.uniform1i(pass.pass, shapePass)
  }

  function drawRuns(made: Passes, hidden: Uint32Array, shapePass: number): void {
    for (const run of runs) {
      if (run.round) {
        if (run.count === 0) continue
        use(made.round, hidden, shapePass)
        gl.bindVertexArray(made.roundVao)
        pointRound(run.first)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, run.count)
        continue
      }
      if (run.count > 0) {
        use(made.fill, hidden, shapePass)
        gl.bindVertexArray(made.fillVao)
        gl.drawElements(gl.TRIANGLES, run.count, gl.UNSIGNED_INT, run.first * 4)
      }
      if (run.recordCount > 0) {
        use(made.stroke, hidden, shapePass)
        gl.bindVertexArray(made.strokeVao)
        pointStroke(run.records)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, run.recordCount)
      }
    }
  }

  function drawRaised(made: Passes, hidden: Uint32Array): void {
    sortRaised()
    if (raised.length === 0) return
    if (raised.length > raisedSpans) {
      drawRuns(made, hidden, 1)
      return
    }
    for (const index of raised) {
      const at = roundSpans[index] ?? -1
      if (at >= 0) {
        use(made.round, hidden, 1)
        gl.bindVertexArray(made.roundVao)
        pointRound(at)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1)
        continue
      }
      const fillCount = fillSpans[index * 2 + 1] ?? 0
      if (fillCount > 0) {
        use(made.fill, hidden, 1)
        gl.bindVertexArray(made.fillVao)
        gl.drawElements(gl.TRIANGLES, fillCount, gl.UNSIGNED_INT, (fillSpans[index * 2] ?? 0) * 4)
      }
      const strokeCount = strokeSpans[index * 2 + 1] ?? 0
      if (strokeCount > 0) {
        use(made.stroke, hidden, 1)
        gl.bindVertexArray(made.strokeVao)
        pointStroke(strokeSpans[index * 2] ?? 0)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, strokeCount)
      }
    }
  }

  function bind(made: Passes): void {
    const active = gl.getParameter(gl.ACTIVE_TEXTURE) as number
    const units = [
      [shapeStyleUnit, made.styles.texture],
      [shapeStateUnit, made.states.texture],
      [shapeZoomUnit, made.zoom.texture],
      [shapeTimeUnit, made.time.texture],
    ] as const
    for (const [unit, texture] of units) {
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
        return false
      }
      const made = create()
      const grown = store.capacity !== capacity
      capacity = store.capacity
      let changed = false
      if (store.version !== version || moved) {
        build(store, originX, originY, made)
        changed = true
      }
      if (store.styleVersion !== styleVersion || grown) {
        writeStyles(store, made)
        changed = true
      }
      if (writeStates(states, made, grown)) changed = true
      version = store.version
      styleVersion = store.styleVersion
      shownX = originX
      shownY = originY
      return changed
    },

    draw(layers: LayerFilter | null) {
      if (!passes || runs.length === 0) return
      const made = passes
      const hidden = layers ? layers.masks.subarray(8, 12) : noHidden
      bind(made)
      drawRuns(made, hidden, 0)
      drawRaised(made, hidden)
      gl.bindVertexArray(null)
    },

    destroy() {
      if (!passes) return
      for (const made of [passes.fill, passes.stroke, passes.round]) gl.deleteProgram(made.program)
      for (const vao of [passes.fillVao, passes.strokeVao, passes.roundVao]) {
        gl.deleteVertexArray(vao)
      }
      for (const buffer of [
        passes.fillBuffer,
        passes.indexBuffer,
        passes.strokeBuffer,
        passes.roundBuffer,
      ]) {
        gl.deleteBuffer(buffer)
      }
      for (const texture of [passes.styles, passes.states, passes.zoom, passes.time]) {
        texture.destroy()
      }
      passes = null
      capacity = 0
    },
  }
}
