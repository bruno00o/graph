import type { Point, View } from '../types'
import type { FitOptions, ViewOptions } from './mount-graph'

function finite(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

export function finitePoint(point: Point | null | undefined): boolean {
  return finite(point?.x) && finite(point?.y)
}

export function checkView(view: View): void {
  if (!finitePoint(view) || !finite(view.zoom)) {
    throw new RangeError('graph: a view needs a finite x, y and zoom')
  }
}

export function checkFactor(factor: number): void {
  if (!finite(factor) || factor <= 0) {
    throw new RangeError('graph: a zoom factor must be a positive finite number')
  }
}

export function checkDuration(options: ViewOptions | undefined): void {
  const duration = options?.duration
  if (duration !== undefined && !finite(duration)) {
    throw new RangeError('graph: a duration must be a finite number')
  }
}

export function checkFit(options: FitOptions): void {
  checkDuration(options)
  const { maxZoom, padding } = options
  if (maxZoom !== undefined && !finite(maxZoom)) {
    throw new RangeError('graph: fit maxZoom must be a finite number')
  }
  const sides =
    typeof padding === 'object' && padding !== null
      ? [padding.top, padding.right, padding.bottom, padding.left]
      : [padding]
  if (sides.some((side) => side !== undefined && !finite(side))) {
    throw new RangeError('graph: fit padding must be finite numbers')
  }
}
