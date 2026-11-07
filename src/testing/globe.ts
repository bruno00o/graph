import { geoToWorld } from '../core/geo'
import { createGlobeCamera, type GlobeCamera } from '../core/globe'

export interface GlobeShot {
  readonly longitude: number
  readonly latitude: number
  readonly zoom: number
  readonly width: number
  readonly height: number
  readonly distance?: number
  readonly mix?: number
}

export interface GlobeMatrices {
  readonly matrix: Float64Array
  readonly plane: Float64Array
  readonly fallback: Float64Array
}

export function globeMatrices(shot: GlobeShot): GlobeMatrices {
  const distance = shot.distance ?? 3
  const lambda = (shot.longitude * Math.PI) / 180
  const phi = (shot.latitude * Math.PI) / 180
  const center = [Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda)]
  const east = [Math.cos(lambda), 0, -Math.sin(lambda)]
  const north = [
    -Math.sin(phi) * Math.sin(lambda),
    Math.cos(phi),
    -Math.sin(phi) * Math.cos(lambda),
  ]
  const scale = 2 ** shot.zoom * 512
  const focal = (scale * (distance - 1)) / (2 * Math.PI * Math.cos(phi))
  const sx = (2 * focal) / shot.width
  const sy = (2 * focal) / shot.height
  const near = 0.1
  const far = 10
  const depthOffset = -2 / (1 / near - 1 / far)
  const depthScale = 1 - depthOffset / far
  const matrix = new Float64Array(16)
  for (let axis = 0; axis < 3; axis++) {
    matrix[axis * 4] = sx * (east[axis] ?? 0)
    matrix[axis * 4 + 1] = sy * (north[axis] ?? 0)
    matrix[axis * 4 + 2] = -depthScale * (center[axis] ?? 0)
    matrix[axis * 4 + 3] = -(center[axis] ?? 0)
  }
  matrix[14] = depthScale * distance + depthOffset
  matrix[15] = distance
  const plane = Float64Array.from([...center, -1 / distance])
  const fallback = new Float64Array(16)
  fallback[15] = distance - 1
  return { matrix, plane, fallback }
}

export function globeCamera(shot: GlobeShot): GlobeCamera {
  const { matrix, plane, fallback } = globeMatrices(shot)
  const world = geoToWorld({ longitude: shot.longitude, latitude: shot.latitude })
  return createGlobeCamera({
    matrix,
    plane,
    mix: shot.mix ?? 1,
    depth: fallback[15] ?? 1,
    view: { x: world.x, y: world.y, zoom: 2 ** shot.zoom },
    width: shot.width,
    height: shot.height,
  })
}
