import { describe, expect, it } from 'vitest'
import {
  expandRecords,
  FlatDraws,
  pairedTriangles,
  repeatTriangles,
  stripTriangles,
} from './flat-draws'
import type { Attribute } from './gl'
import { cornerEdge } from './shaders'

interface Pointer {
  buffer: object | null
  size: number
  type: number
  integer: boolean
  stride: number
  offset: number
}

const constants = {
  ARRAY_BUFFER: 1,
  ELEMENT_ARRAY_BUFFER: 2,
  TRIANGLES: 3,
  UNSIGNED_INT: 4,
  FLOAT: 5,
  DYNAMIC_DRAW: 6,
  STATIC_DRAW: 7,
  BYTE: 8,
  UNSIGNED_BYTE: 9,
  SHORT: 10,
  UNSIGNED_SHORT: 11,
  HALF_FLOAT: 12,
}

function fakeGl(locations: Readonly<Record<string, number>>) {
  const data = new Map<object, Uint8Array>()
  const arrays = new Map<object, { pointers: Map<number, Pointer>; elements: object | null }>()
  let array: { pointers: Map<number, Pointer>; elements: object | null } | null = null
  let bound: object | null = null
  const draws: { count: number; pointers: Map<number, Pointer>; elements: object | null }[] = []
  const pointer = (
    location: number,
    size: number,
    type: number,
    integer: boolean,
    stride: number,
    offset: number,
  ) => {
    array?.pointers.set(location, { buffer: bound, size, type, integer, stride, offset })
  }
  const gl = {
    ...constants,
    createBuffer: () => ({}),
    deleteBuffer: (buffer: object) => data.delete(buffer),
    bindBuffer(target: number, buffer: object | null) {
      if (target === constants.ARRAY_BUFFER) bound = buffer
      else if (array) array.elements = buffer
    },
    bufferData(target: number, source: ArrayBufferView) {
      const buffer = target === constants.ARRAY_BUFFER ? bound : array?.elements
      if (!buffer) return
      data.set(buffer, new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice())
    },
    createVertexArray() {
      const made = {}
      arrays.set(made, { pointers: new Map(), elements: null })
      return made
    },
    deleteVertexArray: (vao: object) => arrays.delete(vao),
    bindVertexArray(vao: object | null) {
      array = vao ? (arrays.get(vao) ?? null) : null
    },
    enableVertexAttribArray() {},
    vertexAttribDivisor() {},
    vertexAttribPointer: (l: number, s: number, t: number, _n: boolean, st: number, o: number) =>
      pointer(l, s, t, false, st, o),
    vertexAttribIPointer: (l: number, s: number, t: number, st: number, o: number) =>
      pointer(l, s, t, true, st, o),
    getAttribLocation: (_program: object, name: string) => locations[name] ?? -1,
    drawElements(_mode: number, count: number) {
      if (!array) return
      draws.push({ count, pointers: new Map(array.pointers), elements: array.elements })
    },
  }
  const read = (draw: (typeof draws)[number], location: number, vertex: number): number[] => {
    const at = draw.pointers.get(location)
    const bytes = at?.buffer ? data.get(at.buffer) : undefined
    if (!at || !bytes) return []
    const stride = at.stride || at.size * 4
    const view = new DataView(bytes.buffer)
    return Array.from({ length: at.size }, (_, component) => {
      const offset = at.offset + vertex * stride + component * 4
      return at.type === constants.FLOAT
        ? view.getFloat32(offset, true)
        : view.getUint32(offset, true)
    })
  }
  const vertices = (draw: (typeof draws)[number], location: number): number[][] => {
    const elements = draw.elements ? data.get(draw.elements) : undefined
    if (!elements) return []
    const indices = new Uint32Array(elements.buffer, 0, draw.count)
    return Array.from(indices, (index) => read(draw, location, index))
  }
  return { gl: gl as unknown as WebGL2RenderingContext, draws, vertices }
}

function instancedTriangles(corners: number[][], records: number[][], count: number) {
  const corner: number[][] = []
  const record: number[][] = []
  const strip = stripTriangles(corners.length, count)
  for (const index of strip) {
    corner.push(corners[index % corners.length] ?? [])
    record.push(records[Math.floor(index / corners.length)] ?? [])
  }
  return { corner, record }
}

