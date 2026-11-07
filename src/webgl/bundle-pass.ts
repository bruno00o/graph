import { type EdgePaths, maxPathPoints, pathClasses, pathTextureWidth } from '../core/edge-paths'
import { bundleCorners, bundleVertex } from './bundle-shaders'
import { type Attribute, createBuffer, createProgram, createVertexArray } from './gl'
import { edgeFragment } from './shaders'

export const bundleUnits = { edgePath: 12, bundlePoints: 13 } as const

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
  readonly vao: WebGLVertexArrayObject
  count: number
}

interface Program {
  readonly program: WebGLProgram
  readonly strips: readonly Strip[]
  readonly overlayCorners: WebGLBuffer
  readonly overlay: WebGLVertexArrayObject
}

export interface BundlePass {
  readonly mix: number
  readonly bytes: number
  sync(paths: EdgePaths | null | undefined): boolean
  bind(): void
  draw(run: Draw): void
  overlay(count: number, run: Draw): void
  destroy(): void
}

export function createBundlePass(
  gl: WebGL2RenderingContext,
  blocks: Readonly<Record<string, number>>,
  prepare: (program: WebGLProgram, sources?: readonly [string, string]) => void,
  overlayIndices: WebGLBuffer,
): BundlePass {
  let pass: Program | null = null
  let pathTexture: WebGLTexture | null = null
  let pointTexture: WebGLTexture | null = null
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

  function program(): Program {
    if (pass) return pass
    const created = createProgram(gl, bundleVertex, edgeFragment, blocks)
    prepare(created, [bundleVertex, edgeFragment])
    const strips = pathClasses.map((stations) => {
      const corners = createBuffer(gl, bundleCorners(stations), gl.STATIC_DRAW)
      const indices = createBuffer(gl, new Uint32Array(0), gl.DYNAMIC_DRAW)
      const vao = createVertexArray(gl, created, [
        attribute(corners, 'corner', false),
        attribute(indices, 'instance', true),
      ])
      return { stations, corners, indices, vao, count: 0 }
    })
    const overlayCorners = createBuffer(gl, bundleCorners(maxPathPoints), gl.STATIC_DRAW)
    const overlay = createVertexArray(gl, created, [
      attribute(overlayCorners, 'corner', false),
      attribute(overlayIndices, 'instance', true),
    ])
    pass = { program: created, strips, overlayCorners, overlay }
    return pass
  }

  function upload(
    target: WebGLTexture,
    internal: number,
    format: number,
    type: number,
    data: Uint32Array | Float32Array,
  ): void {
    gl.bindTexture(gl.TEXTURE_2D, target)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    const rows = data.length / 4 / pathTextureWidth
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, pathTextureWidth, rows, 0, format, type, data)
  }

  function sort(paths: EdgePaths): void {
    const { strips } = program()
    const lists = strips.map(() => [] as number[])
    for (let edge = 0; edge < paths.capacity; edge++) {
      const count = paths.info[edge * 4 + 1] ?? 0
      if (count < 2) continue
      const at = pathClasses.findIndex((stations) => stations >= count)
      lists[at < 0 ? lists.length - 1 : at]?.push(edge)
    }
    strips.forEach((strip, at) => {
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

    get bytes() {
      return bytes
    },

    sync(paths) {
      const next = paths && paths.bundled > 0 ? paths.mix : -1
      let changed = next !== mix
      mix = next
      if (!paths || mix < 0) return changed
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
        changed = true
      }
      bytes = pathBytes + paths.data.byteLength
      return changed
    },

    bind() {
      if (!pathTexture || !pointTexture) return
      gl.activeTexture(gl.TEXTURE0 + bundleUnits.edgePath)
      gl.bindTexture(gl.TEXTURE_2D, pathTexture)
      gl.activeTexture(gl.TEXTURE0 + bundleUnits.bundlePoints)
      gl.bindTexture(gl.TEXTURE_2D, pointTexture)
    },

    draw(run) {
      if (mix < 0 || !pass) return
      for (const strip of pass.strips) {
        if (strip.count > 0) run(pass.program, strip.vao, strip.count, strip.stations * 2)
      }
    },

    overlay(count, run) {
      if (mix < 0 || !pass || count === 0) return
      run(pass.program, pass.overlay, count, maxPathPoints * 2)
    },

    destroy() {
      if (pathTexture) gl.deleteTexture(pathTexture)
      if (pointTexture) gl.deleteTexture(pointTexture)
      if (!pass) return
      for (const strip of pass.strips) {
        gl.deleteVertexArray(strip.vao)
        gl.deleteBuffer(strip.corners)
        gl.deleteBuffer(strip.indices)
      }
      gl.deleteVertexArray(pass.overlay)
      gl.deleteBuffer(pass.overlayCorners)
      gl.deleteProgram(pass.program)
    },
  }
}
