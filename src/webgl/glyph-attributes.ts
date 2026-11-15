import type { Attribute } from './gl'

export const glyphStride = 40
export const worldGlyph = 256
export const hullGlyph = 512

export function glyphAttributes(
  gl: WebGL2RenderingContext,
  corner: WebGLBuffer,
  buffer: WebGLBuffer,
): Attribute[] {
  const field = (
    name: string,
    offset: number,
    size: number,
    type: number,
    integer: boolean,
    normalized = false,
  ): Attribute => ({
    name,
    buffer,
    size,
    type,
    integer,
    normalized,
    divisor: 1,
    stride: glyphStride,
    offset,
  })
  return [
    { name: 'corner', buffer: corner, size: 2, type: gl.FLOAT, divisor: 0 },
    field('glyphNode', 0, 1, gl.UNSIGNED_INT, true),
    field('glyphKind', 4, 1, gl.UNSIGNED_INT, true),
    field('glyphRect', 8, 4, gl.FLOAT, false),
    field('glyphUv', 24, 4, gl.UNSIGNED_SHORT, false, true),
    field('glyphColor', 32, 1, gl.UNSIGNED_INT, true),
    field('glyphSize', 36, 1, gl.FLOAT, false),
  ]
}

export function anchorAttributes(gl: WebGL2RenderingContext, buffer: WebGLBuffer): Attribute[] {
  return [
    { name: 'glyphAnchor', buffer, size: 4, type: gl.FLOAT, divisor: 1, stride: 24, offset: 0 },
    { name: 'glyphFit', buffer, size: 2, type: gl.FLOAT, divisor: 1, stride: 24, offset: 16 },
  ]
}
