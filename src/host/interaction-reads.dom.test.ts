import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { AggregateEdge, InteractionOptions, Key, Mark } from '../types'
import type { GraphTarget } from './events'
import { createGraphHost, type GraphInstance, type MountGraphOptions } from './mount-graph'

interface Item {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly parent?: string
  readonly fixed?: boolean
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [
  { id: 'a', x: -100, y: 0 },
  { id: 'b', x: 100, y: 0 },
  { id: 'c', x: 0, y: 100 },
  { id: 'd', x: 400, y: 300 },
]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
  { id: 'cd', from: 'c', to: 'd' },
]

function definition(interaction: InteractionOptions = {}, data: readonly Item[] = items) {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(data, { x: 'x', y: 'y', drag: (item) => item.fixed !== true }),
    ],
    states: { gone: { hide: true } },
    interaction,
  })
}

let dom: FakeDom

function mount<S extends string, M extends Mark>(
  options: MountGraphOptions<S, M>,
): GraphInstance<S, M> {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(container, options, fakeRenderer)
  dom.flushFrames()
  return graph
}

function canvasOf(graph: GraphInstance): HTMLCanvasElement {
  const canvas = graph.element.querySelector('canvas')
  if (!canvas) throw new Error('no canvas')
  return canvas
}

function pointer(
  graph: GraphInstance,
  type: string,
  x: number,
  y: number,
  init: PointerEventInit = {},
) {
  canvasOf(graph).dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      button: 0,
      pointerId: 1,
      bubbles: true,
      ...init,
    }),
  )
}

function screenOf(graph: GraphInstance, key: Key) {
  const position = graph.positions.get(key)
  if (!position) throw new Error(`no position for ${String(key)}`)
  return graph.view.toScreen(position)
}

function lasso(graph: GraphInstance, keys: readonly Key[], init: PointerEventInit = {}) {
  const points = keys.map((key) => screenOf(graph, key))
  const left = Math.min(...points.map((point) => point.x)) - 30
  const right = Math.max(...points.map((point) => point.x)) + 30
  const top = Math.min(...points.map((point) => point.y)) - 30
  const bottom = Math.max(...points.map((point) => point.y)) + 30
  pointer(graph, 'pointerdown', left, top, init)
  for (const [x, y] of [
    [right, top],
    [right, bottom],
    [left, bottom],
  ] as const) {
    pointer(graph, 'pointermove', x, y, init)
  }
  pointer(graph, 'pointerup', left, bottom - 1, init)
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  dom.restore()
})

