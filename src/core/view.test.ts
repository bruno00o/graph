import { describe, expect, it } from 'vitest'
import {
  constrainView,
  edgePush,
  fitBounds,
  interpolateView,
  panBy,
  toScreen,
  toWorld,
  wheelFactor,
  wheelPixels,
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
    const limits = { minZoom: 0.5, maxZoom: 2 }
    expect(zoomAround({ x: 0, y: 0, zoom: 1 }, viewport, { x: 0, y: 0 }, 0.1, limits).zoom).toBe(
      0.5,
    )
  })

  it('pans by screen pixels', () => {
    expect(panBy({ x: 0, y: 0, zoom: 2 }, 10, -20)).toEqual({ x: -5, y: 10, zoom: 2 })
  })

  it('fits bounds inside the padded viewport', () => {
    const sides = { top: 100, right: 100, bottom: 100, left: 100 }
    const view = fitBounds({ minX: 0, minY: 0, maxX: 200, maxY: 100 }, viewport, sides)
    expect(view).toEqual({ x: 100, y: 50, zoom: 3 })
  })

  it('centers bounds in the area left by uneven padding', () => {
    const sides = { top: 0, right: 400, bottom: 0, left: 0 }
    const view = fitBounds({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, viewport, sides)
    const center = toScreen(view, viewport, { x: 50, y: 50 })
    expect(center.x).toBeCloseTo((viewport.width - 400) / 2)
    expect(center.y).toBeCloseTo(viewport.height / 2)
  })

  it('normalizes wheel deltas', () => {
    expect(wheelFactor(100, 0, 600, 1)).toBeLessThan(1)
    expect(wheelFactor(-100, 0, 600, 1)).toBeGreaterThan(1)
    expect(wheelFactor(3, 1, 600, 1)).toBeCloseTo(wheelFactor(48, 0, 600, 1))
    expect(wheelFactor(10_000, 0, 600, 1)).toBeCloseTo(wheelFactor(120, 0, 600, 1))
  })

  it('zooms faster on a pinch, within the same step as a wheel notch', () => {
    expect(wheelFactor(-5, 0, 600, 1, true)).toBeCloseTo(Math.exp(0.05))
    expect(wheelFactor(-5, 0, 600, 1, true)).toBeGreaterThan(wheelFactor(-5, 0, 600, 1))
    expect(wheelFactor(100, 0, 600, 1, true)).toBeCloseTo(wheelFactor(120, 0, 600, 1))
    expect(wheelFactor(-4, 0, 600, 2, true)).toBeCloseTo(wheelFactor(-8, 0, 600, 1, true))
  })

  it('converts wheel deltas to pixels', () => {
    expect(wheelPixels(3, 1, 600)).toBe(48)
    expect(wheelPixels(1, 2, 600)).toBe(600)
    expect(wheelPixels(12.5, 0, 600)).toBe(12.5)
  })

  it('clamps the zoom and keeps the view inside its bounds', () => {
    const limits = { minZoom: 0.5, maxZoom: 2 }
    const box = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 }
    const view = { x: 500, y: 500, zoom: 1 }
    expect(constrainView(view, viewport, limits, null)).toBe(view)
    expect(constrainView({ x: 0, y: 0, zoom: 8 }, viewport, limits, null)).toEqual({
      x: 0,
      y: 0,
      zoom: 2,
    })
    expect(
      constrainView({ x: -50, y: 2000, zoom: 1 }, viewport, limits, { box, margin: 0 }),
    ).toEqual({ x: 400, y: 700, zoom: 1 })
  })

  it('keeps a narrow area inside the view instead', () => {
    const limits = { minZoom: 0.01, maxZoom: 10 }
    const box = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    const free = { x: 30, y: 60, zoom: 1 }
    expect(constrainView(free, viewport, limits, { box, margin: 0 })).toBe(free)
    expect(
      constrainView({ x: 1000, y: -1000, zoom: 1 }, viewport, limits, { box, margin: 0 }),
    ).toEqual({ x: 400, y: -200, zoom: 1 })
  })

  it('grows the area by a margin in screen pixels', () => {
    const limits = { minZoom: 0.01, maxZoom: 10 }
    const box = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 }
    expect(constrainView({ x: 0, y: 0, zoom: 2 }, viewport, limits, { box, margin: 40 })).toEqual({
      x: 180,
      y: 130,
      zoom: 2,
    })
  })

  it('pushes harder closer to an edge', () => {
    expect(edgePush(400, 800, 40)).toBe(0)
    expect(edgePush(40, 800, 40)).toBe(0)
    expect(edgePush(20, 800, 40)).toBeCloseTo(-0.5)
    expect(edgePush(0, 800, 40)).toBe(-1)
    expect(edgePush(-300, 800, 40)).toBe(-1)
    expect(edgePush(790, 800, 40)).toBeCloseTo(0.75)
    expect(edgePush(30, 100, 40)).toBe(0)
    expect(edgePush(0, 0, 40)).toBe(0)
  })

  it('interpolates zoom geometrically', () => {
    const view = interpolateView({ x: 0, y: 0, zoom: 1 }, { x: 10, y: 20, zoom: 4 }, 0.5)
    expect(view).toEqual({ x: 5, y: 10, zoom: 2 })
  })
})
