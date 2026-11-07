import { worldSize } from './geo'
import { type GlobeCamera, globeScreen, type ScreenPoint, sphereOf } from './globe'

export const arcStations = 17
export const arcThreshold = 0.5

const turn = Math.PI * 2
const radians = turn / worldSize
const start = new Float64Array(3)
const end = new Float64Array(3)

export interface ArcFrame {
  readonly x: number
  readonly y: number
  readonly zoom: number
  readonly width: number
  readonly height: number
  readonly globe: GlobeCamera | null
}

export function latitudeOf(y: number): number {
  return 2 * Math.atan(Math.exp(Math.PI - y * radians)) - Math.PI / 2
}

function mercatorY(latitude: number): number {
  const sine = Math.max(-0.9999999, Math.min(0.9999999, Math.sin(latitude)))
  return (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * worldSize
}

export function sideOf(globe: GlobeCamera, x: number, y: number): number {
  const p = sphereOf(x, y)
  const plane = globe.plane
  return (
    (plane[0] ?? 0) * (p[0] ?? 0) +
    (plane[1] ?? 0) * (p[1] ?? 0) +
    (plane[2] ?? 0) * (p[2] ?? 0) +
    (plane[3] ?? 0)
  )
}

function planeDot(plane: Float64Array, p: ArrayLike<number>): number {
  return (
    (plane[0] ?? 0) * (p[0] ?? 0) + (plane[1] ?? 0) * (p[1] ?? 0) + (plane[2] ?? 0) * (p[2] ?? 0)
  )
}

export function arcRise(globe: GlobeCamera, p: Float64Array, q: Float64Array): number {
  const plane = globe.plane
  const w = plane[3] ?? 0
  const best = Math.max(planeDot(plane, p) + w, planeDot(plane, q) + w)
  const c = Math.max(-1, Math.min(1, planeDot(q, p)))
  const tx = (q[0] ?? 0) - (p[0] ?? 0) * c
  const ty = (q[1] ?? 0) - (p[1] ?? 0) * c
  const tz = (q[2] ?? 0) - (p[2] ?? 0) * c
  const span = Math.hypot(tx, ty, tz)
  if (span < 1e-12) return best
  const x = planeDot(plane, p)
  const y = ((plane[0] ?? 0) * tx + (plane[1] ?? 0) * ty + (plane[2] ?? 0) * tz) / span
  const theta = Math.atan2(y, x)
  return theta > 0 && theta < Math.acos(c) ? Math.max(best, Math.hypot(x, y) + w) : best
}

export type EdgeRoute = 0 | 1 | 2

export function arcSpan(globe: GlobeCamera): number {
  const scale = globe.mix * globe.scale
  return scale > 0 ? Math.sqrt((8 * arcThreshold) / (scale * radians)) : Number.POSITIVE_INFINITY
}

export function edgeRoute(
  frame: ArcFrame,
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  geodesic: boolean,
): EdgeRoute {
  const globe = frame.globe && frame.globe.mix > 0 ? frame.globe : null
  if (!globe && !geodesic) return 0
  const deltaX = dx - ax
  if (geodesic && Math.abs(deltaX) > worldSize / 2) return 1
  const latitude = latitudeOf((ay + dy) / 2)
  const distance = Math.hypot(deltaX, dy - ay)
  if (globe && !geodesic && distance * Math.cos(latitude) <= arcSpan(globe)) return 0
  const length = distance * radians
  if (globe) {
    sphereOf(ax, ay, start)
    sphereOf(dx, dy, end)
    const w = globe.plane[3] ?? 0
    if (planeDot(globe.plane, start) + w < 0 || planeDot(globe.plane, end) + w < 0) {
      if (!geodesic && Math.abs(deltaX) > worldSize / 4) return 1
      const slack = geodesic ? 1e-4 : Math.abs(deltaX * radians) * length * 0.25 + 1e-4
      return arcRise(globe, start, end) + slack < 0 ? 2 : 1
    }
  }
  if (!geodesic) return 1
  let bulge =
    ((Math.abs(Math.sin(latitude)) * Math.abs(deltaX * radians) * length) / 8 / radians) *
    frame.zoom
  const span = length * Math.cos(latitude)
  if (globe) bulge += (globe.mix * globe.scale * span * span) / 8 / radians
  return bulge > arcThreshold ? 1 : 0
}

export function geodesicPoint(
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  u: number,
  out: ScreenPoint,
): ScreenPoint {
  const p = sphereOf(ax, ay, start)
  const q = sphereOf(dx, dy, end)
  const px = p[0] ?? 0
  const py = p[1] ?? 0
  const pz = p[2] ?? 0
  const qx = q[0] ?? 0
  const qy = q[1] ?? 0
  const qz = q[2] ?? 0
  const omega = Math.acos(Math.max(-1, Math.min(1, px * qx + py * qy + pz * qz)))
  const sine = Math.sin(omega)
  if (sine < 1e-9) {
    out.x = ax + (dx - ax) * u
    out.y = ay + (dy - ay) * u
    return out
  }
  const wa = Math.sin((1 - u) * omega) / sine
  const wd = Math.sin(u * omega) / sine
  const rx = px * wa + qx * wd
  const ry = py * wa + qy * wd
  const rz = pz * wa + qz * wd
  let shift = Math.atan2(rx, rz) - Math.atan2(px, pz)
  shift -= turn * Math.floor((shift + Math.PI) / turn)
  out.x = ax + shift / radians
  out.y = mercatorY(Math.asin(Math.max(-1, Math.min(1, ry))))
  return out
}

export function arcPoint(
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  u: number,
  bend: number,
  geodesic: boolean,
  out: ScreenPoint,
): ScreenPoint {
  if (geodesic && u > 0 && u < 1) geodesicPoint(ax, ay, dx, dy, u, out)
  else if (geodesic && u >= 1) geodesicPoint(ax, ay, dx, dy, 1, out)
  else {
    out.x = ax + (dx - ax) * u
    out.y = ay + (dy - ay) * u
  }
  if (bend !== 0) {
    const lift = bend * 4 * u * (1 - u)
    out.x -= (dy - ay) * lift
    out.y += (dx - ax) * lift
  }
  return out
}

export function arcPolyline(
  ax: number,
  ay: number,
  dx: number,
  dy: number,
  bend: number,
  geodesic: boolean,
  out: Float64Array,
): number {
  const point = { x: 0, y: 0 }
  for (let k = 0; k < arcStations; k++) {
    arcPoint(ax, ay, dx, dy, k / (arcStations - 1), bend, geodesic, point)
    out[k * 2] = point.x
    out[k * 2 + 1] = point.y
  }
  return arcStations
}

export function screenOf(frame: ArcFrame, x: number, y: number, out: ScreenPoint): number {
  if (frame.globe && frame.globe.mix > 0) return globeScreen(frame.globe, x, y, out)
  out.x = (x - frame.x) * frame.zoom + frame.width / 2
  out.y = (y - frame.y) * frame.zoom + frame.height / 2
  return 1
}
