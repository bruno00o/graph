export const textureWidth = 1024

export function createProgram(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
  blocks: Readonly<Record<string, number>>,
): WebGLProgram {
  const program = gl.createProgram()
  const shaders: WebGLShader[] = []
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type)
    if (!shader) throw new Error('graph: cannot create a WebGL shader')
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      throw new Error(`graph: shader compilation failed\n${gl.getShaderInfoLog(shader) ?? ''}`)
    }
    gl.attachShader(program, shader)
    shaders.push(shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`graph: program link failed\n${gl.getProgramInfoLog(program) ?? ''}`)
  }
  for (const shader of shaders) {
    gl.detachShader(program, shader)
    gl.deleteShader(shader)
  }
  for (const [name, binding] of Object.entries(blocks)) {
    const index = gl.getUniformBlockIndex(program, name)
    if (index !== gl.INVALID_INDEX) gl.uniformBlockBinding(program, index, binding)
  }
  return program
}

export interface TextureFormat {
  readonly internal: number
  readonly format: number
  readonly type: number
  readonly components: number
}

export interface TextureFormats {
  readonly rg32f: TextureFormat
  readonly rgba32f: TextureFormat
  readonly rgba32ui: TextureFormat
  readonly r32ui: TextureFormat
}

export function formats(gl: WebGL2RenderingContext): TextureFormats {
  return {
    rg32f: { internal: gl.RG32F, format: gl.RG, type: gl.FLOAT, components: 2 },
    rgba32f: { internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, components: 4 },
    rgba32ui: {
      internal: gl.RGBA32UI,
      format: gl.RGBA_INTEGER,
      type: gl.UNSIGNED_INT,
      components: 4,
    },
    r32ui: { internal: gl.R32UI, format: gl.RED_INTEGER, type: gl.UNSIGNED_INT, components: 1 },
  }
}

export class DataTexture<A extends Float32Array | Uint32Array | Uint8Array> {
  readonly texture: WebGLTexture
  readonly #gl: WebGL2RenderingContext
  readonly #format: TextureFormat
  readonly #create: (length: number) => A
  readonly #maxRows: number
  #rows = 0
  data: A

  constructor(
    gl: WebGL2RenderingContext,
    format: TextureFormat,
    create: (length: number) => A,
    maxRows: number = Number.POSITIVE_INFINITY,
  ) {
    this.#gl = gl
    this.#format = format
    this.#create = create
    this.#maxRows = Math.max(1, maxRows)
    this.data = create(0)
    this.texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  get rows(): number {
    return this.#rows
  }

  get capacity(): number {
    return this.#maxRows * textureWidth
  }

  reserve(capacity: number): boolean {
    const rows = Math.min(this.#maxRows, Math.max(1, Math.ceil(capacity / textureWidth)))
    if (rows <= this.#rows) return false
    const data = this.#create(rows * textureWidth * this.#format.components)
    data.set(this.data)
    this.data = data
    this.#rows = rows
    const gl = this.#gl
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      this.#format.internal,
      textureWidth,
      rows,
      0,
      this.#format.format,
      this.#format.type,
      null,
    )
    return true
  }

  upload(first: number, last: number): void {
    if (last < first || this.#rows === 0) return
    const gl = this.#gl
    const startRow = Math.floor(first / textureWidth)
    const endRow = Math.min(this.#rows - 1, Math.floor(last / textureWidth))
    if (startRow > endRow) return
    const stride = textureWidth * this.#format.components
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      startRow,
      textureWidth,
      endRow - startRow + 1,
      this.#format.format,
      this.#format.type,
      this.data.subarray(startRow * stride, (endRow + 1) * stride),
    )
  }

  destroy(): void {
    this.#gl.deleteTexture(this.texture)
  }
}

export function createBuffer(
  gl: WebGL2RenderingContext,
  data: ArrayBufferView,
  usage: number,
): WebGLBuffer {
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, data, usage)
  return buffer
}

export interface Attribute {
  readonly name: string
  readonly buffer: WebGLBuffer
  readonly size: number
  readonly type: number
  readonly integer?: boolean
  readonly normalized?: boolean
  readonly divisor: number
  readonly stride?: number
  readonly offset?: number
}

export function createVertexArray(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  attributes: readonly Attribute[],
): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  for (const attribute of attributes) {
    const location = gl.getAttribLocation(program, attribute.name)
    if (location < 0) continue
    gl.bindBuffer(gl.ARRAY_BUFFER, attribute.buffer)
    gl.enableVertexAttribArray(location)
    const stride = attribute.stride ?? 0
    const offset = attribute.offset ?? 0
    if (attribute.integer) {
      gl.vertexAttribIPointer(location, attribute.size, attribute.type, stride, offset)
    } else {
      gl.vertexAttribPointer(
        location,
        attribute.size,
        attribute.type,
        attribute.normalized ?? false,
        stride,
        offset,
      )
    }
    gl.vertexAttribDivisor(location, attribute.divisor)
  }
  gl.bindVertexArray(null)
  return vao
}
