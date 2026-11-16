import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { shapes } from '../shapes'
import type { ShapeGeometry, WidthScale } from '../types'
import { drawnWidth, leastWidth, WidthFloors, widthSlots } from './width-scale'

describe('drawnWidth', () => {
  it('keeps the width in screen pixels without a floor', () => {
    expect(drawnWidth(4, -1, 0.1)).toBe(4)
    expect(drawnWidth(4, -1, 10)).toBe(4)
  })

  it('multiplies the width by the zoom below 1, down to the floor', () => {
    expect(drawnWidth(4, 0.75, 1)).toBe(4)
    expect(drawnWidth(4, 0.75, 8)).toBe(4)
    expect(drawnWidth(4, 0.75, 0.5)).toBe(2)
    expect(drawnWidth(4, 0.75, 0.1)).toBe(0.75)
    expect(drawnWidth(4, 0, 0.1)).toBeCloseTo(0.4, 10)
  })

  it('never widens a line narrower than the floor', () => {
    expect(drawnWidth(0.5, 0.75, 0.1)).toBe(0.5)
    expect(drawnWidth(0.5, 0.75, 1)).toBe(0.5)
    expect(drawnWidth(0, 0.75, 0.1)).toBe(0)
  })
})

describe('leastWidth', () => {
  it('reads the floor of a shrinking mark only', () => {
    expect(leastWidth({})).toBe(-1)
    expect(leastWidth({ widthScale: 'screen', minWidth: 2 })).toBe(-1)
    expect(leastWidth({ widthScale: 'shrink' })).toBe(0.75)
    expect(leastWidth({ widthScale: 'shrink', minWidth: 2 })).toBe(2)
  })
})

describe('WidthFloors', () => {
  it('counts a version only when a floor changes', () => {
    const floors = new WidthFloors()
    expect(floors.shrinks).toBe(false)
    expect(floors.set([-1, -1])).toBe(false)
    expect(floors.version).toBe(0)
    expect(floors.set([-1, 1])).toBe(true)
    expect([floors.version, floors.shrinks, floors.at(1)]).toEqual([1, true, 1])
    expect(floors.set([-1, 1])).toBe(false)
    expect(floors.drawn(4, 1, 0.5)).toBe(2)
    expect(floors.drawn(4, 0, 0.5)).toBe(4)
    expect(floors.drawn(4, widthSlots, 0.5)).toBe(4)
    expect(floors.set([])).toBe(true)
    expect([floors.version, floors.shrinks, floors.at(1)]).toEqual([2, false, -1])
  })
})

describe('widthScale options', () => {
  it('refuses an unknown scale and a floor that is not a finite number of 0 or more', () => {
    const link = { id: 'ab', from: 'a', to: 'b' }
    const zones: { id: string; geometry: ShapeGeometry }[] = []
    const unknown = 'world' as unknown as WidthScale
    expect(() => edges([link], { source: 'from', target: 'to', widthScale: unknown })).toThrow(
      new TypeError("edges: widthScale must be 'screen' or 'shrink'"),
    )
    for (const minWidth of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => edges([link], { source: 'from', target: 'to', minWidth })).toThrow(
        new RangeError('edges: minWidth must be a finite number, 0 or more'),
      )
      expect(() => shapes(zones, { minWidth })).toThrow(
        new RangeError('shapes: minWidth must be a finite number, 0 or more'),
      )
    }
    expect(() => shapes(zones, { widthScale: unknown })).toThrow(TypeError)
    expect(() => edges([link], { source: 'from', target: 'to', minWidth: 0 })).not.toThrow()
  })

  it('lets only the first 128 edge marks and shape marks shrink', () => {
    const links: { id: string; from: string; to: string }[] = []
    const many = (scale: WidthScale) =>
      Array.from({ length: widthSlots + 1 }, (_, at) =>
        edges(links, {
          source: 'from',
          target: 'to',
          widthScale: at === widthSlots ? scale : 'screen',
        }),
      )
    expect(() => defineGraph({ marks: [nodes(links, {}), ...many('screen')] })).not.toThrow()
    expect(() => defineGraph({ marks: many('shrink') })).toThrow(RangeError)
    const none: { id: string; geometry: ShapeGeometry }[] = []
    const zones = Array.from({ length: widthSlots + 1 }, (_, at) =>
      shapes(none, { widthScale: at === widthSlots ? 'shrink' : 'screen' }),
    )
    expect(() => defineGraph({ marks: zones })).toThrow(
      new RangeError(
        'defineGraph: only the first 128 edge marks and shape marks can shrink their width',
      ),
    )
  })
})
