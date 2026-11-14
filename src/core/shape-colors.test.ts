import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { shapes } from '../shapes'
import { defaults } from '../theme/tokens'
import type { GraphDefinition, Mark, ScalesOptions, ShapeGeometry } from '../types'
import { noColor } from './columns'
import { createGraphModel } from './graph-model'
import { raw } from './raw'
import { createScene } from './scene'

type Zone = {
  id: string
  geometry: ShapeGeometry | null
  kind?: string | null
  level?: number
  paint?: string | null
}

const square = (x: number): ShapeGeometry => ({ x, y: 0, width: 10, height: 10 })
const line = (x: number): ShapeGeometry => ({
  points: [
    [x, 0],
    [x + 10, 10],
  ],
})
const mixed = (color: string) => `color-mix(in srgb, ${color} 20%, transparent)`
const category = (rank: number) => `var(--graph-cat-${rank})`

function setup() {
  const model = createGraphModel()
  const scene = createScene()
  const render = (marks: readonly Mark[], scales: ScalesOptions = {}) => {
    const definition: GraphDefinition = defineGraph({ marks, scales })
    model.setMarks(definition.marks)
    scene.setDefinition(definition)
    scene.apply(model, model.flush())
  }
  const store = scene.shapes
  const indexOf = (key: string) => model.shape(key)?.index ?? -1
  const css = (id: number | undefined) =>
    id === undefined || id === noColor ? null : (scene.palette.colors[id] ?? null)
  const fill = (key: string) => css(store.fill[indexOf(key)])
  const stroke = (key: string) => css(store.stroke[indexOf(key)])
  const held = (key: string) => scene.scales().shapeColor[indexOf(key)]
  return { model, scene, store, render, fill, stroke, held, indexOf }
}

