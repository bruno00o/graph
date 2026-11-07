import { describe, expect, it } from 'vitest'
import { globeCamera } from '../testing/globe'
import { geoToWorld } from './geo'
import { sideOf } from './geo-arc'
import { globeScale, globeScreen, globeWorld, sphereOf, worldOfSphere } from './globe'

const shot = { longitude: 10, latitude: 40, zoom: 2, width: 800, height: 600 }

describe('globe camera', () => {
  it('maps the world to the unit sphere and back', () => {
    const world = geoToWorld({ longitude: -73.9, latitude: 40.7 })
    const p = sphereOf(world.x, world.y)
    expect(Math.hypot(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0)).toBeCloseTo(1, 12)
    const back = worldOfSphere(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, { x: 0, y: 0 })
    expect(back.x).toBeCloseTo(world.x, 9)
    expect(back.y).toBeCloseTo(world.y, 9)
  })

  it('puts the view center in the middle, at the scale of the flat map', () => {
    const camera = globeCamera(shot)
    const center = geoToWorld({ longitude: 10, latitude: 40 })
    const out = { x: 0, y: 0 }
    expect(globeScreen(camera, center.x, center.y, out)).toBeGreaterThan(0)
    expect(out.x).toBeCloseTo(400, 6)
    expect(out.y).toBeCloseTo(300, 6)
    expect(globeScale(camera, center.y)).toBeCloseTo(4, 3)
  })

  it('converts screen points back to the world on the near side', () => {
    const camera = globeCamera(shot)
    const world = geoToWorld({ longitude: 30, latitude: 20 })
    const out = { x: 0, y: 0 }
    globeScreen(camera, world.x, world.y, out)
    const back = globeWorld(camera, out.x, out.y)
    expect(back?.x).toBeCloseTo(world.x, 6)
    expect(back?.y).toBeCloseTo(world.y, 6)
    expect(globeWorld(camera, 5, 5)).toBeNull()
  })

  it('tells the far side from the near side', () => {
    const camera = globeCamera(shot)
    const near = geoToWorld({ longitude: 20, latitude: 45 })
    const far = geoToWorld({ longitude: -170, latitude: -40 })
    expect(sideOf(camera, near.x, near.y)).toBeGreaterThan(0)
    expect(sideOf(camera, far.x, far.y)).toBeLessThan(0)
  })

  it('blends with the flat map during the transition', () => {
    const camera = globeCamera({ ...shot, zoom: 6, mix: 0.4 })
    const world = geoToWorld({ longitude: 12, latitude: 41 })
    const out = { x: 0, y: 0 }
    globeScreen(camera, world.x, world.y, out)
    const back = globeWorld(camera, out.x, out.y)
    expect(back?.x).toBeCloseTo(world.x, 5)
    expect(back?.y).toBeCloseTo(world.y, 5)
  })
})
