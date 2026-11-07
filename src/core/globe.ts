import type { Point, View } from '../types'
import { worldSize } from './geo'

export interface GlobeCamera {
  readonly matrix: Float64Array
  readonly inverse: Float64Array
  readonly plane: Float64Array
  readonly mix: number
  readonly depth: number
  readonly scale: number
  readonly view: View
  readonly width: number
  readonly height: number
}

export interface GlobeInput {
  readonly matrix: ArrayLike<number>
  readonly plane: ArrayLike<number>
  readonly mix: number
  readonly depth: number
  readonly view: View
  readonly width: number
  readonly height: number
}

export interface ScreenPoint {
  x: number
  y: number
}

const turn = Math.PI * 2
const sphere = new Float64Array(3)

export function sphereOf(x: number, y: number, out: Float64Array = sphere): Float64Array {
  const longitude = (x / worldSize) * turn - Math.PI
  const latitude = 2 * Math.atan(Math.exp(Math.PI - (y / worldSize) * turn)) - Math.PI / 2
  const ring = Math.cos(latitude)
  out[0] = ring * Math.sin(longitude)
  out[1] = Math.sin(latitude)
  out[2] = ring * Math.cos(longitude)
  return out
}

export function worldOfSphere(px: number, py: number, pz: number, out: ScreenPoint): ScreenPoint {
  const longitude = Math.atan2(px, pz)
  const latitude = Math.asin(Math.max(-1, Math.min(1, py)))
  out.x = ((longitude + Math.PI) / turn) * worldSize
  const sine = Math.sin(latitude)
  const limited = Math.max(-0.9999999999, Math.min(0.9999999999, sine))
  out.y = (0.5 - Math.log((1 + limited) / (1 - limited)) / (4 * Math.PI)) * worldSize
  return out
}

function invert(m: Float64Array): Float64Array {
  const out = new Float64Array(16)
  const [a00 = 0, a01 = 0, a02 = 0, a03 = 0, a10 = 0, a11 = 0, a12 = 0, a13 = 0] = m
  const [a20 = 0, a21 = 0, a22 = 0, a23 = 0, a30 = 0, a31 = 0, a32 = 0, a33 = 0] = m.subarray(8)
  const b00 = a00 * a11 - a01 * a10
  const b01 = a00 * a12 - a02 * a10
  const b02 = a00 * a13 - a03 * a10
  const b03 = a01 * a12 - a02 * a11
  const b04 = a01 * a13 - a03 * a11
  const b05 = a02 * a13 - a03 * a12
  const b06 = a20 * a31 - a21 * a30
  const b07 = a20 * a32 - a22 * a30
  const b08 = a20 * a33 - a23 * a30
  const b09 = a21 * a32 - a22 * a31
  const b10 = a21 * a33 - a23 * a31
  const b11 = a22 * a33 - a23 * a32
  const determinant = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  if (determinant === 0) return out
  const d = 1 / determinant
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d
  return out
}

function clipOf(matrix: Float64Array, row: number, px: number, py: number, pz: number): number {
  return (
    (matrix[row] ?? 0) * px +
    (matrix[4 + row] ?? 0) * py +
    (matrix[8 + row] ?? 0) * pz +
    (matrix[12 + row] ?? 0)
  )
}

function project(
  camera: Omit<GlobeCamera, 'scale' | 'inverse'>,
  mix: number,
  x: number,
  y: number,
  out: ScreenPoint,
): number {
  const { matrix, plane, view, width, height, depth } = camera
  const p = sphereOf(x, y)
  const px = p[0] ?? 0
  const py = p[1] ?? 0
  const pz = p[2] ?? 0
  const flatX = (x - view.x) * view.zoom + width / 2
  const flatY = (y - view.y) * view.zoom + height / 2
  const keep = 1 - mix
  const cx = ((flatX / width) * 2 - 1) * depth * keep + clipOf(matrix, 0, px, py, pz) * mix
  const cy = (1 - (flatY / height) * 2) * depth * keep + clipOf(matrix, 1, px, py, pz) * mix
  const cw = depth * keep + clipOf(matrix, 3, px, py, pz) * mix
  out.x = ((cx / cw + 1) / 2) * width
  out.y = ((1 - cy / cw) / 2) * height
  return (plane[0] ?? 0) * px + (plane[1] ?? 0) * py + (plane[2] ?? 0) * pz + (plane[3] ?? 0)
}

