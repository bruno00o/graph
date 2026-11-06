import { describe, expect, it } from 'vitest'
import {
  detailStep,
  edgeOpacity,
  edgeShown,
  readMaxZoom,
  readMinZoom,
  ZoomRanges,
  zoomFade,
  zoomOpacity,
} from './zoom-range'

describe('zoomOpacity', () => {
  it('hides at and beyond the limits and fades in just inside them', () => {
    expect(zoomOpacity(1, Number.POSITIVE_INFINITY, 1)).toBe(0)
    expect(zoomOpacity(1, Number.POSITIVE_INFINITY, 0.5)).toBe(0)
    expect(zoomOpacity(1, Number.POSITIVE_INFINITY, 2 ** (zoomFade / 2))).toBeCloseTo(0.5)
    expect(zoomOpacity(1, Number.POSITIVE_INFINITY, 1.001 * 2 ** zoomFade)).toBe(1)
    expect(zoomOpacity(0, 4, 4)).toBe(0)
    expect(zoomOpacity(0, 4, 4 / 2 ** (zoomFade / 2))).toBeCloseTo(0.5)
    expect(zoomOpacity(0, 4, 2)).toBe(1)
    expect(zoomOpacity(0, Number.POSITIVE_INFINITY, 1e-6)).toBe(1)
  })

  it('reads limits, ignoring values that are not positive numbers', () => {
    expect(readMinZoom(0.5)).toBe(0.5)
    expect(readMinZoom(-1)).toBe(0)
    expect(readMinZoom(null)).toBe(0)
    expect(readMinZoom(Number.POSITIVE_INFINITY)).toBe(0)
    expect(readMaxZoom(2)).toBe(2)
    expect(readMaxZoom(0)).toBe(Number.POSITIVE_INFINITY)
    expect(readMaxZoom(undefined)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('ZoomRanges', () => {
  it('counts ranged elements and tells which are shown', () => {
    const ranges = new ZoomRanges()
    ranges.reserve(4)
    expect(ranges.shown(0, 0.1)).toBe(true)
    ranges.set(1, 0.5, Number.POSITIVE_INFINITY)
    ranges.set(2, 0, 2)
    expect(ranges.count).toBe(2)
    expect(ranges.shown(0, 0.1)).toBe(true)
    expect(ranges.shown(1, 0.5)).toBe(false)
    expect(ranges.shown(1, 0.6)).toBe(true)
    expect(ranges.shown(2, 2)).toBe(false)
    expect(ranges.opacity(1, 0.501 * 2 ** zoomFade)).toBe(1)
    ranges.clear(1)
    expect(ranges.count).toBe(1)
    expect(ranges.shown(1, 0.1)).toBe(true)
  })

  it('changes its step whenever a limit is crossed', () => {
    const ranges = new ZoomRanges()
    expect(ranges.step(1)).toBe(0)
    ranges.set(0, 0.5, 4)
    const steps = [0.25, 0.5, 1, 4, 8].map((zoom) => ranges.step(zoom))
    expect(new Set(steps).size).toBe(5)
    expect(ranges.step(1)).toBe(ranges.step(2))
  })

  it('tells when a limit lies within the fade of the zoom', () => {
    const ranges = new ZoomRanges()
    expect(ranges.fading(1)).toBe(false)
    ranges.set(0, 1, Number.POSITIVE_INFINITY)
    expect(ranges.fading(1.1)).toBe(true)
    expect(ranges.fading(0.9)).toBe(true)
    expect(ranges.fading(2)).toBe(false)
    expect(ranges.fading(0.5)).toBe(false)
  })

  it('falls back to coarse steps with many distinct limits', () => {
    const ranges = new ZoomRanges()
    for (let index = 0; index < 2000; index++) ranges.set(index, 1 + index / 1000, 1000)
    expect(ranges.fading(100)).toBe(true)
    expect(ranges.step(1)).not.toBe(ranges.step(2))
  })
})

describe('edges', () => {
  it('hides an edge while one of its ends is hidden', () => {
    const nodes = { zoom: new ZoomRanges() }
    const edges = {
      zoom: new ZoomRanges(),
      source: Uint32Array.of(0),
      target: Uint32Array.of(1),
    }
    expect(edgeShown(nodes, edges, 0, 0.1)).toBe(true)
    expect(edgeOpacity(nodes, edges, 0, 0.1)).toBe(1)
    nodes.zoom.set(1, 1, Number.POSITIVE_INFINITY)
    expect(edgeShown(nodes, edges, 0, 0.5)).toBe(false)
    expect(edgeShown(nodes, edges, 0, 2)).toBe(true)
    expect(edgeOpacity(nodes, edges, 0, 2 ** (zoomFade / 2))).toBeCloseTo(0.5)
    edges.zoom.set(0, 0, 1.5)
    expect(edgeShown(nodes, edges, 0, 2)).toBe(false)
    expect(detailStep(nodes, edges, 2)).not.toBe(detailStep(nodes, edges, 1.2))
  })
})
