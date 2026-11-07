import { afterEach, describe, expect, it, vi } from 'vitest'
import { GpuForce } from './gpu'
import { type ForceEngine, type ForceGraph, forceDefaults } from './simulation'

const rendererParameter = 0x1f01

const graph: ForceGraph = {
  capacity: 2,
  alive: Uint8Array.from([1, 1]),
  movable: Uint8Array.from([1, 1]),
  xy: Float32Array.from([0, 0, 10, 0]),
  radius: new Float32Array(2).fill(4),
  edges: Uint32Array.from([0, 1]),
}

function canvasDrawnBy(renderer: string) {
  const asked: string[] = []
  const loseContext = vi.fn()
  const gl = {
    RENDERER: rendererParameter,
    getParameter: (parameter: number) => (parameter === rendererParameter ? renderer : null),
    getExtension: (name: string) => {
      asked.push(name)
      return name === 'WEBGL_lose_context' ? { loseContext } : null
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
  return { asked, loseContext }
}

function create(engine: ForceEngine) {
  return GpuForce.create(graph, { ...forceDefaults, engine })
}

describe('GpuForce.create', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('leaves a software renderer to the CPU engine in automatic mode', () => {
    const canvas = canvasDrawnBy('llvmpipe, or similar')
    expect(create('auto')).toBeNull()
    expect(canvas.loseContext).toHaveBeenCalledOnce()
    expect(canvas.asked).not.toContain('EXT_color_buffer_float')
  })

  it('still tries a software renderer when the GPU engine is asked for', () => {
    const canvas = canvasDrawnBy('llvmpipe, or similar')
    expect(create('gpu')).toBeNull()
    expect(canvas.asked).toContain('EXT_color_buffer_float')
  })

  it('tries a hardware renderer in automatic mode', () => {
    const canvas = canvasDrawnBy('Generic GPU, or similar')
    expect(create('auto')).toBeNull()
    expect(canvas.loseContext).not.toHaveBeenCalled()
    expect(canvas.asked).toContain('EXT_color_buffer_float')
  })
})
