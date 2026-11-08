import type { GeoPoint, LineGeometry, LineWaypointsOptions } from './types'

function place(position: readonly number[] | undefined): GeoPoint | null {
  const longitude = position?.[0]
  const latitude = position?.[1]
  if (typeof longitude !== 'number' || typeof latitude !== 'number') return null
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  return { longitude, latitude }
}

function linesOf(geometry: LineGeometry): readonly (readonly (readonly number[])[])[] {
  if (geometry.type === 'LineString') return [geometry.coordinates]
  if (geometry.type === 'MultiLineString') return geometry.coordinates
  return []
}

/**
 * Reads the positions of a GeoJSON `LineString` or `MultiLineString` geometry as waypoints, in
 * order, the lines of a `MultiLineString` one after the other. Invalid positions are skipped. The
 * first and last positions are dropped unless `keepEnds` is set, since they usually sit on the end
 * nodes.
 */
export function lineWaypoints(
  geometry: LineGeometry | null | undefined,
  options: LineWaypointsOptions = {},
): GeoPoint[] {
  const points: GeoPoint[] = []
  if (!geometry || !Array.isArray(geometry.coordinates)) return points
  for (const line of linesOf(geometry)) {
    if (!Array.isArray(line)) continue
    for (const position of line) {
      const point = Array.isArray(position) ? place(position) : null
      if (!point) continue
      const last = points[points.length - 1]
      if (last && last.longitude === point.longitude && last.latitude === point.latitude) continue
      points.push(point)
    }
  }
  if (options.keepEnds === true) return points
  return points.length > 2 ? points.slice(1, -1) : []
}
