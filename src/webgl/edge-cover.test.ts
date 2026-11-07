import { describe, expect, it } from 'vitest'
import { EdgeCover, layerCap } from './edge-cover'

describe('layerCap', () => {
  it('stops counting layers once the pixel is covered', () => {
    expect(layerCap(1)).toBe(32)
    expect(layerCap(0.5)).toBe(32)
    expect(layerCap(0.1)).toBe(79)
    expect((1 - 0.1) ** layerCap(0.1)).toBeLessThan(1 / 4096)
    expect(layerCap(0.03)).toBe(0)
    expect(layerCap(0)).toBe(0)
  })
})

describe('EdgeCover', () => {
  it('tracks the faintest live edge', () => {
    const cover = new EdgeCover()
    expect(cover.lowest()).toBe(1)
    cover.setPalette(Uint8Array.of(0, 0, 0, 255, 0, 0, 0, 51), 2)
    cover.set(0, true, 1, 0)
    expect(cover.lowest()).toBe(1)
    cover.set(1, true, 0.5, 1)
    expect(cover.lowest()).toBeCloseTo(25 / 255)
    cover.set(1, false, 0.5, 1)
    expect(cover.lowest()).toBe(1)
    cover.set(2, true, 1, 0, 1)
    expect(cover.lowest()).toBeCloseTo(51 / 255)
  })
})
