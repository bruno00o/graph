import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { GraphDefinition, Key, Layout, LayoutGraph } from '../types'
import type { GraphTarget } from './events'
import { createGraphHost, type GraphInstance, type MountGraphOptions } from './mount-graph'
import type { RenderInput } from './renderer'

interface Item {
  readonly id: string
  readonly parent?: string
  readonly x?: number
  readonly y?: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const placed: Item[] = [
  { id: 'g' },
  { id: 'h' },
  { id: 'a', parent: 'g', x: -200, y: 0 },
  { id: 'b', parent: 'g', x: -100, y: 0 },
  { id: 'c', parent: 'h', x: 100, y: 0 },
  { id: 'd', parent: 'h', x: 200, y: 0 },
]

const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'ac', from: 'a', to: 'c' },
  { id: 'bd', from: 'b', to: 'd' },
]

function definition(items: readonly Item[] = placed): GraphDefinition {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(items, { x: 'x', y: 'y', parent: 'parent' }),
    ],
    transitions: { layout: 0 },
  })
}

let dom: FakeDom
let frame: RenderInput | null = null

function mount(
  graphDefinition = definition(),
  options: Partial<MountGraphOptions> = {},
): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: graphDefinition, ariaLabel: 'graphe', ...options },
    () => ({
      ...fakeRenderer(),
      sync: (input) => {
        frame = input
      },
    }),
  )
  dom.flushFrames()
  return graph
}

function screenOf(graph: GraphInstance, key: Key) {
  const position = graph.positions.get(key)
  if (!position) throw new Error(`no position for ${String(key)}`)
  return graph.view.toScreen(position)
}

function pointer(graph: GraphInstance, type: string, x: number, y: number) {
  graph.element
    .querySelector('canvas')
    ?.dispatchEvent(
      new PointerEvent(type, { clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true }),
    )
}

function doubleClick(graph: GraphInstance, x: number, y: number) {
  graph.element
    .querySelector('canvas')
    ?.dispatchEvent(
      new MouseEvent('dblclick', { clientX: x, clientY: y, bubbles: true, cancelable: true }),
    )
  dom.flushFrames()
}

function alive(key: Key): boolean {
  const scene = frame?.scene
  if (!scene) return false
  const index = scene.nodes.keys.indexOf(key)
  return index >= 0 && scene.nodes.alive[index] === 1
}

beforeEach(() => {
  dom = installDom()
  frame = null
})

afterEach(() => {
  dom.restore()
})