describe('lasso modes', () => {
  it('draws a lasso from any drag without a key, and keeps the view', () => {
    const graph = mount({
      definition: definition({ lasso: { modifier: null } }),
      ariaLabel: 'graph',
    })
    const view = graph.store.get().view
    lasso(graph, ['a', 'b', 'c'])
    expect(graph.selection.get()).toEqual({ nodes: ['a', 'b', 'c'], edges: [] })
    expect(graph.store.get().view).toEqual(view)
  })

  it('still needs Shift by default', () => {
    const graph = mount({ definition: definition({ lasso: true }), ariaLabel: 'graph' })
    const view = graph.store.get().view
    lasso(graph, ['a', 'b', 'c'])
    expect(graph.selection.get().nodes).toEqual([])
    expect(graph.store.get().view).not.toEqual(view)
    lasso(graph, ['a', 'b', 'c'], { shiftKey: true })
    expect(graph.selection.get().nodes).toEqual(['a', 'b', 'c'])
  })

  it('takes the edges whose two ends are inside', () => {
    const graph = mount({
      definition: definition({ lasso: { modifier: null, edges: true } }),
      ariaLabel: 'graph',
    })
    lasso(graph, ['a', 'b', 'c'])
    expect(graph.selection.get()).toEqual({ nodes: ['a', 'b', 'c'], edges: ['ab', 'bc'] })
  })

  it('leaves hidden edges out of the lasso', () => {
    const graph = mount({
      definition: definition({ lasso: { modifier: null, edges: true } }),
      ariaLabel: 'graph',
    })
    graph.states.set('gone', { edges: ['ab'] })
    dom.flushFrames()
    lasso(graph, ['a', 'b', 'c'])
    expect(graph.selection.get().edges).toEqual(['bc'])
  })

  it('sends the edges to a controlled selection', () => {
    const asked: unknown[] = []
    const graph = mount({
      definition: definition({ lasso: { modifier: null, edges: true } }),
      ariaLabel: 'graph',
      selection: { nodes: [] },
      onSelectionChange: ({ selection }) => asked.push(selection),
    })
    lasso(graph, ['a', 'b', 'c'])
    expect(asked).toEqual([{ nodes: ['a', 'b', 'c'], edges: ['ab', 'bc'] }])
    expect(graph.selection.get().nodes).toEqual([])
  })

  it('cancels a lasso drawn without a key with Escape', () => {
    const graph = mount({
      definition: definition({ lasso: { modifier: null } }),
      ariaLabel: 'graph',
    })
    const a = screenOf(graph, 'a')
    pointer(graph, 'pointerdown', a.x - 40, a.y - 40)
    pointer(graph, 'pointermove', a.x + 300, a.y - 40)
    pointer(graph, 'pointermove', a.x + 300, a.y + 200)
    graph.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    pointer(graph, 'pointerup', a.x - 40, a.y + 200)
    expect(graph.selection.get().nodes).toEqual([])
    expect(graph.element.querySelector('svg')).toBeNull()
  })

  it('draws a lasso with one finger', () => {
    const graph = mount({
      definition: definition({ lasso: { modifier: null } }),
      ariaLabel: 'graph',
    })
    lasso(graph, ['a', 'b'], { pointerType: 'touch' })
    expect(graph.selection.get().nodes).toEqual(['a', 'b'])
  })

  it('still drags a node and clicks without a key', () => {
    const graph = mount({
      definition: definition({ lasso: { modifier: null } }),
      ariaLabel: 'graph',
    })
    const b = screenOf(graph, 'b')
    pointer(graph, 'pointerdown', b.x, b.y)
    pointer(graph, 'pointerup', b.x, b.y)
    expect(graph.selection.get().nodes).toEqual(['b'])
    const { zoom } = graph.store.get().view
    pointer(graph, 'pointerdown', b.x, b.y)
    pointer(graph, 'pointermove', b.x + 30, b.y)
    pointer(graph, 'pointerup', b.x + 30, b.y)
    expect(graph.positions.get('b')?.x).toBeCloseTo(100 + 30 / zoom, 3)
    expect(graph.element.querySelector('svg')).toBeNull()
  })

  it('switches mode through update at the next press', () => {
    const graph = mount({ definition: definition({ lasso: true }), ariaLabel: 'graph' })
    graph.update({ definition: definition({ lasso: { modifier: null } }) })
    lasso(graph, ['a', 'b', 'c'])
    expect(graph.selection.get().nodes).toEqual(['a', 'b', 'c'])
  })
})

