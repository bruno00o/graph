import { createProgram } from '../../webgl/gl'
import {
  boundsBlockFragment,
  boundsFragment,
  fullVertex,
  integrateFragment,
  reduceFragment,
  splatVertex,
  springVertex,
  valueFragment,
} from './gpu-shaders'
import {
  alphaMin,
  coolingOf,
  type ForceGraph,
  type ForceSettings,
  keep,
  partialAlpha,
} from './simulation'

const boundsBlock = 4
const maxLevels = 11
const zero = new Float32Array(4)

interface Target {
  readonly texture: WebGLTexture
  readonly framebuffer: WebGLFramebuffer
}

interface SizedTarget extends Target {
  readonly width: number
  readonly height: number
}

type Programs = Record<
  'bounds' | 'boundsReduce' | 'splat' | 'reduce' | 'spring' | 'integrate',
  WebGLProgram
>

export class GpuForce {
  alpha: number
  readonly capacity: number
  readonly fixed: Uint8Array
  readonly #gl: WebGL2RenderingContext
  readonly #width: number
  readonly #height: number
  readonly #levels: number
  readonly #cells: number
  readonly #start: number
  readonly #cooling: number
  readonly #gravity: number
  readonly #center: readonly [number, number]
  readonly #repulsion: number
  readonly #edgeVertices: number
  readonly #programs: Programs
  readonly #states: [Target, Target]
  readonly #props: WebGLTexture
  readonly #boundsChain: readonly SizedTarget[]
  readonly #bounds: Target
  readonly #sizeAt: WebGLUniformLocation | null
  readonly #springs: Target
  readonly #pyramid: WebGLTexture
  readonly #levelBuffers: WebGLFramebuffer[]
  readonly #edges: WebGLVertexArrayObject
  readonly #empty: WebGLVertexArrayObject
  readonly #pack: WebGLBuffer
  readonly #pixels: Float32Array
  readonly #radius: Float32Array
  #current: 0 | 1 = 0
  #lost = false

