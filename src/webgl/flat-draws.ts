import type { Attribute } from './gl'

const chunkVertices = 1 << 18

interface Source {
  words: Uint32Array
  version: number
}

interface Expanded {
  readonly buffer: WebGLBuffer
  version: number
  records: number
  bytes: number
}

interface Pointer {
  readonly location: number
  readonly attribute: Attribute
  readonly record: number
  readonly perInstance: boolean
}

interface Layout {
  readonly vao: WebGLVertexArrayObject
  readonly pointers: readonly Pointer[]
  readonly corner: WebGLBuffer | null
}

function bytesOf(gl: WebGL2RenderingContext, type: number): number {
  if (type === gl.BYTE || type === gl.UNSIGNED_BYTE) return 1
  if (type === gl.SHORT || type === gl.UNSIGNED_SHORT || type === gl.HALF_FLOAT) return 2
  return 4
}

export function stripTriangles(vertices: number, instances: number): Uint32Array {
  const per = (vertices - 2) * 3
  const indices = new Uint32Array(per * instances)
  let at = 0
  for (let instance = 0; instance < instances; instance++) {
    const base = instance * vertices
    for (let k = 0; k < vertices - 2; k++) {
      const odd = k % 2 === 1
      indices[at++] = base + k + (odd ? 1 : 0)
      indices[at++] = base + k + (odd ? 0 : 1)
      indices[at++] = base + k + 2
    }
  }
  return indices
}

export function pairedTriangles(
  corners: Float32Array,
  size: number,
  joined: readonly number[] = [],
): Uint32Array {
  const pairs = corners.length / size / 2
  const partOf = (at: number) => (size > 2 ? (corners[at + 2] ?? 0) : 0)
  const indices: number[] = []
  for (let pair = 0; pair + 1 < pairs; pair++) {
    const from = pair * 2 * size
    const to = from + 2 * size
    const part = Math.max(partOf(from), partOf(to))
    if (corners[from] === corners[to] && !joined.includes(part)) continue
    const at = pair * 2
    indices.push(at, at + 1, at + 2, at + 2, at + 1, at + 3)
  }
  return Uint32Array.from(indices)
}

export function repeatTriangles(
  pattern: Uint32Array,
  vertices: number,
  instances: number,
): Uint32Array {
  const indices = new Uint32Array(pattern.length * instances)
  for (let instance = 0; instance < instances; instance++) {
    const base = instance * vertices
    const at = instance * pattern.length
    for (let k = 0; k < pattern.length; k++) indices[at + k] = base + (pattern[k] ?? 0)
  }
  return indices
}

export function expandRecords(
  source: Uint32Array,
  words: number,
  vertices: number,
  perInstance: boolean,
  instances: number,
): Uint32Array {
  const out = new Uint32Array(instances * vertices * words)
  if (!perInstance) {
    const pattern = source.subarray(0, vertices * words)
    for (let instance = 0; instance < instances; instance++)
      out.set(pattern, instance * vertices * words)
    return out
  }
  const available = Math.floor(source.length / words)
  if (words === 1) {
    let at = 0
    for (let instance = 0; instance < Math.min(instances, available); instance++) {
      const value = source[instance] ?? 0
      for (let corner = 0; corner < vertices; corner++) out[at++] = value
    }
    return out
  }
  for (let instance = 0; instance < Math.min(instances, available); instance++) {
    const record = source.subarray(instance * words, (instance + 1) * words)
    const base = instance * vertices * words
    for (let corner = 0; corner < vertices; corner++) out.set(record, base + corner * words)
  }
  return out
}

