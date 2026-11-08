import type { EdgeColumns } from '../core/columns'
import { type EdgePaths, maxPathPoints, pathClasses, pathTextureWidth } from '../core/edge-paths'
import type { EdgeWaypoints } from '../core/edge-waypoints'
import type { Positions } from '../core/positions'
import { fixedFlag, fixedGeo, fixedStartMask } from './bundle-glsl'
import { bundleCorners, bundleVertexOf } from './bundle-shaders'
import { warnLimit } from './caps'
import { type Attribute, createBuffer, createProgram, createVertexArray } from './gl'
import { clippedEdgeFragment, edgeFragmentOf } from './shaders'
import { waypointVertex, waypointWindow, waypointWindowShift } from './waypoint-shaders'

export const bundleUnits = { edgePath: 12, bundlePoints: 13, pathStations: 19 } as const

type Draw = (
  program: WebGLProgram,
  vao: WebGLVertexArrayObject,
  count: number,
  vertices: number,
  piece?: number,
) => void

interface Strip {
  readonly stations: number
  readonly corners: WebGLBuffer
  readonly indices: WebGLBuffer
  count: number
}

interface Shared {
  readonly strips: readonly Strip[]
  readonly overlay: WebGLBuffer
}

interface Program {
  readonly program: WebGLProgram
  readonly vaos: readonly WebGLVertexArrayObject[]
  readonly overlay: WebGLVertexArrayObject
}

interface FixedLists {
  readonly strips: readonly Strip[]
  readonly overlay: WebGLBuffer
  overlayCount: number
}

export interface BundleSource {
  readonly paths: EdgePaths | null | undefined
  readonly edges?: EdgeColumns | undefined
  readonly positions?: Positions | undefined
}

export interface BundlePass {
  readonly mix: number
  readonly lanes: number
  readonly measured: number
  readonly bytes: number
  sync(paths: EdgePaths | null | undefined, edges?: EdgeColumns, positions?: Positions): boolean
  highlight(edges: readonly number[]): void
  bind(): void
  draw(run: Draw, bridged: boolean, flat?: boolean): void
  overlay(count: number, run: Draw, bridged: boolean, flat?: boolean): void
  destroy(): void
}

const lengthBits = new Float32Array(1)
const lengthWord = new Uint32Array(lengthBits.buffer)

function bitsOf(value: number): number {
  lengthBits[0] = value
  return lengthWord[0] ?? 0
}

function windowsOf(count: number): number {
  return Math.ceil((count - 1) / waypointWindow)
}

