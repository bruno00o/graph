import { dev } from '../dev'
import { textureWidth } from './gl'

export interface GlCaps {
  readonly maxTextureSize: number
  readonly maxArrayLayers: number
  readonly maxRenderbufferSize: number
  readonly maxViewport: number
  readonly maxDrawingBuffer: number
  readonly dataCapacity: number
  readonly renderer: string
  readonly software: boolean
}

const softwarePattern = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i
const debugRenderer = 0x9246

function numberOf(gl: WebGL2RenderingContext, name: number, fallback: number): number {
  const value = gl.getParameter(name) as unknown
  return typeof value === 'number' && value > 0 ? value : fallback
}

function viewportOf(gl: WebGL2RenderingContext, fallback: number): number {
  const value = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as ArrayLike<number> | null
  const width = value?.[0] ?? fallback
  const height = value?.[1] ?? fallback
  return Math.max(1, Math.min(width, height))
}

function rendererOf(gl: WebGL2RenderingContext): string {
  const plain = gl.getParameter(gl.RENDERER)
  const name = typeof plain === 'string' ? plain : ''
  if (softwarePattern.test(name) || !/^webkit webgl$/i.test(name)) return name
  if (!gl.getExtension('WEBGL_debug_renderer_info')) return name
  const unmasked = gl.getParameter(debugRenderer)
  return typeof unmasked === 'string' && unmasked !== '' ? unmasked : name
}

export function isSoftware(gl: WebGL2RenderingContext): boolean {
  return softwarePattern.test(rendererOf(gl))
}

export function readCaps(gl: WebGL2RenderingContext): GlCaps {
  const maxTextureSize = numberOf(gl, gl.MAX_TEXTURE_SIZE, 2048)
  const maxRenderbufferSize = numberOf(gl, gl.MAX_RENDERBUFFER_SIZE, 2048)
  const maxViewport = viewportOf(gl, maxRenderbufferSize)
  const renderer = rendererOf(gl)
  return {
    maxTextureSize,
    maxArrayLayers: numberOf(gl, gl.MAX_ARRAY_TEXTURE_LAYERS, 256),
    maxRenderbufferSize,
    maxViewport,
    maxDrawingBuffer: Math.min(maxRenderbufferSize, maxViewport, maxTextureSize),
    dataCapacity: maxTextureSize * textureWidth,
    renderer,
    software: softwarePattern.test(renderer),
  }
}

const warned = new Set<string>()

export function warnLimit(key: string, message: string): void {
  if (!dev || warned.has(key)) return
  warned.add(key)
  console.warn(`graph: ${message}`)
}