describe('shape colors', () => {
  it('fills with a tint of the color and outlines with the color', () => {
    const { render, fill, stroke, held } = setup()
    const zones: Zone[] = [
      { id: 'a', geometry: square(0), kind: 'north' },
      { id: 'b', geometry: square(20), kind: 'south' },
      { id: 'c', geometry: line(40), kind: 'north' },
    ]
    render([shapes(zones, { color: 'kind' })])
    expect(fill('a')).toBe(mixed(category(1)))
    expect(stroke('a')).toBe(category(1))
    expect(fill('b')).toBe(mixed(category(2)))
    expect(stroke('b')).toBe(category(2))
    expect(fill('c')).toBeNull()
    expect(stroke('c')).toBe(category(1))
    expect(held('a')).toBe('north')
    expect(held('c')).toBe('north')
  })

  it('lets fill and stroke win over the color', () => {
    const { render, fill, stroke, held } = setup()
    const zones: Zone[] = [
      { id: 'a', geometry: square(0), kind: 'north', paint: 'red' },
      { id: 'b', geometry: square(20), kind: 'north', paint: null },
    ]
    render([shapes(zones, { color: 'kind', fill: (zone) => zone.paint ?? null })])
    expect(fill('a')).toBe('red')
    expect(stroke('a')).toBe(category(1))
    expect(fill('b')).toBeNull()
    expect(held('a')).toBe('north')
    render([shapes(zones, { color: 'kind', fill: (zone) => zone.paint ?? null, stroke: 'blue' })])
    expect(stroke('a')).toBe('blue')
    expect(held('a')).toBeUndefined()
  })

  it('falls back to the default look without a value', () => {
    const { render, fill, stroke, held } = setup()
    render([shapes([{ id: 'a', geometry: square(0), kind: null }], { color: 'kind' })])
    expect(fill('a')).toBe(defaults.shapeFill)
    expect(stroke('a')).toBe(defaults.shapeStroke)
    expect(held('a')).toBeUndefined()
  })

  it('uses a raw color as is, out of the categories', () => {
    const { render, scene, fill, stroke, held } = setup()
    const zones: Zone[] = [{ id: 'a', geometry: square(0), paint: '#123456' }]
    render([shapes(zones, { color: raw((zone) => zone.paint) })])
    expect(fill('a')).toBe(mixed('#123456'))
    expect(stroke('a')).toBe('#123456')
    expect(held('a')).toBeUndefined()
    expect([...scene.scales().color.scale.categories()]).toEqual([])
  })

  it('shares categories with nodes and edges, nodes first', () => {
    const { render, scene, stroke } = setup()
    const zones: Zone[] = [{ id: 'z', geometry: square(0), kind: 'c' }]
    const items = [
      { id: 'n1', kind: 'a' },
      { id: 'n2', kind: 'c' },
    ]
    const links = [{ id: 'l1', from: 'n1', to: 'n2', kind: 'b' }]
    render([
      shapes(zones, { color: 'kind' }),
      edges(links, { source: 'from', target: 'to', color: 'kind' }),
      nodes(items, { color: 'kind' }),
    ])
    expect([...scene.scales().color.scale.categories()]).toEqual(['a', 'c', 'b'])
    expect(stroke('z')).toBe(category(2))
  })

  it('keeps a scale of its own per mark', () => {
    const { render, scene, stroke, fill } = setup()
    const zones: Zone[] = [{ id: 'z', geometry: square(0), kind: 'c' }]
    const items = [{ id: 'n1', kind: 'a' }]
    render([
      shapes(zones, { color: 'kind', scales: { color: { range: ['red', 'blue'] } } }),
      nodes(items, { color: 'kind' }),
    ])
    expect(stroke('z')).toBe('red')
    expect(fill('z')).toBe(mixed('red'))
    const scales = scene.scales()
    expect(scales.shapeColors[0]?.kind).toBe('shapes')
    expect([...(scales.shapeColors[0]?.scale.categories() ?? [])]).toEqual(['c'])
    expect([...scales.color.scale.categories()]).toEqual(['a'])
  })

  it('spreads a sequential scale over the values of nodes and shapes', () => {
    const { render, scene, stroke } = setup()
    const zones: Zone[] = [
      { id: 'a', geometry: square(0), level: 0 },
      { id: 'b', geometry: square(20), level: 10 },
    ]
    render(
      [shapes(zones, { color: 'level' }), nodes([{ id: 'n', level: 20 }], { color: 'level' })],
      { color: { type: 'sequential', range: ['white', 'black'] } },
    )
    expect(scene.scales().color.extent).toEqual([0, 20])
    expect(stroke('a')).toBe('white')
    expect(stroke('b')).toBe('color-mix(in oklab, white, black 50%)')
    render(
      [shapes(zones, { color: 'level' }), nodes([{ id: 'n', level: 10 }], { color: 'level' })],
      { color: { type: 'sequential', range: ['white', 'black'] } },
    )
    expect(scene.scales().color.extent).toEqual([0, 10])
    expect(stroke('b')).toBe('black')
  })

  it('counts its palette colors and frees them with the shape', () => {
    const { render, scene, model, store, indexOf } = setup()
    const zones: Zone[] = [
      { id: 'a', geometry: square(0), kind: 'north' },
      { id: 'b', geometry: square(20), kind: 'north' },
    ]
    const mark = shapes(zones, { color: 'kind' })
    render([mark])
    const id = store.stroke[indexOf('a')] ?? noColor
    expect(store.stroke[indexOf('b')]).toBe(id)
    render([shapes([{ id: 'c', geometry: square(0), kind: 'south' }], { color: 'kind' })])
    expect(model.shape('a')).toBeUndefined()
    const before = scene.palette.colors.length
    render([shapes([{ id: 'd', geometry: square(0), kind: 'east' }], { color: 'kind' })])
    expect(scene.palette.colors.length).toBeLessThanOrEqual(before + 1)
  })

  it('moves held values when the color is taken away', () => {
    const { render, fill, stroke, held } = setup()
    const zones: Zone[] = [{ id: 'a', geometry: square(0), kind: 'north' }]
    render([shapes(zones, { color: 'kind' })])
    expect(held('a')).toBe('north')
    render([shapes(zones)])
    expect(held('a')).toBeUndefined()
    expect(fill('a')).toBe(defaults.shapeFill)
    expect(stroke('a')).toBe(defaults.shapeStroke)
  })

  it('changes nothing for shapes without a color', () => {
    const { render, scene, fill } = setup()
    render([shapes([{ id: 'a', geometry: square(0) }]), nodes([{ id: 'n', kind: 'x' }])])
    expect(fill('a')).toBe(defaults.shapeFill)
    expect(scene.scales().shapeColors.every((scale) => scale === null)).toBe(true)
    expect(scene.scales().shapeColor).toEqual([])
  })
})
