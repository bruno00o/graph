import type { Attribute } from './gl'
import { glyphStride } from './label-layer'

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
