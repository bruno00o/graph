import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { hull } from '../hulls'
import { nodes } from '../marks'
import type { Hull, Key } from '../types'
import { containerShape } from './columns'
import { createGraphModel } from './graph-model'
import { outlineStride } from './hull-geometry'
import { HullLayer, type HullSource, hullInstanceWords } from './hull-layer'
import { Positions, placeNodes } from './positions'
import { createScene } from './scene'

type Item = { id: string; x: number; y: number; group: string; size: number }

function setup(items: Item[], build: (mark: ReturnType<typeof nodes<Item>>) => Hull[]) {
  const model = createGraphModel()
  const scene = createScene()
  const positions = new Positions()
  const mark = nodes<Item>(items, { x: 'x', y: 'y', size: 'size' })
  const definition = defineGraph({ marks: [mark], scales: { size: (value) => value } })
  model.setMarks(definition.marks)
  scene.setDefinition(definition)
  const changes = model.flush()
  scene.apply(model, changes)
  placeNodes(model, positions, changes)
  let states: Record<string, readonly Key[]> = {}
  const containers = { boxes: new Float32Array(scene.nodes.capacity * 4), version: 0 }
  const source: HullSource = {
    model,
    nodes: scene.nodes,
    positions,
    palette: scene.palette,
    containers,
    stateNodes: (name) => states[name] ?? [],
  }
  const layer = new HullLayer()
  layer.setHulls(build(mark))
  let time = 0
  const update = (deadline = Number.POSITIVE_INFINITY) => layer.update(source, deadline, () => time)
  return {
    layer,
    update,
    positions,
    scene,
    move(key: Key, x: number, y: number) {
      const index = model.node(key)?.index ?? -1
      positions.set(index, x, y)
    },
    box(key: Key, halfWidth: number, halfHeight: number, corner: number) {
      const index = model.node(key)?.index ?? -1
      scene.nodes.shape[index] = containerShape
      containers.boxes.set([halfWidth, halfHeight, corner], index * 4)
      containers.version++
    },
    setState(name: string, keys: readonly Key[]) {
      states = { ...states, [name]: keys }
    },
    tick(ms: number) {
      time += ms
    },
  }
}

const items: Item[] = [
  { id: 'a', x: 0, y: 0, group: 'one', size: 10 },
  { id: 'b', x: 100, y: 0, group: 'one', size: 10 },
  { id: 'c', x: 0, y: 100, group: 'one', size: 10 },
  { id: 'd', x: 500, y: 500, group: 'two', size: 20 },
  { id: 'e', x: 600, y: 500, group: 'two', size: 20 },
]

function bounds(layer: HullLayer, index: number) {
  const shape = layer.shapes[index]
  if (!shape) throw new Error('missing shape')
  const { data, length } = shape.outline
  let x0 = Number.POSITIVE_INFINITY
  let x1 = Number.NEGATIVE_INFINITY
  for (let k = 0; k < length; k++) {
    const at = k * outlineStride
    const x = (data[at] ?? 0) + (data[at + 2] ?? 0) * (data[at + 4] ?? 0)
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
  }
  return { x0, x1 }
}

