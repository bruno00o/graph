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
  it('picks parallel edges along their curve and loops around their node', () => {
    const { pick } = setup(
      [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 200, y: 0 },
      ],
      [
        { id: 'ab', from: 'a', to: 'b' },
        { id: 'ba', from: 'b', to: 'a' },
        { id: 'aa', from: 'a', to: 'a' },
      ],
    )
    expect(pick(100, -12)).toBe('ab')
    expect(pick(100, 12)).toBe('ba')
    expect(pick(100, 0)).toBeNull()
    expect(pick(14.1, -14.1)).toBe('aa')
    expect(pick(40, -40)).toBeNull()
  })

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

  it('refreshes only what changed and picks like a full build', () => {
    const model = createGraphModel()
    const scene = createScene()
    const positions = new Positions()
    const source: PickSource = {
      nodes: scene.nodes,
      edges: scene.edges,
      positions,
      order: (_kind, index) => index,
    }
    const grid = (count: number): Item[] =>
      Array.from({ length: count }, (_, i) => ({
        id: `n${i}`,
        x: (i % 10) * 50,
        y: Math.floor(i / 10) * 50,
      }))
    const apply = (items: Item[], links: Link[]) => {
      const definition = defineGraph({
        marks: [edges(links, { source: 'from', target: 'to' }), nodes(items, { x: 'x', y: 'y' })],
      })
      model.setMarks(definition.marks)
      scene.setDefinition(definition)
      const changes = model.flush()
      scene.apply(model, changes)
      const moves = placeNodes(model, positions, changes)
      moves.indices.forEach((index, i) => {
        positions.set(index, moves.to[i * 2] ?? 0, moves.to[i * 2 + 1] ?? 0)
      })
    }
    const before = grid(100)
    apply(before, [{ id: 'e', from: 'n0', to: 'n1' }])
    const index = new PickIndex()
    index.build(source)

    const after = [
      ...before.slice(2).map((node) => (node.id === 'n55' ? { ...node, x: 1000, y: 1000 } : node)),
      { id: 'x', x: 225, y: 225 },
    ]
    apply(after, [
      { id: 'f', from: 'n55', to: 'n56' },
      { id: 'g', from: 'x', to: 'x' },
    ])
    index.refresh(source)
    const fresh = new PickIndex()
    fresh.build(source)
    const keyOf = (hit: ReturnType<PickIndex['pick']>) =>
      hit === null
        ? null
        : hit.kind === 'node'
          ? scene.nodes.keys[hit.index]
          : scene.edges.keys[hit.index]
    const probes = [
      [0, 0],
      [25, 0],
      [225, 225],
      [250, 250],
      [1000, 1000],
      [800, 786],
      [300, 250],
      [234, 216],
    ] as const
    for (const [x, y] of probes) {
      expect(keyOf(index.pick(source, x, y, 1, 4))).toBe(keyOf(fresh.pick(source, x, y, 1, 4)))
    }
    expect(keyOf(index.pick(source, 1000, 1000, 1, 4))).toBe('n55')
    expect(keyOf(index.pick(source, 225, 225, 1, 4))).toBe('x')
    expect(keyOf(index.pick(source, 0, 0, 1, 4))).toBeNull()
    expect(keyOf(index.pick(source, 800, 786, 1, 4))).toBe('f')
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
