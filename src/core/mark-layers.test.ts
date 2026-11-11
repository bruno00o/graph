import { describe, expect, it } from 'vitest'
import { edges, nodes } from '../marks'
import { shapes } from '../shapes'
import { MarkLayers } from './mark-layers'

const ends = { source: 'source', target: 'target' } as const

const places = [{ id: 'a' }, { id: 'b' }]
const links = [{ id: 'ab', source: 'a', target: 'b' }]
const zones = [{ id: 'z', geometry: { center: { x: 0, y: 0 }, radius: 1 } }]

describe('MarkLayers', () => {
  it('names layers by first appearance and ranks edge marks by layer', () => {
    const layers = new MarkLayers()
    const changed = layers.setMarks([
      nodes(places),
      edges(links, { ...ends, layer: 'upper' }),
      edges(links, ends),
      edges(links, { ...ends, layer: 'lower' }),
      nodes(places, { layer: 'lower' }),
      edges(links, { ...ends, layer: 'upper' }),
    ])
    expect(changed).toBe(true)
    expect(layers.names).toEqual(['upper', 'lower'])
    expect([...layers.nodeLayers]).toEqual([-1, 1])
    expect([...layers.edgeLayers]).toEqual([0, -1, 1, 0])
    expect([...(layers.edgeRanks ?? [])]).toEqual([0, 1, 2, 0])
  })

  it('needs no ranks with a single band', () => {
    const layers = new MarkLayers()
    expect(layers.setMarks([nodes(places), edges(links, ends), edges(links, ends)])).toBe(false)
    expect(layers.layered).toBe(false)
    expect(layers.edgeRanks).toBeNull()
    expect(
      layers.setMarks([
        edges(links, { ...ends, layer: 'one' }),
        edges(links, { ...ends, layer: 'one' }),
      ]),
    ).toBe(false)
    expect(layers.layered).toBe(true)
  })

  it('caches the filter of a hidden set and masks the slots', () => {
    const layers = new MarkLayers()
    layers.setMarks([
      nodes(places, { layer: 'upper' }),
      edges(links, { ...ends, layer: 'lower' }),
      edges(links, { ...ends, layer: 'upper' }),
    ])
    expect(layers.filter(new Set())).toBeNull()
    expect(layers.filter(new Set(['missing']))).toBeNull()
    const upper = layers.filter(new Set(['upper']))
    expect(upper && [...upper.nodes]).toEqual([1])
    expect(upper && [...upper.edges]).toEqual([0, 1])
    expect(upper && [...upper.masks]).toEqual([1, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0])
    expect(layers.filter(new Set(['upper', 'missing']))).toBe(upper)
    const both = layers.filter(new Set(['upper', 'lower']))
    expect(both).not.toBe(upper)
    expect(both?.serial).toBeGreaterThan(upper?.serial ?? 0)
    layers.setMarks([nodes(places, { layer: 'upper' }), edges(links, { ...ends, layer: 'upper' })])
    const again = layers.filter(new Set(['upper', 'lower']))
    expect(again).not.toBe(both)
    expect(again && [...again.edges]).toEqual([1])
  })

  it('places shape marks in layers, once per mark object', () => {
    const layers = new MarkLayers()
    const ground = shapes(zones, { layer: 'ground' })
    layers.setMarks([
      shapes(zones),
      ground,
      nodes(places, { layer: 'ground' }),
      ground,
      shapes(zones, { layer: 'sky' }),
    ])
    expect(layers.names).toEqual(['ground', 'sky'])
    expect([...layers.shapeLayers]).toEqual([-1, 0, 1])
    const hidden = layers.filter(new Set(['ground']))
    expect(hidden && [...hidden.shapes]).toEqual([0, 1, 0])
    expect(hidden && [...hidden.nodes]).toEqual([1])
    expect(hidden && [...hidden.masks.subarray(8)]).toEqual([2, 0, 0, 0])
  })
})