export function createGlobeCamera(input: GlobeInput): GlobeCamera {
  const matrix = Float64Array.from(input.matrix)
  const plane = Float64Array.from(input.plane)
  const base = { ...input, matrix, plane }
  const step = 1e-3 / Math.max(1, input.view.zoom)
  const here = { x: 0, y: 0 }
  const there = { x: 0, y: 0 }
  project(base, 1, input.view.x, input.view.y, here)
  project(base, 1, input.view.x + step, input.view.y, there)
  const latitude =
    2 * Math.atan(Math.exp(Math.PI - (input.view.y / worldSize) * turn)) - Math.PI / 2
  const local = Math.hypot(there.x - here.x, there.y - here.y) / step
  const scale = local / Math.max(Math.cos(latitude), 1e-6)
  return {
    ...base,
    inverse: invert(matrix),
    scale: Number.isFinite(scale) ? scale : input.view.zoom,
  }
}

export function globeScreen(camera: GlobeCamera, x: number, y: number, out: ScreenPoint): number {
  return project(camera, camera.mix, x, y, out)
}

export function globeScale(camera: GlobeCamera, y: number): number {
  const latitude = 2 * Math.atan(Math.exp(Math.PI - (y / worldSize) * turn)) - Math.PI / 2
  const zoom = camera.view.zoom
  return zoom + (camera.scale * Math.cos(latitude) - zoom) * camera.mix
}

function unprojectSphere(camera: GlobeCamera, sx: number, sy: number): Point | null {
  const { inverse, width, height } = camera
  const nx = (sx / width) * 2 - 1
  const ny = 1 - (sy / height) * 2
  const point = (z: number): [number, number, number] => {
    const w = clipOf(inverse, 3, nx, ny, z)
    return [
      clipOf(inverse, 0, nx, ny, z) / w,
      clipOf(inverse, 1, nx, ny, z) / w,
      clipOf(inverse, 2, nx, ny, z) / w,
    ]
  }
  const [ox, oy, oz] = point(-1)
  const [fx, fy, fz] = point(1)
  const dx = fx - ox
  const dy = fy - oy
  const dz = fz - oz
  const a = dx * dx + dy * dy + dz * dz
  const b = 2 * (ox * dx + oy * dy + oz * dz)
  const c = ox * ox + oy * oy + oz * oz - 1
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0 || a === 0) return null
  const t = (-b - Math.sqrt(discriminant)) / (2 * a)
  return worldOfSphere(ox + dx * t, oy + dy * t, oz + dz * t, { x: 0, y: 0 })
}

export function globeWorld(camera: GlobeCamera, sx: number, sy: number): Point | null {
  const { view, width, height, mix } = camera
  let guess: ScreenPoint | null =
    mix > 0.5
      ? unprojectSphere(camera, sx, sy)
      : { x: (sx - width / 2) / view.zoom + view.x, y: (sy - height / 2) / view.zoom + view.y }
  if (!guess) return null
  if (mix >= 1) return guess
  const at = { x: 0, y: 0 }
  const across = { x: 0, y: 0 }
  const down = { x: 0, y: 0 }
  const step = 0.5 / view.zoom
  for (let round = 0; round < 3 && guess; round++) {
    project(camera, mix, guess.x, guess.y, at)
    const ex = sx - at.x
    const ey = sy - at.y
    if (Math.abs(ex) + Math.abs(ey) < 1e-3) break
    project(camera, mix, guess.x + step, guess.y, across)
    project(camera, mix, guess.x, guess.y + step, down)
    const j00 = (across.x - at.x) / step
    const j10 = (across.y - at.y) / step
    const j01 = (down.x - at.x) / step
    const j11 = (down.y - at.y) / step
    const determinant = j00 * j11 - j01 * j10
    if (determinant === 0) break
    guess = {
      x: guess.x + (j11 * ex - j01 * ey) / determinant,
      y: guess.y + (j00 * ey - j10 * ex) / determinant,
    }
  }
  return guess
}
