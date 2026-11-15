import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { groups, nodes } from '../marks'
import type { ContainerOptions, Key, NodeGroup } from '../types'
import { cornerCodes, placementCodes } from './columns'
import { createGraphModel } from './graph-model'
import { Projection } from './projection'
import { createScene } from './scene'

type Item = { id: string; parent?: string | null; kind?: string }

const items: Item[] = [
  { id: 'g' },
  { id: 'a', parent: 'g', kind: 'x' },
  { id: 'b', parent: 'g', kind: 'y' },
  { id: 'c', kind: 'x' },
]

function setup(container: ContainerOptions<Item> | undefined) {
  const model = createGraphModel()
  const scene = createScene()
  const projection = new Projection(model)
  const step = () => {
    const result = projection.apply(model.flush())
    scene.apply(projection.view, result.scene)
    scene.takeDirty()
    return result
  }
  const definition = defineGraph({
    marks: [
      nodes<Item>(items, {
        parent: 'parent',
        label: (item) => `node ${item.id}`,
        badges: { topRight: (item) => ({ text: item.id }) },
        ...(container ? { container } : {}),
      }),
    ],
  })
  model.setMarks(definition.marks)
  projection.setMarks(definition.marks)
  scene.setDefinition(definition)
  step()
  const index = (key: Key) => model.node(key)?.index ?? -1
  const label = (key: Key) => scene.nodes.label[index(key)]
  const badges = (key: Key) =>
    (scene.nodes.badges[index(key)] ?? []).map((badge) => [badge.corner, badge.text])
  const fold = (keys: Key[]) => {
    projection.setFolded(keys)
    return step()
  }
  return { scene, label, badges, fold, index }
}

describe('container look', () => {
  it('keeps the node label and hides badges while unfolded by default', () => {
    const { label, badges, fold } = setup(undefined)
    expect(label('g')).toBe('node g')
    expect(badges('g')).toEqual([])
    fold(['g'])
    expect(label('g')).toBe('node g')
    expect(badges('g')).toEqual([[cornerCodes.topRight, 'g']])
  })

  it('draws the container label and badges while unfolded, the node ones once folded', () => {
    const { label, badges, fold, scene, index } = setup({
      label: { text: (item) => `open ${item.id}`, placement: 'bottom' },
      badges: { bottomLeft: () => ({ text: 'open' }) },
    })
    expect(label('g')).toBe('open g')
    expect(scene.nodes.labelPlacement[index('g')]).toBe(placementCodes.bottom)
    expect(badges('g')).toEqual([[cornerCodes.bottomLeft, 'open']])
    expect(label('a')).toBe('node a')
    fold(['g'])
    expect(label('g')).toBe('node g')
    expect(badges('g')).toEqual([[cornerCodes.topRight, 'g']])
    fold([])
    expect(label('g')).toBe('open g')
    expect(badges('g')).toEqual([[cornerCodes.bottomLeft, 'open']])
  })

  it('draws no label with null', () => {
    const { label, fold } = setup({ label: null, badges: null })
    expect(label('g')).toBeNull()
    fold(['g'])
    expect(label('g')).toBe('node g')
  })

  it('rewrites only the group when it folds or unfolds', () => {
    const { fold } = setup({ label: 'kind' })
    const folded = fold(['g'])
    expect(folded.scene.nodes.updated.map((record) => record.key)).toEqual(['g'])
    const unfolded = fold([])
    expect(unfolded.scene.nodes.updated.map((record) => record.key)).toEqual(['g'])
  })

  it('reads the container look of groups()', () => {
    const model = createGraphModel()
    const scene = createScene()
    const projection = new Projection(model)
    const definition = defineGraph({
      marks: [
        nodes<Item>(items.slice(1)),
        groups(items.slice(1), {
          by: 'kind',
          folded: false,
          label: (group: NodeGroup<Item>) => `${group.value} (${group.count})`,
          badges: { topRight: (group: NodeGroup<Item>) => ({ text: group.count }) },
          container: { label: (group: NodeGroup<Item>) => String(group.value), badges: null },
        }),
      ],
    })
    model.setMarks(definition.marks)
    projection.setMarks(definition.marks)
    scene.setDefinition(definition)
    scene.apply(projection.view, projection.apply(model.flush()).scene)
    const labels: string[] = []
    for (let index = 0; index < scene.nodes.capacity; index++) {
      if (scene.nodes.alive[index] === 1 && scene.nodes.badges[index] === null) {
        labels.push(scene.nodes.label[index] ?? '')
      }
    }
    expect(labels.filter((text) => text === 'x' || text === 'y').sort()).toEqual(['x', 'y'])
  })
})