describe('drag per node', () => {
  const fixed = items.map((item) => (item.id === 'a' ? { ...item, fixed: true } : item))

  it('pans the view from a node that cannot be dragged', () => {
    const graph = mount({ definition: definition({}, fixed), ariaLabel: 'graph' })
    const view = graph.store.get().view
    const a = screenOf(graph, 'a')
    const dragged: string[] = []
    graph.on('dragstart', () => dragged.push('start'))
    pointer(graph, 'pointerdown', a.x, a.y)
    pointer(graph, 'pointermove', a.x + 40, a.y)
    pointer(graph, 'pointerup', a.x + 40, a.y)
    expect(graph.positions.get('a')).toEqual({ x: -100, y: 0 })
    expect(graph.store.get().view).not.toEqual(view)
    expect(dragged).toEqual([])
    expect(graph.selection.get().nodes).toEqual([])
  })

  it('draws a lasso from a node that cannot be dragged', () => {
    const graph = mount({
      definition: definition({ lasso: true }, fixed),
      ariaLabel: 'graph',
    })
    const a = screenOf(graph, 'a')
    const c = screenOf(graph, 'c')
    pointer(graph, 'pointerdown', a.x, a.y, { shiftKey: true })
    pointer(graph, 'pointermove', a.x, c.y + 30, { shiftKey: true })
    pointer(graph, 'pointermove', c.x + 250, c.y + 30, { shiftKey: true })
    pointer(graph, 'pointermove', c.x + 250, a.y - 30, { shiftKey: true })
    pointer(graph, 'pointerup', a.x, a.y - 30, { shiftKey: true })
    expect(graph.selection.get().nodes).toEqual(['a', 'b', 'c'])
    expect(graph.positions.get('a')).toEqual({ x: -100, y: 0 })
  })

  it('moves the rest of a dragged selection', () => {
    const graph = mount({ definition: definition({}, fixed), ariaLabel: 'graph' })
    graph.selection.set({ nodes: ['a', 'b'] })
    const b = screenOf(graph, 'b')
    const { zoom } = graph.store.get().view
    pointer(graph, 'pointerdown', b.x, b.y)
    pointer(graph, 'pointermove', b.x + 50, b.y)
    pointer(graph, 'pointerup', b.x + 50, b.y)
    expect(graph.positions.get('a')).toEqual({ x: -100, y: 0 })
    expect(graph.positions.get('b')?.x).toBeCloseTo(100 + 50 / zoom, 3)
  })

  it('lets an unfolded group stay while its children move', () => {
    const grouped: Item[] = [
      { id: 'g', x: 0, y: 0 },
      { id: 'a', x: -50, y: 0, parent: 'g' },
      { id: 'b', x: 50, y: 0, parent: 'g' },
    ]
    const graph = mount({
      definition: defineGraph({
        marks: [
          nodes<Item>(grouped, {
            x: 'x',
            y: 'y',
            parent: 'parent',
            container: { drag: false, padding: 40 },
          }),
        ],
      }),
      ariaLabel: 'graph',
    })
    const b = screenOf(graph, 'b')
    const inside = { x: b.x + 25, y: b.y + 25 }
    const view = graph.store.get().view
    pointer(graph, 'pointerdown', inside.x, inside.y)
    pointer(graph, 'pointermove', inside.x + 40, inside.y)
    pointer(graph, 'pointerup', inside.x + 40, inside.y)
    expect(graph.positions.get('b')).toEqual({ x: 50, y: 0 })
    expect(graph.store.get().view).not.toEqual(view)
    const moved = screenOf(graph, 'b')
    const { zoom } = graph.store.get().view
    pointer(graph, 'pointerdown', moved.x, moved.y)
    pointer(graph, 'pointermove', moved.x + 40, moved.y)
    pointer(graph, 'pointerup', moved.x + 40, moved.y)
    expect(graph.positions.get('b')?.x).toBeCloseTo(50 + 40 / zoom, 3)
  })
})

