import { describe, expect, it } from 'vitest'
import { globeCamera } from '../testing/globe'
import { geoToWorld, worldSize, worldToGeo } from './geo'
import {
  type ArcFrame,
  arcPoint,
  arcPolyline,
  arcStations,
  edgeRoute,
  geodesicPoint,
  latitudeOf,
} from './geo-arc'

const london = geoToWorld({ longitude: -0.13, latitude: 51.51 })
const newYork = geoToWorld({ longitude: -74, latitude: 40.71 })
const tokyo = geoToWorld({ longitude: 139.69, latitude: 35.69 })
const sanFrancisco = geoToWorld({ longitude: -122.42, latitude: 37.77 })

function flat(zoom: number): ArcFrame {
  return { x: 256, y: 256, zoom, width: 800, height: 600, globe: null }
}

describe('great circles', () => {
  it('bends toward the pole between two places of the same hemisphere', () => {
    const middle = geodesicPoint(london.x, london.y, newYork.x, newYork.y, 0.5, { x: 0, y: 0 })
    const geo = worldToGeo(middle)
    expect(geo.latitude).toBeCloseTo(52.37, 1)
    expect(geo.longitude).toBeCloseTo(-41.29, 1)
    expect(latitudeOf(middle.y)).toBeCloseTo((geo.latitude * Math.PI) / 180, 9)
  })

  it('keeps the ends exact and crosses the antimeridian by the short way', () => {
    const out = { x: 0, y: 0 }
    arcPoint(tokyo.x, tokyo.y, sanFrancisco.x, sanFrancisco.y, 0, 0, true, out)
    expect(out).toEqual(tokyo)
    arcPoint(tokyo.x, tokyo.y, sanFrancisco.x, sanFrancisco.y, 1, 0, true, out)
    expect(out.x).toBeCloseTo(sanFrancisco.x + worldSize, 9)
    expect(out.y).toBeCloseTo(sanFrancisco.y, 9)
    arcPoint(tokyo.x, tokyo.y, sanFrancisco.x, sanFrancisco.y, 0.5, 0, true, out)
    expect(out.x).toBeGreaterThan(worldSize * 0.75)
    expect(worldToGeo(out).latitude).toBeGreaterThan(45)
  })

  it('samples a polyline of every station', () => {
    const points = new Float64Array(arcStations * 2)
    expect(arcPolyline(london.x, london.y, newYork.x, newYork.y, 0, true, points)).toBe(arcStations)
    expect(points[0]).toBe(london.x)
    expect(points[(arcStations - 1) * 2]).toBeCloseTo(newYork.x, 9)
  })
})

describe('edge routes', () => {
  it('draws straight edges straight on the flat map', () => {
    expect(edgeRoute(flat(4), london.x, london.y, newYork.x, newYork.y, false)).toBe(0)
  })

  it('bends great circles once the bend shows', () => {
    const near = geoToWorld({ longitude: 0.5, latitude: 51.6 })
    expect(edgeRoute(flat(4), london.x, london.y, near.x, near.y, true)).toBe(0)
    expect(edgeRoute(flat(4), london.x, london.y, newYork.x, newYork.y, true)).toBe(1)
    expect(edgeRoute(flat(0.5), tokyo.x, tokyo.y, sanFrancisco.x, sanFrancisco.y, true)).toBe(1)
  })

  it('hides edges behind the globe and bends long ones in front', () => {
    const camera = globeCamera({ longitude: 0, latitude: 45, zoom: 2, width: 800, height: 600 })
    const frame: ArcFrame = { ...flat(4), globe: camera }
    const paris = geoToWorld({ longitude: 2.35, latitude: 48.86 })
    const brussels = geoToWorld({ longitude: 4.35, latitude: 50.85 })
    const sydney = geoToWorld({ longitude: 151.2, latitude: -33.87 })
    const auckland = geoToWorld({ longitude: 174.76, latitude: -36.85 })
    expect(edgeRoute(frame, paris.x, paris.y, brussels.x, brussels.y, false)).toBe(0)
    expect(edgeRoute(frame, london.x, london.y, newYork.x, newYork.y, false)).toBe(1)
    expect(edgeRoute(frame, sydney.x, sydney.y, auckland.x, auckland.y, true)).toBe(2)
    expect(edgeRoute(frame, paris.x, paris.y, sydney.x, sydney.y, true)).toBe(1)
  })
})
