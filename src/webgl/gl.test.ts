import { describe, expect, it, vi } from 'vitest'
import { drawsInSoftware } from './gl'

const rendererParameter = 0x1f01
const unmaskedParameter = 0x9246

function context(renderer: string, unmasked: string | null) {
  const getExtension = vi.fn((name: string) =>
    name === 'WEBGL_debug_renderer_info' && unmasked !== null
      ? { UNMASKED_RENDERER_WEBGL: unmaskedParameter }
      : null,
  )
  const gl = {
    RENDERER: rendererParameter,
    getParameter: (parameter: number) =>
      parameter === rendererParameter
        ? renderer
        : parameter === unmaskedParameter
          ? unmasked
          : null,
    getExtension,
  }
  return { gl: gl as unknown as WebGL2RenderingContext, getExtension }
}

describe('drawsInSoftware', () => {
  it('reads the unmasked renderer when the renderer is masked', () => {
    const masked = (unmasked: string) => drawsInSoftware(context('WebKit WebGL', unmasked).gl)
    expect(masked('Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver')).toBe(true)
    expect(masked('llvmpipe, 256 bits')).toBe(true)
    expect(masked('Basic Render Driver')).toBe(true)
    expect(masked('Software Renderer')).toBe(true)
    expect(masked('Generic GPU')).toBe(false)
  })

  it('trusts a renderer that is not masked without asking for the unmasked one', () => {
    const software = context('llvmpipe, or similar', null)
    expect(drawsInSoftware(software.gl)).toBe(true)
    expect(software.getExtension).not.toHaveBeenCalled()
    const hardware = context('Generic GPU, or similar', 'never read')
    expect(drawsInSoftware(hardware.gl)).toBe(false)
    expect(hardware.getExtension).not.toHaveBeenCalled()
  })

  it('assumes a GPU when the masked renderer cannot be unmasked', () => {
    expect(drawsInSoftware(context('WebKit WebGL', null).gl)).toBe(false)
  })
})