  static create(graph: ForceGraph, settings: ForceSettings): GpuForce | null {
    if (typeof OffscreenCanvas === 'undefined') return null
    const canvas = new OffscreenCanvas(1, 1)
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    }) as WebGL2RenderingContext | null
    if (!gl?.getExtension('EXT_color_buffer_float') || !gl.getExtension('EXT_float_blend')) {
      return null
    }
    try {
      const force = new GpuForce(gl, graph, settings)
      canvas.addEventListener('webglcontextlost', () => force.#loseContext())
      return force
    } catch {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      return null
    }
  }

  private constructor(gl: WebGL2RenderingContext, graph: ForceGraph, settings: ForceSettings) {
    this.#gl = gl
    const capacity = graph.capacity
    this.capacity = capacity
    this.#radius = graph.radius
    this.#width = Math.max(1, Math.ceil(Math.sqrt(capacity)))
    this.#height = Math.max(1, Math.ceil(capacity / this.#width))
    this.fixed = new Uint8Array(capacity)
    const state = new Float32Array(this.#width * this.#height * 4)
    const props = new Float32Array(this.#width * this.#height * 4)
    let alive = 0
    let movers = 0
    let sumX = 0
    let sumY = 0
    for (let i = 0; i < capacity; i++) {
      const x = graph.xy[i * 2] ?? 0
      const y = graph.xy[i * 2 + 1] ?? 0
      state[i * 4] = x
      state[i * 4 + 1] = y
      props[i * 4] = graph.radius[i] ?? 0
      if (graph.alive[i] !== 1) continue
      alive++
      props[i * 4 + 1] = 1
      if (graph.movable[i] === 1) {
        movers++
        sumX += x
        sumY += y
        props[i * 4 + 2] = 1
      } else this.fixed[i] = 1
    }
    for (let i = 0; i < capacity; i++) if (graph.alive[i] !== 1) this.fixed[i] = 1
    const partial = movers < alive
    this.#start = partial ? partialAlpha : 1
    this.alpha = movers === 0 ? 0 : this.#start
    this.#cooling = coolingOf(settings.steps)
    this.#gravity = partial ? 0 : settings.gravity
    this.#repulsion = settings.repulsion
    this.#center = movers > 0 ? [sumX / movers, sumY / movers] : [0, 0]
    this.#levels = Math.min(
      maxLevels,
      Math.max(2, Math.ceil(Math.log2(Math.sqrt(Math.max(alive, 1)))) + 1),
    )
    this.#cells = 1 << this.#levels

    this.#programs = {
      bounds: createProgram(gl, fullVertex, boundsBlockFragment, {}),
      boundsReduce: createProgram(gl, fullVertex, boundsFragment, {}),
      splat: createProgram(gl, splatVertex, valueFragment, {}),
      reduce: createProgram(gl, fullVertex, reduceFragment, {}),
      spring: createProgram(gl, springVertex, valueFragment, {}),
      integrate: createProgram(gl, fullVertex, integrateFragment, {}),
    }
    this.#states = [
      this.#target(this.#width, this.#height, state),
      this.#target(this.#width, this.#height, state),
    ]
    this.#props = this.#texture(this.#width, this.#height, props)
    const chain: SizedTarget[] = []
    let chainWidth = this.#width
    let chainHeight = this.#height
    do {
      chainWidth = Math.ceil(chainWidth / boundsBlock)
      chainHeight = Math.ceil(chainHeight / boundsBlock)
      chain.push({
        ...this.#target(chainWidth, chainHeight, null),
        width: chainWidth,
        height: chainHeight,
      })
    } while (chainWidth > 1 || chainHeight > 1)
    this.#boundsChain = chain
    this.#bounds = chain[chain.length - 1] as SizedTarget
    this.#sizeAt = gl.getUniformLocation(this.#programs.boundsReduce, 'size')
    this.#springs = this.#target(this.#width, this.#height, null)
    const pyramid = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, pyramid)
    gl.texStorage2D(gl.TEXTURE_2D, this.#levels + 1, gl.RGBA32F, this.#cells, this.#cells)
    this.#nearest()
    this.#pyramid = pyramid
    this.#levelBuffers = []
    for (let level = 0; level <= this.#levels; level++) {
      const framebuffer = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pyramid, level)
      this.#levelBuffers.push(framebuffer)
    }

    const { vertices, count } = edgeVertices(graph, settings.edgeLength)
    this.#edgeVertices = count
    this.#empty = gl.createVertexArray()
    this.#edges = gl.createVertexArray()
    gl.bindVertexArray(this.#edges)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16)
    gl.bindVertexArray(null)

    this.#pixels = new Float32Array(this.#width * this.#height * 4)
    this.#pack = gl.createBuffer()
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.#pack)
    gl.bufferData(gl.PIXEL_PACK_BUFFER, this.#pixels.byteLength, gl.STREAM_READ)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)

    this.#bindSamplers()
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.DITHER)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('graph: incomplete layout framebuffer')
    }
  }

  get done(): boolean {
    return this.#lost || this.alpha < alphaMin
  }

  get lost(): boolean {
    return this.#lost
  }

  get progress(): number {
    if (this.alpha <= 0) return 1
    const value = Math.log(this.alpha / this.#start) / Math.log(alphaMin / this.#start)
    return Math.min(1, Math.max(0, value))
  }

  pin(index: number, x: number, y: number): void {
    if (index >= this.capacity || this.#lost) return
    const gl = this.#gl
    this.fixed[index] = 1
    const tx = index % this.#width
    const ty = Math.floor(index / this.#width)
    gl.bindTexture(gl.TEXTURE_2D, this.#states[this.#current].texture)
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      tx,
      ty,
      1,
      1,
      gl.RGBA,
      gl.FLOAT,
      new Float32Array([x, y, 0, 0]),
    )
    gl.bindTexture(gl.TEXTURE_2D, this.#props)
    const props = new Float32Array([this.#radius[index] ?? 0, 1, 0, 0])
    gl.texSubImage2D(gl.TEXTURE_2D, 0, tx, ty, 1, 1, gl.RGBA, gl.FLOAT, props)
  }

  step(): void {
    if (this.done) return
    this.alpha *= this.#cooling
    const gl = this.#gl
    const programs = this.#programs
    const state = this.#states[this.#current]
    const next = this.#states[this.#current === 0 ? 1 : 0]
    this.#bind(0, state.texture)
    this.#bind(1, this.#props)
    this.#bind(2, this.#bounds.texture)
    this.#bind(3, this.#pyramid)
    this.#bind(4, this.#springs.texture)

    gl.bindVertexArray(this.#empty)
    let source = this.#boundsChain[0] as SizedTarget
    this.#use(source.framebuffer, source.width, source.height)
    gl.useProgram(programs.bounds)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.useProgram(programs.boundsReduce)
    for (const target of this.#boundsChain.slice(1)) {
      this.#bind(5, source.texture)
      gl.uniform2i(this.#sizeAt, source.width, source.height)
      this.#use(target.framebuffer, target.width, target.height)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      source = target
    }

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.blendEquation(gl.FUNC_ADD)
    this.#use(this.#levelBuffers[0] ?? null, this.#cells, this.#cells)
    gl.clearBufferfv(gl.COLOR, 0, zero)
    gl.useProgram(programs.splat)
    gl.drawArrays(gl.POINTS, 0, this.capacity)

    gl.disable(gl.BLEND)
    gl.useProgram(programs.reduce)
    gl.activeTexture(gl.TEXTURE3)
    for (let level = 1; level <= this.#levels; level++) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, level - 1)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, level - 1)
      const size = this.#cells >> level
      this.#use(this.#levelBuffers[level] ?? null, size, size)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, this.#levels)

    this.#use(this.#springs.framebuffer, this.#width, this.#height)
    gl.clearBufferfv(gl.COLOR, 0, zero)
    if (this.#edgeVertices > 0) {
      gl.enable(gl.BLEND)
      gl.useProgram(programs.spring)
      gl.uniform1f(gl.getUniformLocation(programs.spring, 'alpha'), this.alpha)
      gl.bindVertexArray(this.#edges)
      gl.drawArrays(gl.POINTS, 0, this.#edgeVertices)
      gl.bindVertexArray(this.#empty)
      gl.disable(gl.BLEND)
    }

    const integrate = programs.integrate
    this.#use(next.framebuffer, this.#width, this.#height)
    gl.useProgram(integrate)
    gl.uniform1f(gl.getUniformLocation(integrate, 'strength'), -this.#repulsion * this.alpha)
    gl.uniform1f(gl.getUniformLocation(integrate, 'pull'), this.#gravity * this.alpha)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.#current = this.#current === 0 ? 1 : 0
  }

  read(target: Float32Array): Promise<boolean> {
    const gl = this.#gl
    if (this.#lost) return Promise.resolve(false)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.#states[this.#current].framebuffer)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.#pack)
    gl.readPixels(0, 0, this.#width, this.#height, gl.RGBA, gl.FLOAT, 0)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    gl.flush()
    return new Promise((resolve) => {
      const poll = () => {
        if (this.#lost || !sync) {
          resolve(false)
          return
        }
        const status = gl.clientWaitSync(sync, 0, 0)
        if (status === gl.TIMEOUT_EXPIRED) {
          setTimeout(poll, 1)
          return
        }
        gl.deleteSync(sync)
        if (status === gl.WAIT_FAILED) {
          resolve(false)
          return
        }
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.#pack)
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.#pixels)
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
        const limit = Math.min(this.capacity, target.length / 2)
        for (let i = 0; i < limit; i++) {
          target[i * 2] = this.#pixels[i * 4] ?? 0
          target[i * 2 + 1] = this.#pixels[i * 4 + 1] ?? 0
        }
        resolve(true)
      }
      poll()
    })
  }

  destroy(): void {
    this.#lost = true
    this.#gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  #loseContext(): void {
    this.#lost = true
  }

  #bindSamplers(): void {
    const gl = this.#gl
    const units: Record<string, number> = {
      state: 0,
      props: 1,
      bounds: 2,
      pyramid: 3,
      springs: 4,
      partial: 5,
      finer: 3,
    }
    for (const program of Object.values(this.#programs)) {
      gl.useProgram(program)
      for (const [name, unit] of Object.entries(units)) {
        const location = gl.getUniformLocation(program, name)
        if (location) gl.uniform1i(location, unit)
      }
      const set = (name: string, value: number) => {
        const location = gl.getUniformLocation(program, name)
        if (location) gl.uniform1i(location, value)
      }
      set('width', this.#width)
      set('height', this.#height)
      set('cells', this.#cells)
      set('levels', this.#levels)
      set('count', this.capacity)
      const keepAt = gl.getUniformLocation(program, 'keep')
      if (keepAt) gl.uniform1f(keepAt, keep)
      const centerAt = gl.getUniformLocation(program, 'center')
      if (centerAt) gl.uniform2f(centerAt, this.#center[0], this.#center[1])
    }
  }

  #use(framebuffer: WebGLFramebuffer | null, width: number, height: number): void {
    this.#gl.bindFramebuffer(this.#gl.FRAMEBUFFER, framebuffer)
    this.#gl.viewport(0, 0, width, height)
  }

  #bind(unit: number, texture: WebGLTexture): void {
    const gl = this.#gl
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, texture)
  }

  #nearest(): void {
    const gl = this.#gl
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  #texture(width: number, height: number, data: Float32Array | null): WebGLTexture {
    const gl = this.#gl
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height)
    if (data) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.FLOAT, data)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    return texture
  }

  #target(width: number, height: number, data: Float32Array | null): Target {
    const gl = this.#gl
    const texture = this.#texture(width, height, data)
    const framebuffer = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    return { texture, framebuffer }
  }
}

function edgeVertices(
  graph: ForceGraph,
  edgeLength: number,
): { vertices: Float32Array; count: number } {
  const degree = new Uint32Array(graph.capacity)
  const pairs: number[] = []
  for (let e = 0; e + 1 < graph.edges.length; e += 2) {
    const s = graph.edges[e] ?? 0
    const t = graph.edges[e + 1] ?? 0
    if (s === t || graph.alive[s] !== 1 || graph.alive[t] !== 1) continue
    pairs.push(s, t)
    degree[s] = (degree[s] ?? 0) + 1
    degree[t] = (degree[t] ?? 0) + 1
  }
  const edges = pairs.length / 2
  const vertices = new Float32Array(edges * 10)
  for (let e = 0; e < edges; e++) {
    const s = pairs[e * 2] ?? 0
    const t = pairs[e * 2 + 1] ?? 0
    const ds = degree[s] ?? 1
    const dt = degree[t] ?? 1
    const strength = 1 / Math.min(ds, dt)
    const bias = ds / (ds + dt)
    const rest = edgeLength + (graph.radius[s] ?? 0) + (graph.radius[t] ?? 0)
    vertices.set([t, s, strength, bias, rest, s, t, strength, 1 - bias, rest], e * 10)
  }
  return { vertices, count: edges * 2 }
}
