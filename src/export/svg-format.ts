import type { ShapePaint } from '../core/shape-engine'

export function num(value: number): string {
  return String(Math.round(value * 100) / 100)
}

export function fine(value: number): string {
  return String(Math.round(value * 10000) / 10000)
}

export function paintAttribute(name: 'fill' | 'stroke', paint: ShapePaint): string {
  return paint.alpha >= 0.999
    ? ` ${name}="${paint.hex}"`
    : ` ${name}="${paint.hex}" ${name}-opacity="${fine(paint.alpha)}"`
}
