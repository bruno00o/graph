import { describe, expect, it } from 'vitest'
import { gridLevels } from './background-grid'

const viewport = { width: 800, height: 600 }

describe('gridLevels', () => {
  it('draws the spacing at zoom 1, with coarser levels every fourth line', () => {
    const levels = gridLevels(16, { x: 0, y: 0, zoom: 1 }, viewport)
    expect(levels.map((level) => level.pitch)).toEqual([16, 64, 256])
    expect(levels.map((level) => level.weight)).toEqual([1, 2, 2])
    expect(levels[0]).toMatchObject({ offsetX: 0, offsetY: 12 })
  })

  it('keeps the finest pitch between 4 and 16 pixels and fades it in', () => {
    for (const zoom of [0.01, 0.3, 0.7, 2, 5, 40]) {
      const [finest] = gridLevels(16, { x: 0, y: 0, zoom }, viewport)
      expect(finest?.pitch).toBeGreaterThan(4)
      expect(finest?.pitch).toBeLessThanOrEqual(16 + 1e-9)
      expect(finest?.weight).toBeGreaterThan(0)
      expect(finest?.weight).toBeLessThanOrEqual(1 + 1e-9)
    }
    const [zoomedIn] = gridLevels(16, { x: 0, y: 0, zoom: 2 }, viewport)
    expect(zoomedIn?.pitch).toBe(8)
    expect(zoomedIn?.weight).toBeCloseTo(0.5)
  })

  it('places lines on world multiples of the level spacing', () => {
    const view = { x: 1_000_003.25, y: -7, zoom: 3 }
    for (const level of gridLevels(10, view, viewport)) {
      const world = (level.offsetX - viewport.width / 2) / view.zoom + view.x
      const spacing = level.pitch / view.zoom
      const remainder = Math.abs(world / spacing - Math.round(world / spacing))
      expect(remainder).toBeLessThan(1e-6)
    }
  })
})
