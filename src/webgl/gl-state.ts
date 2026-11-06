const textureUnits = 12
const uniformBindings = 2

interface Saved {
  program: WebGLProgram | null
  vertexArray: WebGLVertexArrayObject | null
  arrayBuffer: WebGLBuffer | null
  uniformBuffer: WebGLBuffer | null
  uniforms: Array<readonly [WebGLBuffer | null, number, number]>
  activeTexture: number
  textures: Array<WebGLTexture | null>
  arrays: Array<WebGLTexture | null>
  readFramebuffer: WebGLFramebuffer | null
  drawFramebuffer: WebGLFramebuffer | null
  capabilities: boolean[]
  blend: readonly number[]
  viewport: Int32Array
  scissor: Int32Array
  colorMask: readonly boolean[]
  unpackAlignment: number
  unpackPremultiply: boolean
}

export class GlState {
  readonly #gl: WebGL2RenderingContext
  readonly #capabilities: readonly number[]

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl
    this.#capabilities = [gl.BLEND, gl.DEPTH_TEST, gl.STENCIL_TEST, gl.CULL_FACE, gl.SCISSOR_TEST]
  }

  guard<T>(run: () => T): T {
    const saved = this.#save()
    try {
      return run()
    } finally {
      this.#restore(saved)
    }
  }

  #save(): Saved {
    const gl = this.#gl
    const activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number
    const textures: Array<WebGLTexture | null> = []
    const arrays: Array<WebGLTexture | null> = []
    for (let unit = 0; unit < textureUnits; unit++) {
      gl.activeTexture(gl.TEXTURE0 + unit)
      textures.push(gl.getParameter(gl.TEXTURE_BINDING_2D))
      arrays.push(gl.getParameter(gl.TEXTURE_BINDING_2D_ARRAY))
    }
    gl.activeTexture(activeTexture)
    const uniforms: Array<readonly [WebGLBuffer | null, number, number]> = []
    for (let index = 0; index < uniformBindings; index++) {
      uniforms.push([
        gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, index),
        Number(gl.getIndexedParameter(gl.UNIFORM_BUFFER_START, index)),
        Number(gl.getIndexedParameter(gl.UNIFORM_BUFFER_SIZE, index)),
      ])
    }
    return {
      program: gl.getParameter(gl.CURRENT_PROGRAM),
      vertexArray: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
      arrayBuffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
      uniformBuffer: gl.getParameter(gl.UNIFORM_BUFFER_BINDING),
      uniforms,
      activeTexture,
      textures,
      arrays,
      readFramebuffer: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
      drawFramebuffer: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
      capabilities: this.#capabilities.map((capability) => gl.isEnabled(capability)),
      blend: [
        gl.getParameter(gl.BLEND_SRC_RGB),
        gl.getParameter(gl.BLEND_DST_RGB),
        gl.getParameter(gl.BLEND_SRC_ALPHA),
        gl.getParameter(gl.BLEND_DST_ALPHA),
      ],
      viewport: gl.getParameter(gl.VIEWPORT),
      scissor: gl.getParameter(gl.SCISSOR_BOX),
      colorMask: gl.getParameter(gl.COLOR_WRITEMASK),
      unpackAlignment: gl.getParameter(gl.UNPACK_ALIGNMENT),
      unpackPremultiply: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
    }
  }

  #restore(saved: Saved): void {
    const gl = this.#gl
    gl.useProgram(saved.program)
    gl.bindVertexArray(saved.vertexArray)
    gl.bindBuffer(gl.ARRAY_BUFFER, saved.arrayBuffer)
    saved.uniforms.forEach(([buffer, start, size], index) => {
      if (buffer && size > 0) gl.bindBufferRange(gl.UNIFORM_BUFFER, index, buffer, start, size)
      else gl.bindBufferBase(gl.UNIFORM_BUFFER, index, buffer)
    })
    gl.bindBuffer(gl.UNIFORM_BUFFER, saved.uniformBuffer)
    for (let unit = 0; unit < textureUnits; unit++) {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, saved.textures[unit] ?? null)
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, saved.arrays[unit] ?? null)
    }
    gl.activeTexture(saved.activeTexture)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, saved.readFramebuffer)
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, saved.drawFramebuffer)
    this.#capabilities.forEach((capability, index) => {
      if (saved.capabilities[index]) gl.enable(capability)
      else gl.disable(capability)
    })
    const [srcRgb, dstRgb, srcAlpha, dstAlpha] = saved.blend
    gl.blendFuncSeparate(
      srcRgb ?? gl.ONE,
      dstRgb ?? gl.ZERO,
      srcAlpha ?? gl.ONE,
      dstAlpha ?? gl.ZERO,
    )
    const [x, y, width, height] = saved.viewport
    gl.viewport(x ?? 0, y ?? 0, width ?? 0, height ?? 0)
    const [left, bottom, boxWidth, boxHeight] = saved.scissor
    gl.scissor(left ?? 0, bottom ?? 0, boxWidth ?? 0, boxHeight ?? 0)
    const [red, green, blue, alpha] = saved.colorMask
    gl.colorMask(red ?? true, green ?? true, blue ?? true, alpha ?? true)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, saved.unpackAlignment)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, saved.unpackPremultiply)
  }
}
