import { describe, expect, it } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import type { NodeOptions } from '../types'
import { createGraphModel } from './graph-model'
import { PickIndex, type PickSource } from './pick-index'
import { Positions, placeNodes } from './positions'
import { createScene } from './scene'

type Item = { id: string; x: number; y: number; size?: number }
type Link = { id: string; from: string; to: string }

function setup(items: Item[], links: Link[], options: NodeOptions<Item> = {}) {
  const model = createGraphModel()
  const scene = createScene()
  const positions = new Positions()
  const definition = defineGraph({
    marks: [
      edges(links, { source: 'from', target: 'to' }),
      nodes(items, { x: 'x', y: 'y', ...options }),
    ],
    scales: { size: (value) => value },
  })
  model.setMarks(definition.marks)
  scene.setDefinition(definition)
  const changes = model.flush()
  scene.apply(model, changes)
  placeNodes(model, positions, changes)
  const source: PickSource = {
    nodes: scene.nodes,
    edges: scene.edges,
    positions,
    order: (_kind, index) => index,
  }
  const index = new PickIndex()
  index.build(source)
  const keyOf = (hit: ReturnType<PickIndex['pick']>) =>
    hit === null
      ? null
      : hit.kind === 'node'
        ? scene.nodes.keys[hit.index]
        : scene.edges.keys[hit.index]
  return { pick: (x: number, y: number, zoom = 1) => keyOf(index.pick(source, x, y, zoom, 4)) }
}

describe('PickIndex', () => {
  const items: Item[] = [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 200, y: 0 },
    { id: 'c', x: 5, y: 0 },
  ]
  const links: Link[] = [{ id: 'ab', from: 'a', to: 'b' }]

  it('finds the topmost node under a point', () => {
    const { pick } = setup(items, links)
    expect(pick(3, 0)).toBe('c')
    expect(pick(198, 2)).toBe('b')
  })

  it('finds an edge between its endpoints within the tolerance', () => {
    const { pick } = setup(items, links)
    expect(pick(100, 3)).toBe('ab')
    expect(pick(100, 12)).toBeNull()
    expect(pick(100, 12, 0.25)).toBe('ab')
  })

  it('misses empty space', () => {
    const { pick } = setup(items, links)
    expect(pick(-500, -500)).toBeNull()
  })

  it('sizes screen-unit nodes by the zoom', () => {
    const { pick } = setup([{ id: 'a', x: 0, y: 0 }], [], { units: 'screen' })
    expect(pick(20, 0, 1)).toBeNull()
    expect(pick(3, 0, 2)).toBe('a')
    expect(pick(6, 0, 2)).toBeNull()
    expect(pick(30, 0, 0.25)).toBe('a')
    expect(pick(40, 0, 0.25)).toBeNull()
  })
})
