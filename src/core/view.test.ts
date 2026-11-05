import { describe, expect, it } from 'vitest'
import {
  fitBounds,
  interpolateView,
  panBy,
  toScreen,
  toWorld,
  wheelFactor,
  zoomAround,
} from './view'

const viewport = { width: 800, height: 600 }

describe('view', () => {
  it('converts between world and screen', () => {
    const view = { x: 10, y: -20, zoom: 2 }
    expect(toScreen(view, viewport, { x: 10, y: -20 })).toEqual({ x: 400, y: 300 })
    expect(toWorld(view, viewport, toScreen(view, viewport, { x: 3, y: 4 }))).toEqual({
      x: 3,
      y: 4,
    })
  })

  it('keeps the anchor still while zooming', () => {
    const view = { x: 0, y: 0, zoom: 1 }
    const anchor = { x: 100, y: 50 }
    const before = toWorld(view, viewport, anchor)
    const next = zoomAround(view, viewport, anchor, 3)
    expect(next.zoom).toBe(3)
    const after = toWorld(next, viewport, anchor)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('clamps zoom', () => {
    expect(zoomAround({ x: 0, y: 0, zoom: 1 }, viewport, { x: 0, y: 0 }, 1e9).zoom).toBe(64)
  })

  it('pans by screen pixels', () => {
    expect(panBy({ x: 0, y: 0, zoom: 2 }, 10, -20)).toEqual({ x: -5, y: 10, zoom: 2 })
  })

  it('fits bounds inside the padded viewport', () => {
    const view = fitBounds({ minX: 0, minY: 0, maxX: 200, maxY: 100 }, viewport, 100)
    expect(view).toEqual({ x: 100, y: 50, zoom: 3 })
  })

  it('normalizes wheel deltas', () => {
    expect(wheelFactor(100, 0, 600, 1)).toBeLessThan(1)
    expect(wheelFactor(-100, 0, 600, 1)).toBeGreaterThan(1)
    expect(wheelFactor(3, 1, 600, 1)).toBeCloseTo(wheelFactor(48, 0, 600, 1))
    expect(wheelFactor(10_000, 0, 600, 1)).toBeCloseTo(wheelFactor(120, 0, 600, 1))
  })

  it('interpolates zoom geometrically', () => {
    const view = interpolateView({ x: 0, y: 0, zoom: 1 }, { x: 10, y: 20, zoom: 4 }, 0.5)
    expect(view).toEqual({ x: 5, y: 10, zoom: 2 })
  })
})
