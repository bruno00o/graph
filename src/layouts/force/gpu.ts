import { type GroupTree, groupTree } from '../../core/group-tree'
import { createProgram } from '../../webgl/gl'
import {
  boundsBlockFragment,
  boundsFragment,
  fullVertex,
  groupReduceFragment,
  groupSolveFragment,
  groupSplatVertex,
  integrateFragment,
  reduceFragment,
  splatVertex,
  springVertex,
  valueFragment,
} from './gpu-shaders'
import {
  boxStiffness,
  drift,
  groupAlpha,
  groupMasses,
  leafStiffness,
  liftOf,
} from './groups'
import {
  Cooling,
  type ForceGraph,
  type ForceSettings,
  partialAlpha,
  retention,
  springsOf,
} from './simulation'

const boundsBlock = 4
const maxLevels = 11
const zero = new Float32Array(4)
const lowest = new Float32Array(4).fill(-3e38)
const maxLanes = 64
const laneLoad = 128

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

interface GroupPasses {
  readonly tree: GroupTree
  readonly width: number
  readonly height: number
  readonly pairs: number
  readonly pairArray: WebGLVertexArrayObject
  readonly lanes: number
  readonly laneWidth: number
  readonly laneHeight: number
  readonly splat: WebGLProgram
  readonly reduce: WebGLProgram
  readonly solve: WebGLProgram
  readonly sumLanes: Target
  readonly boxLanes: Target
  readonly springLanes: Target
  readonly info: WebGLTexture
  readonly sums: Target
  readonly boxes: Target
  readonly motion: Target
  readonly springs: Target
}

export class GpuForce {
  readonly capacity: number
  readonly fixed: Uint8Array
  readonly #gl: WebGL2RenderingContext
  readonly #width: number
  readonly #height: number
  readonly #levels: number
  readonly #cells: number
  readonly #cooling: Cooling
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
  readonly #slot: Float32Array
  readonly #groups: GroupPasses | null
  readonly #cohesion: number
  readonly #gap: number
  readonly #limit: number
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
    const tree = groupTree(capacity, graph.alive, graph.groups)
    this.#slot = new Float32Array(capacity).fill(-1)
    if (tree) for (let i = 0; i < capacity; i++) this.#slot[i] = tree.groupOf[i] ?? -1
    this.#cohesion = settings.cohesion
    this.#gap = settings.groupSpacing
    this.#limit = settings.edgeLength
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
      props[i * 4 + 3] = this.#slot[i] ?? -1
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
    this.#cooling = new Cooling(movers === 0 ? 0 : partial ? partialAlpha : 1, settings.steps)
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