describe('HullLayer', () => {
  it('draws one hull per value of a channel and packs one instance per outline side', () => {
    const { layer, update } = setup(items, (mark) => [hull<Item>({ nodes: mark, by: 'group' })])
    expect(update()).toBe(false)
    expect(layer.shapes).toHaveLength(2)
    const sides = layer.shapes.reduce((total, shape) => total + shape.outline.length, 0)
    expect(layer.count).toBe(sides)
    expect(layer.data.byteLength).toBeGreaterThanOrEqual(sides * hullInstanceWords * 4)
    expect(bounds(layer, 0)).toEqual({ x0: expect.closeTo(-5, 3), x1: expect.closeTo(105, 3) })
    expect(layer.shapes[0]?.padding).toBe(16)
  })

  it('follows keys and states, and skips missing nodes', () => {
    const { layer, update, setState } = setup(items, () => [
      hull({ nodes: ['a', 'e', 'missing'] }),
      hull({ state: 'selected', padding: 4 }),
    ])
    update()
    expect(layer.shapes).toHaveLength(1)
    const version = layer.version
    setState('selected', ['d', 'e'])
    update()
    expect(layer.shapes).toHaveLength(2)
    expect(layer.shapes[1]?.padding).toBe(4)
    expect(layer.version).toBeGreaterThan(version)
    const stable = layer.version
    setState('selected', ['d', 'e'])
    update()
    expect(layer.version).toBe(stable)
    setState('selected', [])
    update()
    expect(layer.shapes).toHaveLength(1)
  })

  it('recomputes only the hulls whose nodes moved', () => {
    const { layer, update, move } = setup(items, (mark) => [
      hull<Item>({ nodes: mark, by: 'group' }),
    ])
    update()
    const [first, second] = layer.shapes
    const before = second?.outline.data.slice()
    move('a', -200, 0)
    update()
    expect(bounds(layer, 0).x0).toBeCloseTo(-205, 2)
    expect(layer.shapes[0]).toBe(first)
    expect(second?.outline.data.slice()).toEqual(before)
    const version = layer.version
    update()
    expect(layer.version).toBe(version)
  })

  it('spreads the work over frames when the deadline passes', () => {
    const many: Item[] = Array.from({ length: 60 }, (_, i) => ({
      id: `n${i}`,
      x: (i % 6) * 300 + (i % 3),
      y: Math.floor(i / 6) * 300,
      group: `g${i % 6}`,
      size: 8,
    }))
    const { layer, update, tick } = setup(many, (mark) => [
      hull<Item>({ nodes: mark, by: 'group' }),
    ])
    tick(1)
    const pending = [update(0)]
    expect(layer.shapes.filter((shape) => shape.outline.length > 0)).toHaveLength(1)
    while (pending.at(-1)) pending.push(update(0))
    expect(pending).toEqual([true, true, true, true, true, false])
    expect(layer.shapes.every((shape) => shape.outline.length > 0)).toBe(true)
  })

  it('takes colors from the options or the group tokens', () => {
    const { layer, update, scene } = setup(items, (mark) => [
      hull<Item>({
        nodes: mark,
        by: 'group',
        color: (group) => (group === 'one' ? 'red' : 'blue'),
      }),
      hull({ nodes: ['a'], strokeWidth: 0 }),
    ])
    update()
    const colors = layer.shapes.map((shape) => [
      scene.palette.colors[shape.fill],
      scene.palette.colors[shape.stroke],
    ])
    expect(colors).toEqual([
      ['color-mix(in srgb, red 12%, transparent)', 'red'],
      ['color-mix(in srgb, blue 12%, transparent)', 'blue'],
      ['var(--graph-group-fill)', 'var(--graph-group-line)'],
    ])
    expect(layer.shapes[2]?.strokeWidth).toBe(0)
  })

  it('wraps the box of a group container and follows its size', () => {
    const { layer, update, box } = setup(items, () => [hull({ nodes: ['a', 'b'] })])
    box('a', 40, 20, 10)
    update()
    expect(bounds(layer, 0)).toEqual({ x0: expect.closeTo(-40, 3), x1: expect.closeTo(105, 3) })
    const version = layer.version
    update()
    expect(layer.version).toBe(version)
    box('a', 60, 20, 20)
    update()
    expect(bounds(layer, 0).x0).toBeCloseTo(-60, 3)
    box('a', 30, 30, 30)
    update()
    expect(bounds(layer, 0).x0).toBeCloseTo(-30, 3)
  })

  it('drops everything when the hulls are removed', () => {
    const { layer, update } = setup(items, () => [hull({ nodes: ['a', 'b'] })])
    update()
    expect(layer.count).toBeGreaterThan(0)
    layer.setHulls([])
    update()
    expect(layer.count).toBe(0)
    expect(layer.shapes).toHaveLength(0)
  })
})
