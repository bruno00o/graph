import type { GeoPoint, Point } from '../types'

export const worldSize = 512
export const latitudeLimit = 85.0511287798066

const degrees = Math.PI / 180

export function projectLongitude(longitude: number): number {
  return ((longitude + 180) / 360) * worldSize
}

export function projectLatitude(latitude: number): number {
  const clamped = Math.max(-latitudeLimit, Math.min(latitudeLimit, latitude))
  const sine = Math.sin(clamped * degrees)
  return (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * worldSize
}

/**
 * Projects a longitude and a latitude, in degrees, to world units with Web Mercator: the world
 * spans 512 units, from longitude -180 at x 0 and latitude 85.05 at y 0.
 */
export function geoToWorld(point: GeoPoint): Point {
  return { x: projectLongitude(point.longitude), y: projectLatitude(point.latitude) }
}

/** Turns a point in world units back into a longitude and a latitude, in degrees. */
export function worldToGeo(point: Point): GeoPoint {
  const longitude = (point.x / worldSize) * 360 - 180
  const n = Math.PI * (1 - (2 * point.y) / worldSize)
  return { longitude, latitude: Math.atan(Math.sinh(n)) / degrees }
}
