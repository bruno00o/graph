import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import type { ContainerOptions } from '../types'
import { createGraphModel } from './graph-model'
import { Projection } from './projection'
import { createScene, type SceneOptions } from './scene'

type Item = { id: string; parent?: string | null; opacity?: number }

const items: Item[] = [
  { id: 'g', opacity: 0.25 },
  { id: 'h', opacity: Number.NaN },
  { id: 'a', parent: 'g' },
  { id: 'b', parent: 'h' },
]

function setup(options: SceneOptions = {}) {
  const model = createGraphModel()
  const scene = createScene(undefined, options)
  const projection = new Projection(model)
  const render = (container: ContainerOptions<Item>) => {
    const definition = defineGraph({ marks: [nodes<Item>(items, { parent: 'parent', container })] })
    model.setMarks(definition.marks)
    projection.setMarks(definition.marks)
    scene.setDefinition(definition)
    scene.apply(projection.view, projection.apply(model.flush()).scene)
    scene.takeDirty()
  }
  const fill = (key: string) =>
    scene.palette.colors[scene.nodes.fill[model.node(key)?.index ?? -1] ?? -1]
  return { scene, render, fill }
}

const mixed = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`

describe('container fill opacity', () => {
  it('keeps an opaque fill by default', () => {
    const { render, fill } = setup()
    render({})
    expect(fill('g')).toBe('var(--graph-group-fill)')
  })

  it('mixes the fill with transparency, rounded to the percent', () => {
    const { render, fill } = setup()
    render({ fillOpacity: 0.404 })
    expect(fill('g')).toBe(mixed('var(--graph-group-fill)', 40))
    render({ fill: '#123456', fillOpacity: 0 })
    expect(fill('g')).toBe(mixed('#123456', 0))
  })

  it('reads the opacity from data, clamps it and falls back on non-finite values', () => {
    const { render, fill } = setup()
    render({ fillOpacity: (item) => item.opacity ?? 2 })
    expect(fill('g')).toBe(mixed('var(--graph-group-fill)', 25))
    expect(fill('h')).toBe('var(--graph-group-fill)')
    render({ fillOpacity: -1 })
    expect(fill('g')).toBe(mixed('var(--graph-group-fill)', 0))
  })

  it('takes the default opacity of the scene', () => {
    const { render, fill } = setup({ groupFillOpacity: 0.5 })
    render({ fillOpacity: (item) => item.opacity ?? 1 })
    expect(fill('g')).toBe(mixed('var(--graph-group-fill)', 25))
    expect(fill('h')).toBe(mixed('var(--graph-group-fill)', 50))
  })

  it('releases the colors it no longer uses', () => {
    const { render, scene } = setup()
    render({ fillOpacity: 0.3 })
    const size = scene.palette.colors.length
    for (const opacity of [0.4, 0.5, 0.6, 0.7]) render({ fillOpacity: opacity })
    expect(scene.palette.colors.length).toBeLessThanOrEqual(size + 1)
  })
})