describe('groups', () => {
  it('folds and unfolds groups through the API', () => {
    const graph = mount()
    const seen: (readonly Key[])[] = []
    graph.on('foldchange', (event) => seen.push(event.folded))
    expect(graph.groups.children('g')).toEqual(['a', 'b'])
    expect(graph.groups.parent('a')).toBe('g')
    expect(frame?.containers?.count).toBe(2)
    graph.groups.fold(['g'])
    dom.flushFrames()
    expect(graph.groups.isFolded('g')).toBe(true)
    expect(graph.store.get().folded).toEqual(['g'])
    expect(alive('a')).toBe(false)
    expect(alive('g')).toBe(true)
    expect(frame?.containers?.count).toBe(1)
    graph.groups.fold()
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(graph.groups.folded()).toEqual(['h'])
    graph.groups.unfold()
    dom.flushFrames()
    expect(alive('a')).toBe(true)
    expect(seen).toEqual([['g'], ['g', 'h'], ['h'], []])
  })

  it('sizes containers around their children and centers them', () => {
    const graph = mount()
    const center = graph.positions.get('g')
    expect(center?.x).toBeCloseTo(-150)
    expect(center?.y).toBeCloseTo(0)
    const boxes = frame?.containers?.boxes ?? new Float32Array(0)
    const index = frame?.scene.nodes.keys.indexOf('g') ?? -1
    const radius = (frame?.scene.nodes.size[frame.scene.nodes.keys.indexOf('a')] ?? 0) / 2
    expect(boxes[index * 4]).toBeCloseTo(50 + radius + 16)
    expect(boxes[index * 4 + 1]).toBeCloseTo(radius + 16)
  })

  it('picks children before their container and the container in its padding', () => {
    const graph = mount()
    expect(graph.pick(screenOf(graph, 'a'))?.key).toBe('a')
    const a = screenOf(graph, 'a')
    expect(graph.pick({ x: a.x, y: a.y - 18 * graph.store.get().view.zoom })?.key).toBe('g')
    expect(graph.pick({ x: a.x, y: a.y - 200 })).toBeNull()
  })

  it('merges the edges between folded groups into one target', () => {
    const graph = mount(definition(), { initialFolded: ['g', 'h'] })
    expect(graph.store.get().folded).toEqual(['g', 'h'])
    const g = screenOf(graph, 'g')
    const h = screenOf(graph, 'h')
    const hit = graph.pick({ x: (g.x + h.x) / 2, y: (g.y + h.y) / 2 }) as GraphTarget & {
      kind: 'edge'
    }
    expect(hit?.kind).toBe('edge')
    expect(hit.endpoints).toEqual({ source: 'g', target: 'h' })
    expect(hit.aggregate).toMatchObject({ source: 'g', target: 'h', count: 2 })
    expect([...(hit.aggregate?.keys ?? [])].sort()).toEqual(['ac', 'bd'])
    pointer(graph, 'pointerdown', (g.x + h.x) / 2, (g.y + h.y) / 2)
    pointer(graph, 'pointerup', (g.x + h.x) / 2, (g.y + h.y) / 2)
    expect([...graph.selection.get().edges].sort()).toEqual(['ac', 'bd'])
  })

  it('draws edges between unfolded groups as one edge, from border to border', () => {
    const graph = mount(
      defineGraph({
        marks: [
          edges<Link>(links, { source: 'from', target: 'to', betweenGroups: 'groups' }),
          nodes<Item>(placed, { x: 'x', y: 'y', parent: 'parent' }),
        ],
        transitions: { layout: 0 },
      }),
    )
    const toScreen = (x: number) => graph.view.toScreen({ x, y: 0 })
    const middle = toScreen(0)
    const hit = graph.pick(middle) as GraphTarget & { kind: 'edge' }
    expect(hit.endpoints).toEqual({ source: 'g', target: 'h' })
    expect([...(hit.aggregate?.keys ?? [])].sort()).toEqual(['ac', 'bd'])
    expect(graph.pick(toScreen(-150))?.key).toBe('ab')
    expect(graph.pick(toScreen(-85))?.key).toBe('g')
    pointer(graph, 'pointerdown', middle.x, middle.y)
    pointer(graph, 'pointerup', middle.x, middle.y)
    expect([...graph.selection.get().edges].sort()).toEqual(['ac', 'bd'])
    expect(frame?.scene.nodes.containerBoxes).toBe(frame?.containers?.boxes)
  })

  it('gives the ends of an edge as drawn', () => {
    const graph = mount()
    const b = screenOf(graph, 'b')
    const d = screenOf(graph, 'd')
    const middle = { x: (b.x + d.x) / 2, y: (b.y + d.y) / 2 + 0.25 }
    expect(graph.pick(middle)).toMatchObject({ key: 'bd', endpoints: { source: 'b', target: 'd' } })
    graph.groups.fold(['g'])
    dom.flushFrames()
    const g = screenOf(graph, 'g')
    const far = { x: (screenOf(graph, 'c').x + d.x) / 2, y: g.y }
    expect(graph.pick(far)).toMatchObject({ key: 'bd', endpoints: { source: 'g', target: 'd' } })
    expect(graph.endpoints('bd')).toEqual({ source: 'b', target: 'd' })
  })

  it('toggles a group on double-click unless the handler prevents it', () => {
    const graph = mount(definition(), { initialFolded: ['g'] })
    const g = screenOf(graph, 'g')
    doubleClick(graph, g.x, g.y)
    expect(graph.groups.isFolded('g')).toBe(false)
    const stop = graph.on('doubleclick', (event) => event.originalEvent.preventDefault())
    const a = screenOf(graph, 'a')
    doubleClick(graph, a.x, a.y - 18 * graph.store.get().view.zoom)
    expect(graph.groups.isFolded('g')).toBe(false)
    stop()
    doubleClick(graph, a.x, a.y - 18 * graph.store.get().view.zoom)
    expect(graph.groups.isFolded('g')).toBe(true)
  })

  it('toggles the focused group with Enter', () => {
    const graph = mount()
    graph.focus.set({ kind: 'node', key: 'g' })
    graph.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    dom.flushFrames()
    expect(graph.groups.isFolded('g')).toBe(true)
    graph.focus.set({ kind: 'node', key: 'a' })
    expect(graph.store.get().focused?.key).toBe('g')
  })

  it('asks before folding in controlled mode', () => {
    const onFoldChange = vi.fn()
    const graph = mount(definition(), { folded: [], onFoldChange })
    graph.groups.fold(['g'])
    dom.flushFrames()
    expect(onFoldChange).toHaveBeenCalledWith({ folded: ['g'] })
    expect(graph.groups.isFolded('g')).toBe(false)
    graph.update({ folded: ['g'] })
    dom.flushFrames()
    expect(graph.groups.isFolded('g')).toBe(true)
    expect(alive('a')).toBe(false)
  })

  it('moves the descendants of a dragged container', () => {
    const graph = mount(definition(placed.map(({ x: _x, y: _y, ...item }) => item)), {})
    const before = graph.positions.get('a')
    const b = graph.positions.get('b')
    const a = screenOf(graph, 'a')
    const zoom = graph.store.get().view.zoom
    const grip = { x: a.x, y: a.y - 18 * zoom }
    expect(graph.pick(grip)?.key).toBe('g')
    pointer(graph, 'pointerdown', grip.x, grip.y)
    pointer(graph, 'pointermove', grip.x + 50, grip.y + 30)
    pointer(graph, 'pointerup', grip.x + 50, grip.y + 30)
    dom.flushFrames()
    expect(graph.positions.get('a')?.x).toBeCloseTo((before?.x ?? 0) + 50 / zoom)
    expect(graph.positions.get('b')?.y).toBeCloseTo((b?.y ?? 0) + 30 / zoom)
  })

  it('starts a folded group at the center of its placed descendants', () => {
    const graph = mount(definition(), { initialFolded: ['g'] })
    expect(graph.positions.get('g')?.x).toBeCloseTo(-150)
    expect(graph.positions.get('g')?.y).toBeCloseTo(0)
    graph.groups.unfold(['g'])
    dom.flushFrames()
    graph.groups.fold(['g'])
    dom.flushFrames()
    expect(graph.positions.get('g')?.x).toBeCloseTo(-150)
    expect(graph.positions.get('g')?.y).toBeCloseTo(0)
  })

  it('places a nested folded group at its descendants when its parent unfolds', () => {
    const nested: Item[] = [
      { id: 'top' },
      { id: 'g', parent: 'top' },
      { id: 'a', parent: 'g', x: 100, y: 40 },
      { id: 'b', parent: 'g', x: 300, y: 80 },
      { id: 'c', parent: 'top', x: -100, y: 0 },
    ]
    const graph = mount(definition(nested), { initialFolded: ['top', 'g'] })
    graph.groups.unfold(['top'])
    dom.flushFrames()
    expect(graph.positions.get('g')?.x).toBeCloseTo(200)
    expect(graph.positions.get('g')?.y).toBeCloseTo(60)
  })

  it('keeps the placement of a folded group whose descendants have no known position', () => {
    const graph = mount(definition(placed.map(({ x: _x, y: _y, ...item }) => item)), {
      initialFolded: ['g'],
    })
    const g = graph.positions.get('g')
    expect(Number.isFinite(g?.x)).toBe(true)
    expect(Number.isFinite(g?.y)).toBe(true)
  })

  it('keeps children positions and follows the group when it unfolds', () => {
    const graph = mount(definition(placed.map(({ x: _x, y: _y, ...item }) => item)))
    const a = graph.positions.get('a')
    graph.groups.fold(['g'])
    dom.flushFrames()
    const g = graph.positions.get('g') ?? { x: 0, y: 0 }
    graph.positions.set([['g', { x: g.x + 300, y: g.y - 40 }]])
    graph.groups.unfold(['g'])
    dom.flushFrames()
    expect(graph.positions.get('a')?.x).toBeCloseTo((a?.x ?? 0) + 300)
    expect(graph.positions.get('a')?.y).toBeCloseTo((a?.y ?? 0) - 40)
  })
})

