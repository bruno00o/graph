import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { grid } from '../layouts'
import { edges, groups, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { Key, NodeGroup, NodeMark, SourceChange } from '../types'
import { createGraphHost } from './mount-graph'

interface Item {
  readonly id: string
  readonly zone: string
  readonly x: number
  readonly y: number
  readonly area?: string
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const items: Item[] = [
  { id: 'a', zone: 'north', x: -200, y: -100 },
  { id: 'b', zone: 'north', x: -100, y: -100 },
  { id: 'c', zone: 'south', x: 100, y: 100 },
  { id: 'd', zone: 'south', x: 200, y: 100 },
  { id: 'e', zone: 'east', x: 300, y: -200 },
]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'ac', from: 'a', to: 'c' },
  { id: 'bd', from: 'b', to: 'd' },
  { id: 'ce', from: 'c', to: 'e' },
]

const zones = (options: { min?: number; folded?: boolean } = {}) =>
  groups(items, {
    by: 'zone',
    name: 'zones',
    size: (group) => 10 + group.count * 10,
    ...options,
  })

function define(grouped: ReturnType<typeof zones> | null) {
  return defineGraph({
    marks: [
      edges(links, {
        source: 'from',
        target: 'to',
        name: 'links',
        aggregate: { width: (aggregate) => aggregate.count },
      }),
      nodes(items, { x: 'x', y: 'y', name: 'items' }),
      ...(grouped ? [grouped] : []),
    ],
  })
}

let dom: FakeDom

function mount(grouped: ReturnType<typeof zones> | null = zones()) {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: define(grouped), ariaLabel: 'graph' },
    () => fakeRenderer(),
  )
  graph.view.set({ x: 0, y: 0, zoom: 1 })
  dom.flushFrames()
  return graph
}

type Graph = ReturnType<typeof mount>

const groupOf = (graph: Graph, zone: string) =>
  graph.groups.folded().find((key) => String(key).endsWith(`s${zone}`)) as Key

