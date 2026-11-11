interface Saved {
  program: WebGLProgram | null
  vertexArray: WebGLVertexArrayObject | null
  arrayBuffer: WebGLBuffer | null
  uniformBuffer: WebGLBuffer | null
  activeTexture: number
  textures: Array<WebGLTexture | null>
  arrays: Array<WebGLTexture | null>
  readFramebuffer: WebGLFramebuffer | null
  drawFramebuffer: WebGLFramebuffer | null
  capabilities: boolean[]
  viewport: Int32Array
  unpackAlignment: number
  unpackPremultiply: boolean
}

export class GlState {
  readonly #gl: WebGL2RenderingContext
  readonly #capabilities: readonly number[]
  #units: number

  constructor(gl: WebGL2RenderingContext, units: number) {
    this.#gl = gl
    this.#units = units
    this.#capabilities = [gl.BLEND, gl.DEPTH_TEST, gl.STENCIL_TEST, gl.CULL_FACE, gl.SCISSOR_TEST]
  }

  widen(units: number): void {
    this.#units = Math.max(this.#units, units)
  }

  guard<T>(run: () => T): T {
    if (this.#gl.isContextLost()) return run()
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
    for (let unit = 0; unit < this.#units; unit++) {
      gl.activeTexture(gl.TEXTURE0 + unit)
      textures.push(gl.getParameter(gl.TEXTURE_BINDING_2D))
      arrays.push(gl.getParameter(gl.TEXTURE_BINDING_2D_ARRAY))
    }
    gl.activeTexture(activeTexture)
    return {
      program: gl.getParameter(gl.CURRENT_PROGRAM),
      vertexArray: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
      arrayBuffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
      uniformBuffer: gl.getParameter(gl.UNIFORM_BUFFER_BINDING),
      activeTexture,
      textures,
      arrays,
      readFramebuffer: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
      drawFramebuffer: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
      capabilities: this.#capabilities.map((capability) => gl.isEnabled(capability)),
      viewport: gl.getParameter(gl.VIEWPORT),
      unpackAlignment: gl.getParameter(gl.UNPACK_ALIGNMENT),
      unpackPremultiply: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
    }
  }

  #restore(saved: Saved): void {
    const gl = this.#gl
    gl.useProgram(saved.program)
    gl.bindVertexArray(saved.vertexArray)
    gl.bindBuffer(gl.ARRAY_BUFFER, saved.arrayBuffer)
    gl.bindBuffer(gl.UNIFORM_BUFFER, saved.uniformBuffer)
    for (let unit = 0; unit < this.#units; unit++) {
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
    const [x, y, width, height] = saved.viewport
    gl.viewport(x ?? 0, y ?? 0, width ?? 0, height ?? 0)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, saved.unpackAlignment)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, saved.unpackPremultiply)
  }
}
