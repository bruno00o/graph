import { shapeCodes } from './columns'

export const squareReach = 0.86
export const diamondReach = 1.2
export const minimumNodeRadius = 1.25
export const maxShapeReach: number = Math.max(squareReach * Math.SQRT2, diamondReach)

export function nodeShapeDistance(shape: number, x: number, y: number, radius: number): number {
  if (shape === shapeCodes.square) {
    const half = radius * squareReach
    const qx = Math.abs(x) - half
    const qy = Math.abs(y) - half
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
  }
  if (shape === shapeCodes.diamond) {
    return (Math.abs(x) + Math.abs(y) - radius * diamondReach) * Math.SQRT1_2
  }
  return Math.hypot(x, y) - radius
}

export function nodeShapeReach(shape: number): number {
  if (shape === shapeCodes.square) return squareReach * Math.SQRT2
  if (shape === shapeCodes.diamond) return diamondReach
  return 1
}
