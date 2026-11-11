import type { ShapeGeometry } from '@bruno00o/graph'
import { messages } from '../shared/messages'

export interface Zone {
  readonly id: string
  readonly label: string
  readonly tone: string
  readonly line: boolean
  readonly geometry: ShapeGeometry
}

type Ring = [number, number][]

function rectangle(west: number, south: number, east: number, north: number): Ring {
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ]
}

function blob(longitude: number, latitude: number, reach: number, points: number): Ring {
  const ring: Ring = []
  for (let k = 0; k < points; k++) {
    const angle = (k / points) * Math.PI * 2
    const swell = 0.8 + 0.2 * Math.sin(angle * 3 + longitude)
    ring.push([
      longitude + Math.cos(angle) * reach * swell,
      latitude + Math.sin(angle) * reach * swell * 0.7,
    ])
  }
  ring.push(ring[0] ?? [longitude, latitude])
  return ring
}

function featured(): Zone[] {
  const zone = (id: string, tone: string, geometry: ShapeGeometry): Zone => ({
    id,
    label: messages.zone(id),
    tone,
    line: 'type' in geometry && geometry.type === 'LineString',
    geometry,
  })
  return [
    zone('A', 'var(--graph-cat-1)', {
      type: 'Polygon',
      coordinates: [rectangle(-10, 36, 30, 58), rectangle(4, 44, 14, 50)],
    }),
    zone('B', 'var(--graph-cat-2)', {
      type: 'Polygon',
      coordinates: [rectangle(165, -25, -165, 5)],
    }),
    zone('C', 'var(--graph-cat-3)', {
      center: { longitude: -100, latitude: 45 },
      radius: 1_200_000,
      inner: 600_000,
    }),
    zone('D', 'var(--graph-cat-4)', {
      type: 'LineString',
      coordinates: [
        [140, 30],
        [170, 40],
        [-170, 42],
        [-140, 35],
      ],
    }),
    zone('E', 'var(--graph-cat-5)', {
      type: 'Polygon',
      coordinates: [blob(-60, -15, 18, 48)],
    }),
  ]
}

function grid(count: number): Zone[] {
  const side = Math.ceil(Math.sqrt(count))
  const west = -10
  const south = 35
  const step = 30 / side
  const zones: Zone[] = []
  for (let k = 0; k < count; k++) {
    const column = k % side
    const row = Math.floor(k / side)
    const longitude = west + (column + 0.5) * step * 1.6
    const latitude = south + (row + 0.5) * step
    zones.push({
      id: `g${k}`,
      label: messages.zone(String(k + 1)),
      tone: `var(--graph-cat-${(k % 8) + 1})`,
      line: false,
      geometry: { type: 'Polygon', coordinates: [blob(longitude, latitude, step * 0.6, 49)] },
    })
  }
  return zones
}

export function createZones(count: number): Zone[] {
  return count > 0 ? grid(count) : featured()
}