describe('groups()', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('adds one folded group node per value and merges the edges between groups', () => {
    const graph = mount()
    expect(graph.groups.folded()).toHaveLength(3)
    const north = groupOf(graph, 'north')
    const south = groupOf(graph, 'south')
    expect(graph.groups.children(north)).toEqual(['a', 'b'])
    const at = graph.positions.get(north)
    expect(at?.x).toBeCloseTo(-150)
    const picked = graph.pick(graph.view.toScreen(at ?? { x: 0, y: 0 }))
    expect(picked?.kind === 'node' && picked.mark === undefined).toBe(false)
    const datum = picked?.kind === 'node' ? (picked.datum as NodeGroup<Item>) : null
    expect(datum).toMatchObject({ value: 'north', count: 2, keys: ['a', 'b'] })
    const southAt = graph.positions.get(south) ?? { x: 0, y: 0 }
    const middle = graph.view.toScreen({
      x: ((at?.x ?? 0) + southAt.x) / 2,
      y: ((at?.y ?? 0) + southAt.y) / 2,
    })
    const merged = graph.pick(middle)
    expect(merged?.kind === 'edge' ? merged.aggregate?.count : 0).toBe(2)
  })

  it('finds the key and the item of a group by its value', () => {
    const graph = mount()
    const north = graph.groups.keyOf('zones', 'north')
    expect(north).toBe(groupOf(graph, 'north'))
    expect(graph.groups.keyOf('zones', 'west')).not.toBe(north)
    expect(graph.groups.keyOf('zone', 'north')).not.toBe(north)
    const group = graph.datumOf({ kind: 'node', key: north })
    expect(group).toMatchObject({ value: 'north', count: 2, keys: ['a', 'b'] })
    expect(
      graph.datumOf({ kind: 'node', key: graph.groups.keyOf('zones', 'west') }),
    ).toBeUndefined()
    expectTypeOf(group).toEqualTypeOf<Item | NodeGroup<Item> | undefined>()
    expectTypeOf(graph.datumOf({ kind: 'edge', key: 'ab' })).toEqualTypeOf<Link | undefined>()
    const unnamed = groups(items, { by: 'zone' })
    const plain = createGraphHost(
      document.body.appendChild(document.createElement('div')),
      { definition: defineGraph({ marks: [nodes(items), unnamed] }), ariaLabel: 'graph' },
      () => fakeRenderer(),
    )
    dom.flushFrames()
    expect(plain.groups.parent('a')).toBe(plain.groups.keyOf('zone', 'north'))
  })

  it('unfolds one group and ungroups when the mark leaves', () => {
    const graph = mount()
    const north = groupOf(graph, 'north')
    graph.groups.unfold([north])
    dom.flushFrames()
    expect(graph.groups.isFolded(north)).toBe(false)
    expect(graph.pick(graph.view.toScreen({ x: -200, y: -100 }))?.key).toBe('a')
    graph.update({ definition: define(null) })
    dom.flushFrames()
    expect(graph.groups.parent('a')).toBeUndefined()
    expect(graph.pick(graph.view.toScreen({ x: 100, y: 100 }))?.key).toBe('c')
    graph.update({ definition: define(zones()) })
    dom.flushFrames()
    expect(graph.groups.parent('a')).toBe(north)
  })

  it('leaves small groups out and can start unfolded', () => {
    const graph = mount(zones({ min: 2, folded: false }))
    expect(graph.groups.folded()).toEqual([])
    expect(graph.groups.parent('e')).toBeUndefined()
    expect(graph.groups.parent('a')).toBeDefined()
  })

  it('runs the layout again after a fold with relayout', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const loose = items.map(({ x: _x, y: _y, ...item }) => item)
    const define = (relayout: boolean) =>
      defineGraph({
        marks: [nodes(loose), groups(loose, { by: 'zone', folded: false })],
        layout: grid(),
        relayout,
      })
    const graph = createGraphHost(
      container,
      { definition: define(false), ariaLabel: 'graph' },
      () => fakeRenderer(),
    )
    dom.flushFrames()
    const starts: string[] = []
    graph.on('layoutstart', ({ name }) => starts.push(name))
    graph.groups.fold([graph.groups.parent('a') as Key])
    dom.flushFrames()
    expect(starts).toEqual([])
    graph.update({ definition: define(true) })
    graph.groups.unfold()
    dom.flushFrames()
    expect(starts).toEqual(['grid'])
  })

  it('types the group nodes in the marks', () => {
    const mark = groups(items, { by: 'zone', name: 'zones' })
    expectTypeOf(mark).toEqualTypeOf<NodeMark<NodeGroup<Item>, 'zones', undefined>>()
    // @ts-expect-error
    groups(items, { by: 'missing' })
  })

  it('follows a live source', () => {
    const listeners: ((changes: SourceChange<Item>[]) => void)[] = []
    const emit = (changes: SourceChange<Item>[]) => {
      for (const listener of listeners) listener(changes)
    }
    const live = {
      subscribeChanges(callback: (changes: SourceChange<Item>[]) => void) {
        listeners.push(callback)
        callback(items.map((item) => ({ type: 'insert' as const, key: item.id, value: item })))
        return { unsubscribe: () => {} }
      },
    }
    const container = document.createElement('div')
    document.body.append(container)
    const definition = defineGraph({
      marks: [nodes(live, { x: 'x', y: 'y' }), groups(live, { by: 'zone', min: 2, folded: false })],
    })
    const graph = createGraphHost(container, { definition, ariaLabel: 'graph' }, () =>
      fakeRenderer(),
    )
    dom.flushFrames()
    expect(graph.groups.parent('e')).toBeUndefined()
    const moved: Item = { id: 'f', zone: 'east', x: 0, y: 0 }
    emit([{ type: 'insert', key: 'f', value: moved }])
    dom.flushFrames()
    expect(graph.groups.parent('e')).toBeDefined()
    expect(graph.groups.children(graph.groups.parent('e') as Key).sort()).toEqual(['e', 'f'])
  })
})