describe('shown elements', () => {
  it('lists what is drawn, by the rules of count', () => {
    const graph = mount({ definition: definition(), ariaLabel: 'graph' })
    expect(graph.shown()).toEqual({ nodes: ['a', 'b', 'c', 'd'], edges: ['ab', 'bc', 'cd'] })
    expect(graph.shown()).toBe(graph.shown())
    graph.states.set('gone', { nodes: ['d'] })
    expect(graph.shown()).toEqual({ nodes: ['a', 'b', 'c'], edges: ['ab', 'bc'] })
    expect(graph.count().shown).toEqual({ nodes: 3, edges: 2 })
    expect(graph.isShown({ kind: 'node', key: 'd' })).toBe(false)
    expect(graph.isShown({ kind: 'edge', key: 'cd' })).toBe(false)
    expect(graph.isShown({ kind: 'edge', key: 'bc' })).toBe(true)
    expect(graph.isShown({ kind: 'node', key: 'nope' })).toBe(false)
  })

  it('gives folded groups and the members of merged edges', () => {
    const grouped: Item[] = [
      { id: 'g', x: 0, y: 0 },
      { id: 'a', x: -50, y: 0, parent: 'g' },
      { id: 'b', x: 50, y: 0, parent: 'g' },
      { id: 'c', x: 300, y: 0 },
    ]
    const wires: Link[] = [
      { id: 'ac', from: 'a', to: 'c' },
      { id: 'bc', from: 'b', to: 'c' },
      { id: 'ab', from: 'a', to: 'b' },
    ]
    const graph = mount({
      definition: defineGraph({
        marks: [
          edges<Link>(wires, { source: 'from', target: 'to' }),
          nodes<Item>(grouped, { x: 'x', y: 'y', parent: 'parent' }),
        ],
      }),
      ariaLabel: 'graph',
      initialFolded: ['g'],
    })
    expect(graph.shown()).toEqual({ nodes: ['g', 'c'], edges: ['ac', 'bc'] })
    expect(graph.count().shown).toEqual({ nodes: 2, edges: 1 })
    expect(graph.isShown({ kind: 'node', key: 'a' })).toBe(false)
    expect(graph.isShown({ kind: 'edge', key: 'bc' })).toBe(true)
    expect(graph.isShown({ kind: 'edge', key: 'ab' })).toBe(false)
  })
})

describe('refresh', () => {
  it('reads the given elements again, and only them', () => {
    const names = new Map<string, string>([['a', 'first']])
    const read: string[] = []
    const graph = mount({
      definition: defineGraph({
        marks: [
          nodes<Item>(items, {
            x: 'x',
            y: 'y',
            label: (item) => {
              read.push(item.id)
              return names.get(item.id) ?? item.id
            },
          }),
        ],
      }),
      ariaLabel: 'graph',
    })
    read.length = 0
    names.set('b', 'second')
    graph.refresh({ nodes: ['b', 'missing'] })
    dom.flushFrames()
    expect(read).toEqual(['b'])
    graph.refresh({})
    graph.refresh({ edges: ['nope'] })
    dom.flushFrames()
    expect(read).toEqual(['b'])
  })

  it('reads an edge again inside a merged edge', () => {
    const colors = new Map<string, string>()
    const wires: Link[] = [
      { id: 'ab1', from: 'a', to: 'b' },
      { id: 'ab2', from: 'a', to: 'b' },
    ]
    const read: string[] = []
    const graph = mount({
      definition: defineGraph({
        marks: [
          edges<Link>(wires, {
            source: 'from',
            target: 'to',
            merge: true,
            stroke: (wire) => {
              read.push(wire.id)
              return colors.get(wire.id) ?? 'gray'
            },
          }),
          nodes<Item>(items, { x: 'x', y: 'y' }),
        ],
      }),
      ariaLabel: 'graph',
    })
    read.length = 0
    graph.refresh({ edges: ['ab1'] })
    dom.flushFrames()
    expect(read).toContain('ab1')
  })
})