    const masses = tree ? groupMasses(tree, graph.alive, graph.movable) : null
    const { vertices, count } = edgeVertices(graph, settings.edgeLength, tree, masses?.rigid)
    this.#edgeVertices = count
    this.#empty = gl.createVertexArray()
    this.#edges = gl.createVertexArray()
    gl.bindVertexArray(this.#edges)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 24, 16)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 24, 20)
    gl.bindVertexArray(null)
    this.#groups = tree && masses ? this.#groupPasses(graph, tree, masses) : null

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

  get alpha(): number {
    return this.#cooling.alpha
  }

  get done(): boolean {
    return this.#lost || this.#cooling.done
  }

  get lost(): boolean {
    return this.#lost
  }

  get progress(): number {
    return this.#cooling.progress
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
    const props = new Float32Array([this.#radius[index] ?? 0, 1, 0, this.#slot[index] ?? -1])
    gl.texSubImage2D(gl.TEXTURE_2D, 0, tx, ty, 1, 1, gl.RGBA, gl.FLOAT, props)
  }

  step(): void {
    if (this.done) return
    const alpha = this.#cooling.alpha
    const gl = this.#gl
    const programs = this.#programs
    const state = this.#states[this.#current]
    const next = this.#states[this.#current === 0 ? 1 : 0]
    this.#bind(0, state.texture)
    this.#bind(1, this.#props)
    this.#bind(2, this.#bounds.texture)
    this.#bind(3, this.#pyramid)
    this.#bind(4, this.#springs.texture)
    if (this.#groups) {
      this.#bind(6, this.#groups.info)
      this.#bind(7, this.#groups.sums.texture)
      this.#bind(8, this.#groups.boxes.texture)
      this.#bind(9, this.#groups.motion.texture)
      this.#bind(10, this.#groups.springs.texture)
    }

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

    const groups = this.#groups
    if (groups) this.#measureGroups(groups)
    this.#use(this.#springs.framebuffer, this.#width, this.#height)
    gl.clearBufferfv(gl.COLOR, 0, zero)
    if (this.#edgeVertices > 0) {
      gl.enable(gl.BLEND)
      gl.useProgram(programs.spring)
      gl.uniform1f(gl.getUniformLocation(programs.spring, 'alpha'), alpha)
      gl.uniform1i(gl.getUniformLocation(programs.spring, 'lifted'), 0)
      gl.bindVertexArray(this.#edges)
      gl.drawArrays(gl.POINTS, 0, this.#edgeVertices)
      if (groups) {
        this.#use(groups.springLanes.framebuffer, groups.laneWidth, groups.laneHeight)
        gl.clearBufferfv(gl.COLOR, 0, zero)
        gl.uniform1i(gl.getUniformLocation(programs.spring, 'lifted'), 1)
        gl.drawArrays(gl.POINTS, 0, this.#edgeVertices)
      }
      gl.bindVertexArray(this.#empty)
      gl.disable(gl.BLEND)
    } else if (groups) {
      this.#use(groups.springLanes.framebuffer, groups.laneWidth, groups.laneHeight)
      gl.clearBufferfv(gl.COLOR, 0, zero)
    }
    if (groups) this.#reduceLanes(groups, groups.springLanes, groups.springs, groups.tree.count, 0)

    const pushing = alpha <= groupAlpha ? 1 : 0
    const pull = this.#cohesion * alpha
    if (groups) {
      this.#use(groups.motion.framebuffer, groups.width, groups.height)
      gl.useProgram(groups.solve)
      gl.uniform1f(gl.getUniformLocation(groups.solve, 'drift'), pull * drift)
      gl.uniform1f(gl.getUniformLocation(groups.solve, 'pushing'), pushing)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const integrate = programs.integrate
    this.#use(next.framebuffer, this.#width, this.#height)
    gl.useProgram(integrate)
    gl.uniform1f(gl.getUniformLocation(integrate, 'strength'), -this.#repulsion * alpha)
    gl.uniform1f(gl.getUniformLocation(integrate, 'pull'), this.#gravity * alpha)
    if (groups) {
      gl.uniform1f(gl.getUniformLocation(integrate, 'cohesion'), pull)
      gl.uniform1f(gl.getUniformLocation(integrate, 'drift'), pull * drift)
      gl.uniform1f(gl.getUniformLocation(integrate, 'pushing'), pushing)
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.#current = this.#current === 0 ? 1 : 0
    this.#cooling.advance()
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

  #groupPasses(
    graph: ForceGraph,
    tree: GroupTree,
    masses: { readonly mass: Float64Array; readonly rigid: Uint8Array },
  ): GroupPasses {
    const gl = this.#gl
    const width = Math.max(1, Math.ceil(Math.sqrt(tree.count * 2)))
    const height = Math.max(1, Math.ceil((tree.count * 2) / width))
    const info = new Float32Array(width * height * 4)
    for (let slot = 0; slot < tree.count; slot++) {
      const mass = masses.mass[slot] ?? 0
      info.set(
        [
          tree.parent[slot] ?? -1,
          tree.first[slot] ?? 0,
          tree.children[slot] ?? 0,
          masses.rigid[slot] === 1 ? mass : -mass,
        ],
        slot * 4,
      )
    }
    const pairs: number[] = []
    const members = new Uint32Array(tree.count)
    for (let i = 0; i < graph.capacity; i++) {
      const slot = tree.groupOf[i] ?? -1
      if (graph.alive[i] !== 1 || slot < 0) continue
      let inflate = graph.radius[i] ?? 0
      for (let at = slot; at >= 0; at = tree.parent[at] ?? -1) {
        inflate += tree.padding[at] ?? 0
        pairs.push(i, at, inflate, at === slot ? 1 : 0)
        members[at] = (members[at] ?? 0) + 1
      }
    }
    let largest = 0
    for (const count of members) largest = Math.max(largest, count)
    let lanes = 1
    while (lanes < maxLanes && lanes * laneLoad < largest) lanes *= 2
    const laneWidth = Math.min(1024, tree.count * 2 * lanes)
    const laneHeight = Math.ceil((tree.count * 2 * lanes) / laneWidth)
    const pairArray = gl.createVertexArray()
    gl.bindVertexArray(pairArray)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(pairs), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0)
    gl.bindVertexArray(null)
    return {
      tree,
      width,
      height,
      pairs: pairs.length / 4,
      pairArray,
      lanes,
      laneWidth,
      laneHeight,
      splat: createProgram(gl, groupSplatVertex, valueFragment, {}),
      reduce: createProgram(gl, fullVertex, groupReduceFragment, {}),
      solve: createProgram(gl, fullVertex, groupSolveFragment, {}),
      sumLanes: this.#target(laneWidth, laneHeight, null),
      boxLanes: this.#target(laneWidth, laneHeight, null),
      springLanes: this.#target(laneWidth, laneHeight, null),
      info: this.#texture(width, height, info),
      sums: this.#target(width, height, null),
      boxes: this.#target(width, height, null),
      motion: this.#target(width, height, null),
      springs: this.#target(width, height, null),
    }
  }

  #measureGroups(groups: GroupPasses): void {
    const gl = this.#gl
    gl.bindVertexArray(groups.pairArray)
    gl.useProgram(groups.splat)
    const mode = gl.getUniformLocation(groups.splat, 'mode')
    gl.enable(gl.BLEND)
    this.#use(groups.sumLanes.framebuffer, groups.laneWidth, groups.laneHeight)
    gl.clearBufferfv(gl.COLOR, 0, zero)
    gl.uniform1i(mode, 0)
    gl.drawArrays(gl.POINTS, 0, groups.pairs)
    gl.uniform1i(mode, 1)
    gl.drawArrays(gl.POINTS, 0, groups.pairs)
    this.#use(groups.boxLanes.framebuffer, groups.laneWidth, groups.laneHeight)
    gl.clearBufferfv(gl.COLOR, 0, lowest)
    gl.blendEquation(gl.MAX)
    gl.uniform1i(mode, 2)
    gl.drawArrays(gl.POINTS, 0, groups.pairs)
    gl.blendEquation(gl.FUNC_ADD)
    gl.disable(gl.BLEND)
    gl.bindVertexArray(this.#empty)
    this.#reduceLanes(groups, groups.sumLanes, groups.sums, groups.tree.count * 2, 0)
    this.#reduceLanes(groups, groups.boxLanes, groups.boxes, groups.tree.count, 1)
  }

  #reduceLanes(
    groups: GroupPasses,
    lanes: Target,
    target: Target,
    entries: number,
    mode: 0 | 1,
  ): void {
    const gl = this.#gl
    this.#bind(11, lanes.texture)
    this.#use(target.framebuffer, groups.width, groups.height)
    gl.useProgram(groups.reduce)
    gl.uniform1i(gl.getUniformLocation(groups.reduce, 'entries'), entries)
    gl.uniform1i(gl.getUniformLocation(groups.reduce, 'mode'), mode)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
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
      groupInfo: 6,
      groupSums: 7,
      groupBoxes: 8,
      groupMotion: 9,
      groupSprings: 10,
      partialLanes: 11,
    }
    const groups = this.#groups
    const programs = Object.values(this.#programs)
    if (groups) programs.push(groups.splat, groups.reduce, groups.solve)
    for (const program of programs) {
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
      set('groups', groups?.tree.count ?? 0)
      set('roots', groups?.tree.roots ?? 0)
      set('groupWidth', groups?.width ?? 1)
      set('groupHeight', groups?.height ?? 1)
      set('lanes', groups?.lanes ?? 1)
      set('laneWidth', groups?.laneWidth ?? 1)
      set('laneHeight', groups?.laneHeight ?? 1)
      const float = (name: string, value: number) => {
        const location = gl.getUniformLocation(program, name)
        if (location) gl.uniform1f(location, value)
      }
      float('gap', this.#gap)
      float('limit', this.#limit)
      float('boxStiffness', boxStiffness)
      float('leafStiffness', leafStiffness)
      const retentionAt = gl.getUniformLocation(program, 'retention')
      if (retentionAt) gl.uniform1f(retentionAt, retention)
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
  tree: GroupTree | null,
  rigid: Uint8Array | undefined,
): { vertices: Float32Array; count: number } {
  const { count, ends, stiffness, share, rest } = springsOf(graph, edgeLength)
  const lift = tree && rigid ? liftOf(tree, rigid, ends, count) : null
  const vertices = new Float32Array(count * 12)
  for (let k = 0; k < count; k++) {
    const s = ends[k * 2] ?? 0
    const t = ends[k * 2 + 1] ?? 0
    const k0 = stiffness[k] ?? 0
    const ws = share[k] ?? 0.5
    const length = rest[k] ?? 0
    const ls = lift ? (lift[k * 2] ?? -1) : -1
    const lt = lift ? (lift[k * 2 + 1] ?? -1) : -1
    vertices.set([s, t, k0, ws, length, ls, t, s, k0, 1 - ws, length, lt], k * 12)
  }
  return { vertices, count: count * 2 }
}
