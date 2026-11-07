import { afterEach, describe, expect, it } from 'vitest'
import { capsFromQuery, type LimitedWebgl, limitWebgl, lowCaps } from '../testing/webgl-caps'
import { readCaps } from './caps'

class FakeGl {
  readonly RENDERER = 0x1f01
  readonly MAX_TEXTURE_SIZE = 0x0d33
  readonly MAX_VIEWPORT_DIMS = 0x0d3a
  readonly MAX_RENDERBUFFER_SIZE = 0x84e8
  readonly MAX_ARRAY_TEXTURE_LAYERS = 0x88ff
  readonly NO_ERROR = 0
  readonly uploads: string[] = []
  renderer = 'WebKit WebGL'
  unmasked = 'Apple M4 Pro'

  getParameter(parameter: number): unknown {
    if (parameter === this.RENDERER) return this.renderer
    if (parameter === 0x9246) return this.unmasked
    if (parameter === this.MAX_TEXTURE_SIZE) return 16384
    if (parameter === this.MAX_RENDERBUFFER_SIZE) return 16384
    if (parameter === this.MAX_VIEWPORT_DIMS) return new Int32Array([16384, 16384])
    if (parameter === this.MAX_ARRAY_TEXTURE_LAYERS) return 2048
    return null
  }

  getExtension(name: string): object | null {
    return name.startsWith('WEBGL_') || name.startsWith('EXT_') ? {} : null
  }

  getSupportedExtensions(): string[] {
    return ['EXT_color_buffer_float', 'EXT_float_blend', 'WEBGL_lose_context']
  }

  getError(): number {
    return this.NO_ERROR
  }

  texImage2D(...args: unknown[]): void {
    this.uploads.push(`2d ${args[3]}x${args[4]}`)
  }

  texStorage3D(...args: unknown[]): void {
    this.uploads.push(`3d ${args[3]}x${args[4]}x${args[5]}`)
  }
}

let limited: LimitedWebgl | null = null

afterEach(() => {
  limited?.restore()
  limited = null
})

function context(): WebGL2RenderingContext & FakeGl {
  return new FakeGl() as unknown as WebGL2RenderingContext & FakeGl
}

describe('readCaps', () => {
  it('reads the limits of the context', () => {
    const caps = readCaps(context())
    expect(caps.maxTextureSize).toBe(16384)
    expect(caps.maxDrawingBuffer).toBe(16384)
    expect(caps.dataCapacity).toBe(16384 * 1024)
    expect(caps.maxArrayLayers).toBe(2048)
    expect(caps.renderer).toBe('Apple M4 Pro')
    expect(caps.software).toBe(false)
  })

  it('recognizes software rasterizers from the renderer string', () => {
    const gl = context()
    gl.unmasked = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'
    expect(readCaps(gl).software).toBe(true)
    gl.renderer = 'llvmpipe, or similar'
    expect(readCaps(gl).software).toBe(true)
    expect(readCaps(gl).renderer).toBe('llvmpipe, or similar')
  })
})

describe('limitWebgl', () => {
  it('lowers the limits and hides the optional extensions', () => {
    limited = limitWebgl(lowCaps, FakeGl.prototype)
    const gl = context()
    const caps = readCaps(gl)
    expect(caps.maxTextureSize).toBe(2048)
    expect(caps.maxDrawingBuffer).toBe(2048)
    expect(caps.maxArrayLayers).toBe(256)
    expect(caps.dataCapacity).toBe(2048 * 1024)
    expect(caps.renderer).toBe('WebKit WebGL')
    expect(gl.getExtension('EXT_color_buffer_float')).toBeNull()
    expect(gl.getSupportedExtensions()).toEqual([])
  })

  it('refuses textures over the simulated limits as a real context would', () => {
    limited = limitWebgl(lowCaps, FakeGl.prototype)
    const gl = context()
    gl.texImage2D(gl.TEXTURE_2D, 0, 0, 1024, 2048, 0, 0, 0, null)
    gl.texImage2D(gl.TEXTURE_2D, 0, 0, 1024, 4096, 0, 0, 0, null)
    gl.texStorage3D(0, 1, 0, 256, 256, 512)
    expect(gl.uploads).toEqual(['2d 1024x2048'])
    expect(limited.violations).toHaveLength(2)
    expect(gl.getError()).toBe(0x0501)
    expect(gl.getError()).toBe(0)
  })

  it('restores the context methods', () => {
    limited = limitWebgl(lowCaps, FakeGl.prototype)
    limited.restore()
    limited = null
    expect(readCaps(context()).maxTextureSize).toBe(16384)
  })

  it('reads the simulation from a query string', () => {
    expect(capsFromQuery('?caps=low')).toBe(lowCaps)
    expect(capsFromQuery('?caps=software')?.renderer).toMatch(/SwiftShader/)
    expect(capsFromQuery('?nodes=10')).toBeNull()
    expect(capsFromQuery('?caps=low&texture=512')?.limits?.MAX_TEXTURE_SIZE).toBe(1024)
  })
})
