import { degreesOf } from '../core/geo'
import type { GeoPoint, Key, Point } from '../types'
import type { GraphPositionEvent, PositionOrigin } from './events'

export interface PositionSurface {
  readonly name: string
  readonly onMap: boolean
}

export function positionEvent(
  origin: PositionOrigin,
  positions: ReadonlyMap<Key, Point>,
  surface: PositionSurface,
): GraphPositionEvent {
  if (!surface.onMap) return { origin, positions, surface: surface.name }
  const geo = new Map<Key, GeoPoint>()
  for (const [key, point] of positions) geo.set(key, degreesOf(point))
  return { origin, positions, geo, surface: surface.name }
}