export class FlatDraws {
  readonly #gl: WebGL2RenderingContext
  readonly #sources = new Map<WebGLBuffer, Source>()
  readonly #registered = new Map<WebGLVertexArrayObject, readonly Attribute[]>()
  readonly #layouts = new Map<WebGLVertexArrayObject, Map<WebGLProgram, Map<number, Layout>>>()
  readonly #expanded = new Map<WebGLBuffer, Map<string, Expanded>>()
  readonly #strips = new Map<Uint32Array, Expanded>()
  readonly #shapes = new Map<WebGLBuffer, Uint32Array>()
  readonly #patterns = new Map<number, Uint32Array>()

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl
  }

  get bytes(): number {
    let bytes = 0
    for (const map of this.#expanded.values())
      for (const expanded of map.values()) bytes += expanded.bytes
    for (const strips of this.#strips.values()) bytes += strips.bytes
    return bytes
  }

  track(buffer: WebGLBuffer, data: ArrayBufferView): void {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    const words = new Uint32Array(Math.ceil(bytes.byteLength / 4))
    new Uint8Array(words.buffer).set(bytes)
    const source = this.#sources.get(buffer)
    if (source) {
      source.words = words
      source.version++
    } else this.#sources.set(buffer, { words, version: 0 })
  }

  drop(buffer: WebGLBuffer): void {
    this.#sources.delete(buffer)
    const map = this.#expanded.get(buffer)
    if (!map) return
    for (const expanded of map.values()) this.#gl.deleteBuffer(expanded.buffer)
    this.#expanded.delete(buffer)
  }

  shape(buffer: WebGLBuffer, triangles: Uint32Array): void {
    this.#shapes.set(buffer, triangles)
  }

  register(vao: WebGLVertexArrayObject, attributes: readonly Attribute[]): void {
    this.#registered.set(vao, attributes)
  }

  handles(vao: WebGLVertexArrayObject): boolean {
    const attributes = this.#registered.get(vao)
    return attributes?.every(({ buffer }) => this.#sources.has(buffer)) ?? false
  }

  draw(vao: WebGLVertexArrayObject, program: WebGLProgram, vertices: number, count: number): void {
    if (count <= 0 || vertices < 3) return
    const gl = this.#gl
    const layout = this.#layout(vao, program, vertices)
    if (!layout) return
    const per = Math.max(1, Math.floor(chunkVertices / vertices))
    const first = Math.min(per, count)
    const triangles = (layout.corner && this.#shapes.get(layout.corner)) ?? this.#stripOf(vertices)
    gl.bindVertexArray(layout.vao)
    const strips = this.#stripsOf(triangles, vertices, first, per)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, strips.buffer)
    for (const pointer of layout.pointers) {
      if (pointer.perInstance) continue
      this.#point(pointer, this.#expand(pointer, vertices, false, first, per).buffer, 0)
    }
    for (let start = 0; start < count; start += per) {
      const instances = Math.min(per, count - start)
      for (const pointer of layout.pointers) {
        if (!pointer.perInstance) continue
        const expanded = this.#expand(pointer, vertices, true, 0, 0)
        if (start + instances > expanded.records) return
        this.#point(pointer, expanded.buffer, start * vertices * pointer.record)
      }
      gl.drawElements(gl.TRIANGLES, instances * triangles.length, gl.UNSIGNED_INT, 0)
    }
  }

  forget(vao: WebGLVertexArrayObject): void {
    this.#registered.delete(vao)
    const programs = this.#layouts.get(vao)
    if (!programs) return
    for (const layouts of programs.values())
      for (const layout of layouts.values()) this.#gl.deleteVertexArray(layout.vao)
    this.#layouts.delete(vao)
  }

  destroy(): void {
    const gl = this.#gl
    for (const vao of [...this.#layouts.keys()]) this.forget(vao)
    for (const map of this.#expanded.values())
      for (const expanded of map.values()) gl.deleteBuffer(expanded.buffer)
    for (const strips of this.#strips.values()) gl.deleteBuffer(strips.buffer)
    this.#expanded.clear()
    this.#strips.clear()
    this.#sources.clear()
    this.#registered.clear()
  }

  #layout(vao: WebGLVertexArrayObject, program: WebGLProgram, vertices: number): Layout | null {
    const attributes = this.#registered.get(vao)
    if (!attributes) return null
    let programs = this.#layouts.get(vao)
    if (!programs) {
      programs = new Map()
      this.#layouts.set(vao, programs)
    }
    let layouts = programs.get(program)
    if (!layouts) {
      layouts = new Map()
      programs.set(program, layouts)
    }
    const known = layouts.get(vertices)
    if (known) return known
    const gl = this.#gl
    const pointers: Pointer[] = []
    let corner: WebGLBuffer | null = null
    for (const attribute of attributes) {
      if (attribute.divisor === 0) corner ??= attribute.buffer
      const location = gl.getAttribLocation(program, attribute.name)
      if (location < 0) continue
      const record = attribute.stride || attribute.size * bytesOf(gl, attribute.type)
      pointers.push({ location, attribute, record, perInstance: attribute.divisor > 0 })
    }
    const flat = gl.createVertexArray()
    gl.bindVertexArray(flat)
    for (const pointer of pointers) {
      gl.enableVertexAttribArray(pointer.location)
      gl.vertexAttribDivisor(pointer.location, 0)
    }
    const layout: Layout = { vao: flat, pointers, corner }
    layouts.set(vertices, layout)
    return layout
  }

  #point(pointer: Pointer, buffer: WebGLBuffer, shift: number): void {
    const gl = this.#gl
    const { attribute, location } = pointer
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    const stride = attribute.stride ?? 0
    const offset = (attribute.offset ?? 0) + shift
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
  }

  #expand(
    pointer: Pointer,
    vertices: number,
    perInstance: boolean,
    wanted: number,
    most: number,
  ): Expanded {
    const gl = this.#gl
    const buffer = pointer.attribute.buffer
    const key = `${vertices}:${pointer.record}:${perInstance ? 1 : 0}`
    let map = this.#expanded.get(buffer)
    if (!map) {
      map = new Map()
      this.#expanded.set(buffer, map)
    }
    let expanded = map.get(key)
    if (!expanded) {
      expanded = { buffer: gl.createBuffer(), version: -1, records: 0, bytes: 0 }
      map.set(key, expanded)
    }
    const source = this.#sources.get(buffer)
    if (!source) return expanded
    const words = pointer.record / 4
    const fresh = expanded.version === source.version
    if (perInstance) {
      if (fresh) return expanded
      const records = Math.floor(source.words.length / words)
      this.#upload(expanded, expandRecords(source.words, words, vertices, true, records), records)
    } else {
      if (fresh && expanded.records >= wanted) return expanded
      const records = Math.min(Math.max(wanted, expanded.records * 2, 64), Math.max(most, wanted))
      this.#upload(expanded, expandRecords(source.words, words, vertices, false, records), records)
    }
    expanded.version = source.version
    return expanded
  }

  #upload(expanded: Expanded, data: Uint32Array, records: number): void {
    const gl = this.#gl
    gl.bindBuffer(gl.ARRAY_BUFFER, expanded.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
    expanded.records = records
    expanded.bytes = data.byteLength
  }

  #stripOf(vertices: number): Uint32Array {
    let pattern = this.#patterns.get(vertices)
    if (!pattern) {
      pattern = stripTriangles(vertices, 1)
      this.#patterns.set(vertices, pattern)
    }
    return pattern
  }

  #stripsOf(pattern: Uint32Array, vertices: number, wanted: number, most: number): Expanded {
    const gl = this.#gl
    let strips = this.#strips.get(pattern)
    if (!strips) {
      strips = { buffer: gl.createBuffer(), version: 0, records: 0, bytes: 0 }
      this.#strips.set(pattern, strips)
    }
    if (strips.records >= wanted) return strips
    const records = Math.min(Math.max(wanted, strips.records * 2, 64), Math.max(most, wanted))
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, strips.buffer)
    const indices = repeatTriangles(pattern, vertices, records)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)
    strips.records = records
    strips.bytes = indices.byteLength
    return strips
  }
}
