import { geoToWorld, type View, worldToGeo } from '@bruno00o/graph'
import type { Center } from './data'

export const scale = 16

export function toPlain(view: View, center: Center): View {
  const origin = geoToWorld(center)
  return {
    x: (view.x - origin.x) * scale,
    y: (view.y - origin.y) * scale,
    zoom: view.zoom / scale,
  }
}

export function toMap(view: View, center: Center): View {
  const origin = geoToWorld(center)
  return {
    x: view.x / scale + origin.x,
    y: view.y / scale + origin.y,
    zoom: view.zoom * scale,
  }
}

export function mapCamera(view: View): { center: [number, number]; zoom: number } {
  const point = worldToGeo({ x: view.x, y: view.y })
  return { center: [point.longitude, point.latitude], zoom: Math.log2(view.zoom) }
}
