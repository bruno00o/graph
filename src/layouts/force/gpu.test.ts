import { afterEach, describe, expect, it, vi } from 'vitest'
import { GpuForce } from './gpu'
import { type ForceGraph, forceDefaults } from './simulation'

const graph: ForceGraph = {
  capacity: 2,
  alive: Uint8Array.from([1, 1]),
  movable: Uint8Array.from([1, 1]),
  xy: Float32Array.from([0, 0, 10, 0]),
  radius: Float32Array.from([4, 4]),
  edges: Uint32Array.from([0, 1]),
}

function offscreen(extensions: readonly string[], renderer = 'Apple M4 Pro') {
  const released: string[] = []
  const gl = {
    RENDERER: 0x1f01,
    getParameter: (parameter: number) => (parameter === 0x1f01 ? renderer : null),
    getExtension: (name: string) => {
      if (name === 'WEBGL_lose_context') return { loseContext: () => released.push('lost') }
      return extensions.includes(name) ? {} : null
    },
  }
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return gl
      }
      addEventListener() {}
    },
  )
  return released
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GpuForce.create', () => {
  it('declines without offscreen canvases', () => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    expect(GpuForce.create(graph, forceDefaults)).toBeNull()
  })

  it.each([[[]], [['EXT_color_buffer_float']], [['EXT_float_blend']]])(
    'declines and releases the context without float render targets and blending (%j)',
    (names) => {
      const released = offscreen(names)
      expect(GpuForce.create(graph, forceDefaults)).toBeNull()
      expect(released).toEqual(['lost'])
    },
  )

  it('leaves a software renderer to the CPU engine', () => {
    const released = offscreen(['EXT_color_buffer_float', 'EXT_float_blend'], 'SwiftShader driver')
    expect(GpuForce.create(graph, forceDefaults)).toBeNull()
    expect(released).toEqual(['lost'])
  })

  it('declines when the context cannot build the layout', () => {
    const released = offscreen(['EXT_color_buffer_float', 'EXT_float_blend'])
    expect(GpuForce.create(graph, forceDefaults)).toBeNull()
    expect(released).toEqual(['lost'])
  })
})

function recordingContext(uploads: unknown[][]) {
  const constant = (name: string) => {
    let hash = 7
    for (const char of name) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0
    return hash
  }
  const methods: Record<string, (...args: unknown[]) => unknown> = {
    getParameter: () => 'Apple M4 Pro',
    getExtension: () => ({ loseContext: () => {} }),
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    isContextLost: () => false,
    checkFramebufferStatus: () => constant('FRAMEBUFFER_COMPLETE'),
    getError: () => constant('NO_ERROR'),
    getUniformBlockIndex: () => constant('INVALID_INDEX'),
    texSubImage2D: (...args) => uploads.push(args),
  }
  const gl = new Proxy(
    {},
    {
      get: (_, name) =>
        typeof name !== 'string'
          ? undefined
          : /^[A-Z0-9_]+$/.test(name)
            ? constant(name)
            : (methods[name] ?? (() => ({}))),
    },
  )
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return gl
      }
      addEventListener() {}
    },
  )
}

describe('GpuForce.pin', () => {
  it('ignores pins on free slots and at non-finite positions', () => {
    const uploads: unknown[][] = []
    recordingContext(uploads)
    const force = GpuForce.create(
      {
        ...graph,
        capacity: 3,
        alive: Uint8Array.from([1, 0, 1]),
        movable: Uint8Array.from([1, 0, 1]),
      },
      forceDefaults,
    )
    expect(force).not.toBeNull()
    const before = uploads.length
    force?.pin(1, 5, 5)
    force?.pin(0, Number.NaN, 5)
    force?.pin(7, 5, 5)
    expect(uploads.length).toBe(before)
    expect(force?.fixed[0]).toBe(0)
    force?.pin(0, 5, 5)
    expect(uploads.length).toBe(before + 2)
    expect(force?.fixed[0]).toBe(1)
  })
})
