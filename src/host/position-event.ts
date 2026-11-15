import { degreesOf } from '../core/geo'
import type { GeoPoint, Key, Point } from '../types'
import type { GraphPositionEvent, PositionOrigin } from './events'

export function positionEvent(
  origin: PositionOrigin,
  positions: ReadonlyMap<Key, Point>,
  onMap: boolean,
): GraphPositionEvent {
  if (!onMap) return { origin, positions }
  const geo = new Map<Key, GeoPoint>()
  for (const [key, point] of positions) geo.set(key, degreesOf(point))
  return { origin, positions, geo }
}