describe('aggregated edge identity', () => {
  it('keeps its id when its first edge leaves', () => {
    const wires: Link[] = [
      { id: 'ab1', from: 'a', to: 'b' },
      { id: 'ab2', from: 'a', to: 'b' },
      { id: 'ab3', from: 'a', to: 'b' },
    ]
    const make = (data: readonly Link[]) =>
      defineGraph({
        marks: [
          edges<Link>(data, { name: 'wires', source: 'from', target: 'to', merge: true }),
          nodes<Item>(items, { x: 'x', y: 'y' }),
        ],
      })
    const graph = mount({ definition: make(wires), ariaLabel: 'graph' })
    const middle = (graph: GraphInstance) => {
      const a = screenOf(graph, 'a')
      const b = screenOf(graph, 'b')
      return graph.pick({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    }
    const before = middle(graph) as GraphTarget & { aggregate?: AggregateEdge }
    expect(before?.aggregate?.id).toBe('["wires","a","b"]')
    graph.update({ definition: make(wires.slice(1)) })
    const after = middle(graph) as GraphTarget & { aggregate?: AggregateEdge }
    expect(after?.key).toBe('ab2')
    expect(after?.aggregate?.id).toBe(before?.aggregate?.id)
  })
})

describe('initialFolded as a function', () => {
  const grouped: Item[] = [
    { id: 'g', x: 0, y: 0 },
    { id: 'h', x: 300, y: 0 },
    { id: 'a', x: -50, y: 0, parent: 'g' },
    { id: 'b', x: 250, y: 0, parent: 'h' },
  ]
  const make = (data: readonly Item[]) =>
    defineGraph({ marks: [nodes<Item>(data, { x: 'x', y: 'y', parent: 'parent' })] })

  it('folds groups before their first frame, later ones too', () => {
    const asked: Key[] = []
    const graph = mount({
      definition: make(grouped),
      ariaLabel: 'graph',
      initialFolded: (group) => {
        asked.push(group.key)
        return group.key !== 'h'
      },
    })
    expect(graph.groups.folded()).toEqual(['g'])
    expect(graph.shown().nodes).toEqual(['g', 'h', 'b'])
    const changes: (readonly Key[])[] = []
    graph.on('foldchange', ({ folded }) => changes.push(folded))
    graph.update({
      definition: make([
        ...grouped,
        { id: 'k', x: 600, y: 0 },
        { id: 'c', x: 600, y: 0, parent: 'k' },
      ]),
    })
    dom.flushFrames()
    expect(graph.groups.folded()).toEqual(['g', 'k'])
    expect(graph.isShown({ kind: 'node', key: 'c' })).toBe(false)
    expect(changes).toEqual([['g', 'k']])
    graph.groups.unfold(['g'])
    graph.update({ definition: make(grouped) })
    dom.flushFrames()
    graph.update({
      definition: make([...grouped, { id: 'e', x: 0, y: 0, parent: 'g' }]),
    })
    dom.flushFrames()
    expect(graph.groups.folded()).toEqual(['k'])
    expect(graph.isShown({ kind: 'node', key: 'e' })).toBe(true)
    expect(asked).toEqual(['g', 'h', 'k'])
  })

  it('folds at once and asks a controlled graph to keep it', () => {
    const requests: (readonly Key[])[] = []
    const graph = mount({
      definition: make(grouped),
      ariaLabel: 'graph',
      folded: [],
      onFoldChange: ({ folded }) => requests.push(folded),
      initialFolded: () => true,
    })
    expect(graph.groups.folded()).toEqual(['g', 'h'])
    expect(requests).toEqual([['g', 'h']])
    graph.update({ folded: ['h'] })
    expect(graph.groups.folded()).toEqual(['h'])
  })

  it('reports an error of the function and leaves the group unfolded', () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (error: unknown) => reported.push(error))
    try {
      const graph = mount({
        definition: make(grouped),
        ariaLabel: 'graph',
        initialFolded: () => {
          throw new Error('boom')
        },
      })
      expect(graph.groups.folded()).toEqual([])
      expect(reported).toHaveLength(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('after destroy', () => {
  it('reads nothing and refreshes nothing', () => {
    const graph = mount({ definition: definition(), ariaLabel: 'graph' })
    graph.destroy()
    expect(graph.shown()).toEqual({ nodes: [], edges: [] })
    expect(graph.isShown({ kind: 'node', key: 'a' })).toBe(false)
    expect(() => graph.refresh({ nodes: ['a'] })).not.toThrow()
    expect(graph.drawsOnMap).toBe(false)
  })
})
