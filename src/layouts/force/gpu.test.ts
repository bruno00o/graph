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