describe('paths on groups', () => {
  it('runs on the data, or on the graph as drawn with visible', () => {
    const graph = mount(definition(), { initialFolded: ['g'] })
    expect(graph.paths.shortest('a', 'd')).toMatchObject({ nodes: ['a', 'b', 'd'], cost: 2 })
    expect(graph.paths.shortest('a', 'd', { visible: true })).toEqual({
      nodes: ['g', 'd'],
      edges: ['bd'],
      costs: [0, 1],
      cost: 1,
    })
    const reached = graph.paths.reach('b', { visible: true })
    expect(reached.nodes).toEqual(['g', 'c', 'd'])
    expect(new Set(reached.edges)).toEqual(new Set(['ac', 'bd']))
    graph.groups.unfold(['g'])
    expect(graph.paths.shortest('a', 'd', { visible: true })?.nodes).toEqual(['a', 'b', 'd'])
    graph.destroy()
  })
})

describe('groups with a layout', () => {
  it('tells layouts how much room the label of each group takes', async () => {
    const seen: LayoutGraph[] = []
    const capture: Layout = {
      name: 'capture',
      options: {},
      start: (graph, listener) => {
        seen.push(graph)
        queueMicrotask(() => listener.end(graph.xy))
        return { pin: () => {}, stop: () => {} }
      },
    }
    const items: Item[] = [
      { id: 'g' },
      { id: 'a', parent: 'g' },
      { id: 'side' },
      { id: 'b', parent: 'side' },
      { id: 'plain' },
      { id: 'c', parent: 'plain' },
    ]
    const graph = mount(
      defineGraph({
        marks: [
          nodes<Item>(items, {
            parent: 'parent',
            label: {
              text: (item) => (item.id === 'plain' ? null : item.id),
              placement: (item) => (item.id === 'side' ? 'left' : 'top'),
              size: 16,
            },
          }),
        ],
        transitions: { layout: 0 },
        layout: capture,
      }),
    )
    await Promise.resolve()
    const run = seen.at(-1)
    const space = run?.groups?.labelSpace
    const at = (key: Key) => run?.keys.indexOf(key) ?? -1
    expect(Array.from(space?.subarray(at('g') * 4, at('g') * 4 + 4) ?? [])).toEqual([23, 0, 0, 0])
    const side = Array.from(space?.subarray(at('side') * 4, at('side') * 4 + 4) ?? [])
    expect(side.slice(0, 3)).toEqual([0, 0, 0])
    expect(side[3]).toBeCloseTo(3 + 4 * 0.6 * 16, 4)
    expect(Array.from(space?.subarray(at('plain') * 4, at('plain') * 4 + 4) ?? [])).toEqual([
      0, 0, 0, 0,
    ])
    graph.destroy()
  })

  it('pushes free nodes out of a group that unfolds', async () => {
    const still: Layout = {
      name: 'still',
      options: {},
      start: (graph, listener) => {
        queueMicrotask(() => listener.end(graph.xy))
        return { pin: () => {}, stop: () => {} }
      },
    }
    const items: Item[] = [
      { id: 'g' },
      { id: 'a', parent: 'g' },
      { id: 'b', parent: 'g' },
      { id: 'e' },
    ]
    const graph = mount(
      defineGraph({
        marks: [nodes<Item>(items, { parent: 'parent', container: { padding: 10 } })],
        transitions: { layout: 0 },
        layout: still,
      }),
    )
    await Promise.resolve()
    graph.groups.fold(['g'])
    dom.flushFrames()
    await Promise.resolve()
    const a = graph.positions.get('a') ?? { x: 0, y: 0 }
    const b = graph.positions.get('b') ?? { x: 0, y: 0 }
    graph.positions.set([['e', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }]])
    graph.groups.unfold(['g'])
    dom.flushFrames()
    const after = ['a', 'b'].map((key) => graph.positions.get(key) ?? { x: 0, y: 0 })
    const e = graph.positions.get('e') ?? { x: 0, y: 0 }
    const minX = Math.min(...after.map((point) => point.x))
    const maxX = Math.max(...after.map((point) => point.x))
    const minY = Math.min(...after.map((point) => point.y))
    const maxY = Math.max(...after.map((point) => point.y))
    expect(Math.max(minX - e.x, e.x - maxX, minY - e.y, e.y - maxY)).toBeGreaterThan(20)
  })
})
