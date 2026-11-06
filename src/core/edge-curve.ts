export interface Cubic {
  readonly ax: number
  readonly ay: number
  readonly bx: number
  readonly by: number
  readonly cx: number
  readonly cy: number
  readonly dx: number
  readonly dy: number
}

export const curveSegments = 24
export const loopTurn = 0.6
export const loopMinimum = 12
export const loopGrowth = 0.5
const maxBend = 0.12
const spreadBend = 0.4

export function laneBend(position: number, count: number): number {
  if (count < 2) return 0
  const step = Math.min(maxBend, spreadBend / (count - 1))
  return (position - (count - 1) / 2) * step
}

export function loopReach(radius: number, ordinal: number, minimum: number): number {
  return radius + Math.max(radius * 1.5, minimum) * (1 + loopGrowth * ordinal)
}

export function parallelCurve(ax: number, ay: number, dx: number, dy: number, bend: number): Cubic {
  const length = Math.hypot(dx - ax, dy - ay)
  const nx = length > 0 ? -(dy - ay) / length : 0
  const ny = length > 0 ? (dx - ax) / length : 1
  const offset = 2 * bend * length
  const px = (ax + dx) / 2 + nx * offset
  const py = (ay + dy) / 2 + ny * offset
  return {
    ax,
    ay,
    bx: ax + ((px - ax) * 2) / 3,
    by: ay + ((py - ay) * 2) / 3,
    cx: dx + ((px - dx) * 2) / 3,
    cy: dy + ((py - dy) * 2) / 3,
    dx,
    dy,
  }
}

export function loopCurve(x: number, y: number, reach: number): Cubic {
  const arm = reach / (0.75 * Math.cos(loopTurn))
  const ux = Math.SQRT1_2
  const uy = -Math.SQRT1_2
  const cos = Math.cos(loopTurn)
  const sin = Math.sin(loopTurn)
  return {
    ax: x,
    ay: y,
    bx: x + arm * (ux * cos - uy * sin),
    by: y + arm * (ux * sin + uy * cos),
    cx: x + arm * (ux * cos + uy * sin),
    cy: y + arm * (-ux * sin + uy * cos),
    dx: x,
    dy: y,
  }
}

export function pointOnCubic(curve: Cubic, t: number): { readonly x: number; readonly y: number } {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * curve.ax + b * curve.bx + c * curve.cx + d * curve.dx,
    y: a * curve.ay + b * curve.by + c * curve.cy + d * curve.dy,
  }
}

export function sampleCubic(curve: Cubic, segments: number): Float64Array {
  const points = new Float64Array((segments + 1) * 2)
  for (let step = 0; step <= segments; step++) {
    const point = pointOnCubic(curve, step / segments)
    points[step * 2] = point.x
    points[step * 2 + 1] = point.y
  }
  return points
}

export function distanceToCubic(curve: Cubic, x: number, y: number, segments: number): number {
  const points = sampleCubic(curve, segments)
  let best = Number.POSITIVE_INFINITY
  for (let step = 0; step < segments; step++) {
    const ax = points[step * 2] ?? 0
    const ay = points[step * 2 + 1] ?? 0
    const vx = (points[step * 2 + 2] ?? 0) - ax
    const vy = (points[step * 2 + 3] ?? 0) - ay
    const squared = vx * vx + vy * vy
    const t = squared > 0 ? Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / squared)) : 0
    best = Math.min(best, Math.hypot(x - (ax + vx * t), y - (ay + vy * t)))
  }
  return best
}