describe('flat draws', () => {
  it('turns triangle strips into triangles that keep their winding', () => {
    expect([...stripTriangles(4, 2)]).toEqual([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7])
    expect([...stripTriangles(5, 1)]).toEqual([0, 1, 2, 2, 1, 3, 2, 3, 4])
  })

  it('leaves out the quads of a strip that stay on one station', () => {
    const corners = Float32Array.of(0, -1, 0, 1, 1, -1, 1, 1, 1, -1, 1, 1, 2, -1, 2, 1)
    expect([...pairedTriangles(corners, 2)]).toEqual([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7])
    expect(pairedTriangles(cornerEdge, 3).length).toBe(18)
    expect([...pairedTriangles(cornerEdge, 3, [2])].slice(12, 18)).toEqual([6, 7, 8, 8, 7, 9])
    expect(pairedTriangles(cornerEdge, 3, [1, 2]).length).toBe(30)
    expect([...repeatTriangles(Uint32Array.of(0, 1, 2), 4, 2)]).toEqual([0, 1, 2, 4, 5, 6])
  })

  it('repeats each instance record once per vertex', () => {
    expect([...expandRecords(Uint32Array.of(7, 9), 1, 3, true, 2)]).toEqual([7, 7, 7, 9, 9, 9])
    expect([...expandRecords(Uint32Array.of(1, 2, 3, 4), 2, 2, true, 2)]).toEqual([
      1, 2, 1, 2, 3, 4, 3, 4,
    ])
    expect([...expandRecords(Uint32Array.of(5, 6, 7), 1, 3, false, 2)]).toEqual([5, 6, 7, 5, 6, 7])
  })

  it('draws the same vertices as an instanced strip', () => {
    const { gl, draws, vertices } = fakeGl({ corner: 0, instance: 1 })
    const flat = new FlatDraws(gl)
    const corners = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]
    const cornerBuffer = gl.createBuffer()
    const cornerData = new Float32Array(corners.flat())
    flat.track(cornerBuffer, cornerData)
    const indexBuffer = gl.createBuffer()
    const indexData = Uint32Array.of(4, 0, 9, 2)
    flat.track(indexBuffer, indexData)
    const attributes: Attribute[] = [
      { name: 'corner', buffer: cornerBuffer, size: 2, type: gl.FLOAT, divisor: 0 },
      {
        name: 'instance',
        buffer: indexBuffer,
        size: 1,
        type: gl.UNSIGNED_INT,
        integer: true,
        divisor: 1,
      },
    ]
    const vao = gl.createVertexArray()
    flat.register(vao, attributes)
    expect(flat.handles(vao)).toBe(true)
    const program = {} as WebGLProgram
    flat.draw(vao, program, 4, 3)
    expect(draws).toHaveLength(1)
    const draw = draws[0]
    if (!draw) return
    const expected = instancedTriangles(
      corners,
      [...indexData].map((value) => [value]),
      3,
    )
    expect(vertices(draw, 0)).toEqual(expected.corner)
    expect(vertices(draw, 1)).toEqual(expected.record)
  })

  it('follows new data and splits long draws', () => {
    const { gl, draws, vertices } = fakeGl({ corner: 0, instance: 1 })
    const flat = new FlatDraws(gl)
    const corners = Array.from({ length: 12 }, (_, index) => [index, -index, index * 2])
    const cornerBuffer = gl.createBuffer()
    flat.track(cornerBuffer, new Float32Array(corners.flat()))
    const indexBuffer = gl.createBuffer()
    flat.track(indexBuffer, Uint32Array.of(1, 2))
    const vao = gl.createVertexArray()
    flat.register(vao, [
      { name: 'corner', buffer: cornerBuffer, size: 3, type: gl.FLOAT, divisor: 0 },
      {
        name: 'instance',
        buffer: indexBuffer,
        size: 1,
        type: gl.UNSIGNED_INT,
        integer: true,
        divisor: 1,
      },
    ])
    const program = {} as WebGLProgram
    flat.draw(vao, program, 12, 2)
    const many = Uint32Array.from({ length: 30_000 }, (_, index) => 30_000 - index)
    flat.track(indexBuffer, many)
    flat.draw(vao, program, 12, many.length)
    expect(draws.length).toBe(3)
    const [, first, second] = draws
    if (!first || !second) return
    const per = first.count / 30
    expect(per + second.count / 30).toBe(many.length)
    expect(vertices(second, 1)[0]).toEqual([many[per]])
    expect(vertices(first, 0).slice(0, 3)).toEqual([corners[0], corners[1], corners[2]])
  })

  it('draws the triangles given for a corner buffer', () => {
    const { gl, draws, vertices } = fakeGl({ corner: 0, instance: 1 })
    const flat = new FlatDraws(gl)
    const corners = Float32Array.of(0, -1, 0, 1, 1, -1, 1, 1, 1, -1, 1, 1, 2, -1, 2, 1)
    const cornerBuffer = gl.createBuffer()
    flat.track(cornerBuffer, corners)
    flat.shape(cornerBuffer, pairedTriangles(corners, 2))
    const indexBuffer = gl.createBuffer()
    flat.track(indexBuffer, Uint32Array.of(3, 5))
    const vao = gl.createVertexArray()
    flat.register(vao, [
      { name: 'corner', buffer: cornerBuffer, size: 2, type: gl.FLOAT, divisor: 0 },
      {
        name: 'instance',
        buffer: indexBuffer,
        size: 1,
        type: gl.UNSIGNED_INT,
        integer: true,
        divisor: 1,
      },
    ])
    flat.draw(vao, {} as WebGLProgram, 8, 2)
    const draw = draws[0]
    expect(draw?.count).toBe(24)
    if (!draw) return
    expect(vertices(draw, 1)).toEqual([...Array(12).fill([3]), ...Array(12).fill([5])])
    expect(vertices(draw, 0).slice(6, 9)).toEqual([
      [1, -1],
      [1, 1],
      [2, -1],
    ])
  })

  it('leaves untracked buffers to instanced draws', () => {
    const { gl } = fakeGl({ corner: 0, instance: 1 })
    const flat = new FlatDraws(gl)
    const tracked = gl.createBuffer()
    flat.track(tracked, new Float32Array(8))
    const vao = gl.createVertexArray()
    flat.register(vao, [
      { name: 'corner', buffer: tracked, size: 2, type: gl.FLOAT, divisor: 0 },
      { name: 'instance', buffer: gl.createBuffer(), size: 1, type: gl.UNSIGNED_INT, divisor: 1 },
    ])
    expect(flat.handles(vao)).toBe(false)
    expect(flat.handles(gl.createVertexArray())).toBe(false)
  })
})
