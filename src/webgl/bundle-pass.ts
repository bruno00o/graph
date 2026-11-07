import { type EdgePaths, maxPathPoints, pathClasses, pathTextureWidth } from '../core/edge-paths'
import { bundleCorners, bundleVertexOf } from './bundle-shaders'
import { type Attribute, createBuffer, createProgram, createVertexArray } from './gl'
import { edgeFragmentOf } from './shaders'

export const bundleUnits = { edgePath: 12, bundlePoints: 13, pathStations: 19 } as const

type Draw = (
  program: WebGLProgram,
  vao: WebGLVertexArrayObject,
  count: number,
  vertices: number,
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

export interface BundlePass {
  readonly mix: number
  readonly lanes: number
  readonly measured: number
  readonly bytes: number
  sync(paths: EdgePaths | null | undefined): boolean
  bind(): void
  draw(run: Draw, bridged: boolean): void
  overlay(count: number, run: Draw, bridged: boolean): void
  destroy(): void
}

export function createBundlePass(
  gl: WebGL2RenderingContext,
  blocks: Readonly<Record<string, number>>,
  prepare: (program: WebGLProgram, sources?: readonly [string, string]) => void,
  overlayIndices: WebGLBuffer,
): BundlePass {
  const variants: Array<Program | null> = [null, null]
  let shared: Shared | null = null
  let pathTexture: WebGLTexture | null = null
  let pointTexture: WebGLTexture | null = null
  let stationTexture: WebGLTexture | null = null
  let lanes = 1
  let measured = 0
  let infoVersion = -1
  let pointsVersion = -1
  let mix = -1
  let bytes = 0
  let pathBytes = 0

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
    const rows = data.length / channels / pathTextureWidth
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, pathTextureWidth, rows, 0, format, type, data)
  }

  function sort(paths: EdgePaths): void {
    const all = buffers().strips
    const lists = all.map(() => [] as number[])
    for (let edge = 0; edge < paths.capacity; edge++) {
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

    sync(paths) {
      const next = paths && paths.bundled > 0 ? paths.mix : -1
      let changed = next !== mix
      mix = next
      if (!paths || mix < 0) return changed
      const nextLanes = paths.lanes ? 1 : 0
      const nextMeasured = paths.measured ? 1 : 0
      if (nextLanes !== lanes || nextMeasured !== measured) changed = true
      lanes = nextLanes
      measured = nextMeasured
      if (paths.version !== infoVersion) {
        infoVersion = paths.version
        pathTexture ??= texture()
        upload(pathTexture, gl.RGBA32UI, gl.RGBA_INTEGER, gl.UNSIGNED_INT, paths.info)
        pathBytes = paths.info.byteLength
        sort(paths)
        changed = true
      }
      if (paths.pointsVersion !== pointsVersion) {
        pointsVersion = paths.pointsVersion
        pointTexture ??= texture()
        upload(pointTexture, gl.RGBA32F, gl.RGBA, gl.FLOAT, paths.data)
        if (paths.measured) {
          stationTexture ??= texture()
          upload(stationTexture, gl.RG32F, gl.RG, gl.FLOAT, paths.stations, 2)
        }
        changed = true
      }
      bytes = pathBytes + paths.data.byteLength + (measured ? paths.stations.byteLength : 0)
      return changed
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

    draw(run, bridged) {
      if (mix < 0 || !shared) return
      const pass = program(bridged)
      shared.strips.forEach((strip, at) => {
        const vao = pass.vaos[at]
        if (strip.count > 0 && vao) run(pass.program, vao, strip.count, strip.stations * 2)
      })
    },

    overlay(count, run, bridged) {
      if (mix < 0 || !shared || count === 0) return
      const pass = program(bridged)
      run(pass.program, pass.overlay, count, maxPathPoints * 2)
    },

    destroy() {
      if (pathTexture) gl.deleteTexture(pathTexture)
      if (pointTexture) gl.deleteTexture(pointTexture)
      if (stationTexture) gl.deleteTexture(stationTexture)
      for (const pass of variants) {
        if (!pass) continue
        for (const vao of pass.vaos) gl.deleteVertexArray(vao)
        gl.deleteVertexArray(pass.overlay)
        gl.deleteProgram(pass.program)
      }
      for (const strip of shared?.strips ?? []) {
        gl.deleteBuffer(strip.corners)
        gl.deleteBuffer(strip.indices)
      }
      if (shared) gl.deleteBuffer(shared.overlay)
    },
  }
}