export function createBundlePass(
  gl: WebGL2RenderingContext,
  blocks: Readonly<Record<string, number>>,
  prepare: (program: WebGLProgram, sources?: readonly [string, string]) => void,
  overlayIndices: WebGLBuffer,
  maxRows: number = Number.POSITIVE_INFINITY,
): BundlePass {
  const variants: Array<Program | null> = [null, null]
  let shared: Shared | null = null
  let fixedLists: FixedLists | null = null
  let fixedProgram: Program | null = null
  let pathTexture: WebGLTexture | null = null
  let pointTexture: WebGLTexture | null = null
  let stationTexture: WebGLTexture | null = null
  let lanes = 1
  let measured = 0
  let infoVersion = -1
  let infoFixed = false
  let infoBase = 0
  let pointsVersion = -1
  let mix = -1
  let bytes = 0
  let pathBytes = 0
  let fixedOn = false
  let fixedKey = -1
  let fixedOriginX = Number.NaN
  let fixedOriginY = Number.NaN
  let pointRows = 0
  let fixedBytes = 0
  let fixedBase = 0
  let wrapping = false
  let wrapKey = ''
  let highlighted: readonly number[] = []
  let overlayKey = -1
  let highlightVersion = 0
  let fixedInfoVersion = 0
  let merged = new Uint32Array(0)

  const attribute = (buffer: WebGLBuffer, name: string, integer: boolean): Attribute => ({
    name,
    buffer,
    size: integer ? 1 : 2,
    type: integer ? gl.UNSIGNED_INT : gl.FLOAT,
    integer,
    divisor: integer ? 1 : 0,
  })

  function texture(): WebGLTexture {
    const created = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, created)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return created
  }

  function buffers(): Shared {
    shared ??= {
      strips: pathClasses.map((stations) => ({
        stations,
        corners: createBuffer(gl, bundleCorners(stations), gl.STATIC_DRAW),
        indices: createBuffer(gl, new Uint32Array(0), gl.DYNAMIC_DRAW),
        count: 0,
      })),
      overlay: createBuffer(gl, bundleCorners(maxPathPoints), gl.STATIC_DRAW),
    }
    return shared
  }

  function lists(): FixedLists {
    const corners = buffers()
    fixedLists ??= {
      strips: corners.strips.map((strip) => ({
        stations: strip.stations,
        corners: strip.corners,
        indices: createBuffer(gl, new Uint32Array(0), gl.DYNAMIC_DRAW),
        count: 0,
      })),
      overlay: createBuffer(gl, new Uint32Array(0), gl.DYNAMIC_DRAW),
      overlayCount: 0,
    }
    return fixedLists
  }

  function program(bridged: boolean): Program {
    const existing = variants[bridged ? 1 : 0]
    if (existing) return existing
    const vertex = bundleVertexOf(bridged)
    const fragment = edgeFragmentOf(false, bridged)
    const created = createProgram(gl, vertex, fragment, blocks)
    prepare(created, [vertex, fragment])
    const { strips, overlay: corners } = buffers()
    const vaos = strips.map((strip) =>
      createVertexArray(gl, created, [
        attribute(strip.corners, 'corner', false),
        attribute(strip.indices, 'instance', true),
      ]),
    )
    const overlay = createVertexArray(gl, created, [
      attribute(corners, 'corner', false),
      attribute(overlayIndices, 'instance', true),
    ])
    const made = { program: created, vaos, overlay }
    variants[bridged ? 1 : 0] = made
    return made
  }

  function waypoints(): Program {
    if (fixedProgram) return fixedProgram
    const created = createProgram(gl, waypointVertex, clippedEdgeFragment, blocks)
    prepare(created, [waypointVertex, clippedEdgeFragment])
    const { overlay: corners } = buffers()
    const own = lists()
    const vaos = own.strips.map((strip) =>
      createVertexArray(gl, created, [
        attribute(strip.corners, 'corner', false),
        attribute(strip.indices, 'instance', true),
      ]),
    )
    const overlay = createVertexArray(gl, created, [
      attribute(corners, 'corner', false),
      attribute(own.overlay, 'instance', true),
    ])
    fixedProgram = { program: created, vaos, overlay }
    return fixedProgram
  }

  function upload(
    target: WebGLTexture,
    internal: number,
    format: number,
    type: number,
    data: Uint32Array | Float32Array,
    channels = 4,
  ): void {
    gl.bindTexture(gl.TEXTURE_2D, target)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    const rows = Math.min(data.length / channels / pathTextureWidth, maxRows)
    const sent = data.subarray(0, rows * pathTextureWidth * channels)
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, pathTextureWidth, rows, 0, format, type, sent)
  }

  function sort(paths: EdgePaths): void {
    const all = buffers().strips
    const lists = all.map(() => [] as number[])
    const last = Math.min(paths.capacity, maxRows * pathTextureWidth)
    for (let edge = 0; edge < last; edge++) {
      const count = paths.info[edge * 4 + 1] ?? 0
      if (count < 2) continue
      const at = pathClasses.findIndex((stations) => stations >= count)
      lists[at < 0 ? lists.length - 1 : at]?.push(edge)
    }
    all.forEach((strip, at) => {
      const list = lists[at] ?? []
      strip.count = list.length
      gl.bindBuffer(gl.ARRAY_BUFFER, strip.indices)
      gl.bufferData(gl.ARRAY_BUFFER, Uint32Array.from(list), gl.DYNAMIC_DRAW)
    })
  }

  function mergeInfo(paths: EdgePaths, fixed: EdgeWaypoints, relative: boolean): Uint32Array {
    if (merged.length !== paths.info.length) merged = new Uint32Array(paths.info.length)
    if (relative) merged.set(paths.info)
    else merged.fill(0)
    const groups = buffers().strips.map(() => [] as number[])
    const last = Math.min(fixed.capacity, paths.capacity, maxRows * pathTextureWidth)
    for (let edge = 0; edge < last; edge++) {
      const inner = fixed.count[edge] ?? 0
      if (inner === 0) continue
      const count = inner + 2
      const at = edge * 4
      merged[at] =
        ((fixedBase + (fixed.start[edge] ?? 0)) & fixedStartMask) |
        fixedFlag |
        (fixed.geo[edge] === 1 ? fixedGeo : 0)
      merged[at + 1] = count
      merged[at + 2] = bitsOf(fixed.length[edge] ?? 0)
      merged[at + 3] = 0
      const group = pathClasses.findIndex((stations) => stations >= count)
      if (group >= 0) {
        groups[group]?.push(edge)
        continue
      }
      const windows = windowsOf(count)
      const list = groups[groups.length - 1]
      for (let window = 0; window < windows; window++) {
        list?.push((edge | (window << waypointWindowShift)) >>> 0)
      }
    }
    lists().strips.forEach((strip, at) => {
      const list = groups[at] ?? []
      strip.count = list.length
      gl.bindBuffer(gl.ARRAY_BUFFER, strip.indices)
      gl.bufferData(gl.ARRAY_BUFFER, Uint32Array.from(list), gl.DYNAMIC_DRAW)
    })
    fixedInfoVersion++
    return merged
  }

  function fixedPoints(fixed: EdgeWaypoints, positions: Positions | undefined): Float32Array {
    const used = fixed.used
    const rows = Math.max(1, Math.ceil(used / pathTextureWidth))
    const staging = new Float32Array(rows * pathTextureWidth * 4)
    const originX = positions?.originX ?? 0
    const originY = positions?.originY ?? 0
    const { points, along } = fixed
    for (let at = 0; at < used; at++) {
      staging[at * 4] = (points[at * 2] ?? 0) - originX
      staging[at * 4 + 1] = (points[at * 2 + 1] ?? 0) - originY
      staging[at * 4 + 2] = along[at] ?? 0
    }
    return staging
  }

  function checkWraps(paths: EdgePaths, edges: EdgeColumns | undefined, positions?: Positions) {
    const fixed = paths.fixed
    if (!fixed || fixed.geoEdges === 0 || !edges || !positions) {
      wrapping = false
      return
    }
    const key = `${fixed.version}:${positions.version}`
    if (key === wrapKey) return
    wrapKey = key
    wrapping = false
    const point = { x: 0, y: 0 }
    const last = Math.min(fixed.capacity, edges.capacity)
    for (let edge = 0; edge < last && !wrapping; edge++) {
      if (fixed.geo[edge] !== 1 || (fixed.count[edge] ?? 0) === 0) continue
      const sx = positions.x(edges.source[edge] ?? 0)
      const tx = positions.x(edges.target[edge] ?? 0)
      paths.wraps(edge, sx, tx, point)
      if (point.x !== point.y) wrapping = true
    }
  }

  function buildOverlay(): void {
    const own = lists()
    if (overlayKey === highlightVersion * 65536 + fixedInfoVersion) return
    overlayKey = highlightVersion * 65536 + fixedInfoVersion
    const list: number[] = []
    for (const edge of highlighted) {
      const at = edge * 4
      if (at + 1 >= merged.length || ((merged[at] ?? 0) & fixedFlag) === 0) continue
      const windows = windowsOf(merged[at + 1] ?? 0)
      for (let window = 0; window < windows; window++) {
        list.push((edge | (window << waypointWindowShift)) >>> 0)
      }
    }
    own.overlayCount = list.length
    gl.bindBuffer(gl.ARRAY_BUFFER, own.overlay)
    gl.bufferData(gl.ARRAY_BUFFER, Uint32Array.from(list), gl.DYNAMIC_DRAW)
  }

  function drawFixed(run: Draw, flat: boolean): void {
    if (!fixedOn || !fixedLists) return
    const pass = waypoints()
    const pieces = flat && wrapping ? 2 : 1
    for (let piece = 0; piece < pieces; piece++) {
      fixedLists.strips.forEach((strip, at) => {
        const vao = pass.vaos[at]
        if (strip.count > 0 && vao) run(pass.program, vao, strip.count, strip.stations * 2, piece)
      })
    }
  }

  return {
    get mix() {
      return mix
    },

    get lanes() {
      return lanes
    },

    get measured() {
      return measured
    },

    get bytes() {
      return bytes
    },

    sync(paths, edges, positions) {
      const relativeRows = paths ? paths.data.length / 4 / pathTextureWidth : 0
      const fits = !paths || relativeRows <= maxRows
      if (!fits && paths.bundled > 0) {
        warnLimit('paths', 'edge paths do not fit on this device, edges are drawn straight')
      }
      const relative = !!paths && fits && paths.bundled > 0
      const fixed = paths?.fixed ?? null
      const base = relative ? relativeRows : 0
      const fixedRows = fixed && fixed.edges > 0 ? Math.ceil(fixed.used / pathTextureWidth) : 0
      const fixedFits =
        base + fixedRows <= maxRows && (base + fixedRows) * pathTextureWidth <= 2 ** 24
      if (fixedRows > 0 && !fixedFits) {
        warnLimit('waypoints', 'edge waypoints do not fit on this device, edges are drawn straight')
      }
      const nextFixed = fixedRows > 0 && fixedFits
      const next = relative ? (paths?.mix ?? -1) : nextFixed ? 1 : -1
      let changed = next !== mix || nextFixed !== fixedOn
      if (nextFixed !== fixedOn) pointsVersion = -1
      mix = next
      fixedOn = nextFixed
      if (!paths || mix < 0) return changed
      const nextLanes = paths.lanes ? 1 : 0
      const nextMeasured = paths.measured ? 1 : 0
      if (nextLanes !== lanes || nextMeasured !== measured) changed = true
      lanes = nextLanes
      measured = nextMeasured
      fixedBase = fixedOn ? base * pathTextureWidth : 0
      if (paths.version !== infoVersion || infoFixed !== fixedOn || infoBase !== fixedBase) {
        infoVersion = paths.version
        infoFixed = fixedOn
        infoBase = fixedBase
        pathTexture ??= texture()
        const info = fixed && fixedOn ? mergeInfo(paths, fixed, relative) : paths.info
        upload(pathTexture, gl.RGBA32UI, gl.RGBA_INTEGER, gl.UNSIGNED_INT, info)
        pathBytes = info.byteLength
        sort(paths)
        changed = true
      }
      if (fixed && fixedOn) {
        const rows = base + fixedRows
        pointTexture ??= texture()
        gl.bindTexture(gl.TEXTURE_2D, pointTexture)
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
        if (rows !== pointRows) {
          pointRows = rows
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA32F,
            pathTextureWidth,
            rows,
            0,
            gl.RGBA,
            gl.FLOAT,
            null,
          )
          pointsVersion = -1
          fixedKey = -1
        }
        if (relative && paths.pointsVersion !== pointsVersion) {
          pointsVersion = paths.pointsVersion
          const sent = paths.data.subarray(0, base * pathTextureWidth * 4)
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, pathTextureWidth, base, gl.RGBA, gl.FLOAT, sent)
          if (paths.measured) {
            stationTexture ??= texture()
            upload(stationTexture, gl.RG32F, gl.RG, gl.FLOAT, paths.stations, 2)
          }
          changed = true
        }
        const originX = positions?.originX ?? 0
        const originY = positions?.originY ?? 0
        if (fixed.version !== fixedKey || originX !== fixedOriginX || originY !== fixedOriginY) {
          fixedKey = fixed.version
          fixedOriginX = originX
          fixedOriginY = originY
          const staging = fixedPoints(fixed, positions)
          gl.bindTexture(gl.TEXTURE_2D, pointTexture)
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            base,
            pathTextureWidth,
            staging.length / 4 / pathTextureWidth,
            gl.RGBA,
            gl.FLOAT,
            staging,
          )
          fixedBytes = staging.byteLength
          changed = true
        }
        checkWraps(paths, edges, positions)
      } else if (paths.pointsVersion !== pointsVersion) {
        pointsVersion = paths.pointsVersion
        pointRows = -1
        fixedBytes = 0
        pointTexture ??= texture()
        upload(pointTexture, gl.RGBA32F, gl.RGBA, gl.FLOAT, paths.data)
        if (paths.measured) {
          stationTexture ??= texture()
          upload(stationTexture, gl.RG32F, gl.RG, gl.FLOAT, paths.stations, 2)
        }
        changed = true
      }
      bytes =
        pathBytes +
        (relative ? paths.data.byteLength : 0) +
        fixedBytes +
        (measured ? paths.stations.byteLength : 0)
      return changed
    },

    highlight(edges) {
      highlighted = edges
      highlightVersion++
    },

    bind() {
      if (!pathTexture || !pointTexture) return
      gl.activeTexture(gl.TEXTURE0 + bundleUnits.edgePath)
      gl.bindTexture(gl.TEXTURE_2D, pathTexture)
      gl.activeTexture(gl.TEXTURE0 + bundleUnits.bundlePoints)
      gl.bindTexture(gl.TEXTURE_2D, pointTexture)
      if (!stationTexture) return
      gl.activeTexture(gl.TEXTURE0 + bundleUnits.pathStations)
      gl.bindTexture(gl.TEXTURE_2D, stationTexture)
    },

    draw(run, bridged, flat = true) {
      if (mix < 0 || !shared) return
      if (shared.strips.some((strip) => strip.count > 0)) {
        const pass = program(bridged)
        shared.strips.forEach((strip, at) => {
          const vao = pass.vaos[at]
          if (strip.count > 0 && vao) run(pass.program, vao, strip.count, strip.stations * 2)
        })
      }
      drawFixed(run, flat)
    },

    overlay(count, run, bridged, flat = true) {
      if (mix < 0 || !shared || count === 0) return
      if (shared.strips.some((strip) => strip.count > 0) || !fixedOn) {
        const pass = program(bridged)
        run(pass.program, pass.overlay, count, maxPathPoints * 2)
      }
      if (!fixedOn) return
      buildOverlay()
      const own = fixedLists
      if (!own || own.overlayCount === 0) return
      const pass = waypoints()
      const pieces = flat && wrapping ? 2 : 1
      for (let piece = 0; piece < pieces; piece++) {
        run(pass.program, pass.overlay, own.overlayCount, (waypointWindow + 1) * 2, piece)
      }
    },

    destroy() {
      if (pathTexture) gl.deleteTexture(pathTexture)
      if (pointTexture) gl.deleteTexture(pointTexture)
      if (stationTexture) gl.deleteTexture(stationTexture)
      for (const pass of [...variants, fixedProgram]) {
        if (!pass) continue
        for (const vao of pass.vaos) gl.deleteVertexArray(vao)
        gl.deleteVertexArray(pass.overlay)
        gl.deleteProgram(pass.program)
      }
      for (const strip of shared?.strips ?? []) {
        gl.deleteBuffer(strip.corners)
        gl.deleteBuffer(strip.indices)
      }
      for (const strip of fixedLists?.strips ?? []) gl.deleteBuffer(strip.indices)
      if (fixedLists) gl.deleteBuffer(fixedLists.overlay)
      if (shared) gl.deleteBuffer(shared.overlay)
    },
  }
}
