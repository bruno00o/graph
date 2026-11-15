import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { grid } from '../layouts'
import { mountMapGraph } from '../map'
import { edges, groups, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import { LoadingSource } from '../testing/loading-source'
import { fakeMap } from '../testing/map'
import type { Key, Layout, LayoutGraph, LayoutListener, Mark, Point } from '../types'
import { createGraphHost, type GraphInstance, type MountGraphOptions } from './mount-graph'

vi.mock('../webgl/renderer', () => ({
  createWebglRenderer: () => fakeRenderer(),
  createSharedRenderer: () => fakeRenderer(),
}))

interface Item {
  readonly id: string
  readonly parent?: string
  readonly x?: number
  readonly y?: number
  readonly zone?: string
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

interface FakeRun {
  readonly graph: LayoutGraph
  readonly listener: LayoutListener
}

function fakeLayout(name = 'fake') {
  const runs: FakeRun[] = []
  const layout: Layout = {
    name,
    options: {},
    start(graph, listener) {
      runs.push({ graph, listener })
      return { pin: () => {}, stop: () => {} }
    },
  }
  return { layout, runs }
}

function movers(run: FakeRun | undefined): number[] {
  return Array.from(run?.graph.movable ?? []).flatMap((flag, index) => (flag === 1 ? [index] : []))
}

const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
]

const loose: Item[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

const snapshot = new Map<Key, Point>([
  ['a', { x: -300, y: 40 }],
  ['b', { x: 100, y: 40 }],
  ['c', { x: 500, y: 40 }],
])

let dom: FakeDom

function mount(
  marks: readonly Mark[],
  options: Partial<MountGraphOptions> & { layout?: Layout | null; waitForData?: number } = {},
): GraphInstance {
  const { layout = null, waitForData, ...rest } = options
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: defineGraph({
        marks,
        layout,
        transitions: { layout: 0 },
        ...(waitForData === undefined ? {} : { waitForData }),
      }),
      ariaLabel: 'graphe',
      ...rest,
    },
    fakeRenderer,
  )
  dom.flushFrames()
  return graph
}

function plain(items: readonly Item[] = loose): Mark[] {
  return [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Item>(items, { x: 'x', y: 'y' }),
  ]
}

function events(graph: GraphInstance): string[] {
  const seen: string[] = []
  for (const name of ['layoutstart', 'layoutend', 'positionchange'] as const) {
    graph.on(name, () => seen.push(name))
  }
  return seen
}

beforeEach(() => {
  dom = installDom()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  dom.restore()
})

describe('initialPositions', () => {
  it('draws the nodes where the entries say, with no layout, event or write', () => {
    const { layout, runs } = fakeLayout()
    const container = document.createElement('div')
    document.body.append(container)
    const seen: string[] = []
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({ marks: plain(), layout }),
        ariaLabel: 'graphe',
        initialPositions: snapshot,
      },
      fakeRenderer,
    )
    for (const name of ['layoutstart', 'layoutend', 'positionchange'] as const) {
      graph.on(name, () => seen.push(name))
    }
    dom.flushFrames()
    expect(runs).toHaveLength(0)
    expect(seen).toEqual([])
    expect(graph.store.get().layout).toEqual({ running: false, progress: 0 })
    for (const [key, point] of snapshot) expect(graph.positions.get(key)).toEqual(point)
    graph.destroy()
  })

  it('accepts what positions.snapshot returns, so a snapshot round-trips', () => {
    const first = mount(plain(), { layout: fakeLayout().layout })
    first.positions.set([['a', { x: 7, y: 8 }]])
    const taken = first.positions.snapshot()
    const { layout, runs } = fakeLayout()
    const second = mount(plain(), { layout, initialPositions: taken })
    expect(runs).toHaveLength(0)
    expect(second.positions.snapshot()).toEqual(taken)
    first.destroy()
    second.destroy()
  })

  it('accepts any iterable of entries', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(plain(), {
      layout,
      initialPositions: [...snapshot].map(([key, point]) => [key, point] as const),
    })
    expect(runs).toHaveLength(0)
    expect(graph.positions.get('b')).toEqual({ x: 100, y: 40 })
    graph.destroy()
  })

  it('frames the restored positions on the first frame, without waiting for a layout', () => {
    const { layout } = fakeLayout()
    const graph = mount(plain(), { layout, initialPositions: snapshot })
    const view = graph.view.get()
    expect(view.x).toBeCloseTo(100)
    expect(view.y).toBeCloseTo(40)
    expect(view.zoom).toBeGreaterThan(0)
    const state = graph.store.get()
    expect(state.view.zoom).toBeLessThan(2)
    graph.destroy()
  })

  it('does not move the view of an initialView', () => {
    const { layout } = fakeLayout()
    const graph = mount(plain(), {
      layout,
      initialPositions: snapshot,
      initialView: { x: 5, y: 6, zoom: 2 },
    })
    expect(graph.view.get()).toEqual({ x: 5, y: 6, zoom: 2 })
    graph.destroy()
  })

  it('keeps the positions of the data over the entries', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(plain([{ id: 'a', x: 1, y: 2 }, { id: 'b' }, { id: 'c' }]), {
      layout,
      initialPositions: snapshot,
    })
    expect(runs).toHaveLength(0)
    expect(graph.positions.get('a')).toEqual({ x: 1, y: 2 })
    expect(graph.positions.get('b')).toEqual({ x: 100, y: 40 })
    graph.update({
      definition: defineGraph({ marks: plain([{ id: 'a' }, { id: 'b' }, { id: 'c' }]), layout }),
    })
    dom.flushFrames()
    expect(graph.positions.get('a')).toEqual({ x: 1, y: 2 })
    graph.destroy()
  })

  it('lays out the nodes with no entry as arrivals, the placed ones staying put', () => {
    const { layout, runs } = fakeLayout()
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({ marks: plain([...loose, { id: 'd' }]), layout }),
        ariaLabel: 'graphe',
        initialPositions: snapshot,
      },
      fakeRenderer,
    )
    const seen: string[] = []
    graph.on('layoutstart', () => seen.push('layoutstart'))
    dom.flushFrames()
    expect(runs).toHaveLength(1)
    expect(seen).toEqual(['layoutstart'])
    const run = runs[0]
    const index = (key: string) =>
      graph.positions.get(key) && Array.from(run?.graph.keys ?? []).indexOf(key)
    expect(movers(run)).toEqual([index('d')])
    expect(run?.graph.xy[(index('a') ?? 0) * 2]).toBe(-300)
    graph.destroy()
  })

  it('places an arrival near its restored neighbors', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(
      [
        edges<Link>([{ id: 'cd', from: 'c', to: 'd' }], { source: 'from', target: 'to' }),
        nodes<Item>([...loose, { id: 'd' }], { x: 'x', y: 'y' }),
      ],
      { layout, initialPositions: snapshot },
    )
    expect(runs).toHaveLength(1)
    const d = graph.positions.get('d')
    expect(Math.hypot((d?.x ?? 0) - 500, (d?.y ?? 0) - 40)).toBeLessThan(100)
    graph.destroy()
  })

  it('runs the layout on every node when no key of the entries arrives', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(plain(), {
      layout,
      initialPositions: [['nobody', { x: 1, y: 1 }]],
    })
    expect(runs).toHaveLength(1)
    expect(movers(runs[0])).toEqual([0, 1, 2])
    graph.destroy()
  })

  it('ignores entries that are not finite and warns in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { layout, runs } = fakeLayout()
    const graph = mount(plain(), {
      layout,
      initialPositions: [
        ['a', { x: Number.NaN, y: 1 }],
        ['b', { x: 1, y: Number.POSITIVE_INFINITY }],
        ['c', { x: 3, y: 4 }],
      ],
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('initialPositions skipped 2 entries'))
    expect(graph.positions.get('c')).toEqual({ x: 3, y: 4 })
    expect(runs).toHaveLength(1)
    expect(movers(runs[0])).toEqual([0, 1])
    graph.destroy()
  })

  it('runs a full layout when a later definition changes the layout', () => {
    const first = fakeLayout()
    const graph = mount(plain(), { layout: first.layout, initialPositions: snapshot })
    expect(first.runs).toHaveLength(0)
    const next = fakeLayout('other')
    graph.update({
      definition: defineGraph({ marks: plain([...loose, { id: 'd' }]), layout: next.layout }),
    })
    dom.flushFrames()
    expect(next.runs).toHaveLength(1)
    expect(movers(next.runs[0])).toEqual([0, 1, 2, 3])
    graph.destroy()
  })

  it('keeps the placed nodes when the same layout comes back in a new definition', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(plain(), { layout, initialPositions: snapshot })
    graph.update({
      definition: defineGraph({ marks: plain(), layout: { ...layout, options: {} } }),
    })
    dom.flushFrames()
    expect(runs).toHaveLength(0)
    graph.destroy()
  })

  it('lets layout.run lay out the restored nodes like any others', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(plain(), { layout, initialPositions: snapshot })
    void graph.layout.run()
    expect(runs).toHaveLength(1)
    expect(movers(runs[0])).toEqual([0, 1, 2])
    graph.destroy()
  })

  it('moves the restored nodes when a layout that is not incremental gets an arrival', async () => {
    const marks = (items: readonly Item[]) => [nodes<Item>(items, { x: 'x', y: 'y' })]
    const container = document.createElement('div')
    document.body.append(container)
    const graph = createGraphHost(
      container,
      {
        definition: defineGraph({
          marks: marks(loose),
          layout: grid(),
          transitions: { layout: 0 },
        }),
        ariaLabel: 'graphe',
        initialPositions: snapshot,
      },
      fakeRenderer,
    )
    dom.flushFrames()
    await Promise.resolve()
    expect(graph.positions.get('a')).toEqual({ x: -300, y: 40 })
    graph.update({
      definition: defineGraph({
        marks: marks([...loose, { id: 'd' }]),
        layout: grid(),
        transitions: { layout: 0 },
      }),
    })
    dom.flushFrames()
    await vi.waitFor(() => {
      dom.flushFrames()
      expect(graph.positions.get('a')).not.toEqual({ x: -300, y: 40 })
    })
    graph.destroy()
  })

  it('is read once: update does not take it', () => {
    const graph = mount(plain(), { initialPositions: snapshot })
    // @ts-expect-error
    graph.update({ initialPositions: [['a', { x: 1, y: 1 }]] })
    dom.flushFrames()
    expect(graph.positions.get('a')).toEqual({ x: -300, y: 40 })
    graph.destroy()
  })

  it('writes nothing to a persistPositions-style listener and sets no pin', () => {
    const { layout, runs } = fakeLayout()
    const graph = mount(plain(), { layout, initialPositions: snapshot })
    const seen = events(graph)
    dom.flushFrames()
    expect(seen).toEqual([])
    expect(runs).toHaveLength(0)
    graph.destroy()
  })

  describe('with waitForData', () => {
    it('places the nodes of the first batch and lays out later ones once loaded', () => {
      const { layout, runs } = fakeLayout()
      const live = new LoadingSource<Item>()
      const graph = mount([nodes(live)], { layout, initialPositions: snapshot })
      live.add({ id: 'a' })
      live.add({ id: 'b' })
      live.add({ id: 'z' })
      dom.flushFrames()
      expect(runs).toHaveLength(0)
      expect(graph.positions.get('a')).toEqual({ x: -300, y: 40 })
      expect(graph.positions.get('b')).toEqual({ x: 100, y: 40 })
      live.add({ id: 'y' })
      dom.flushFrames()
      expect(runs).toHaveLength(0)
      live.set('ready')
      dom.flushFrames()
      expect(runs).toHaveLength(1)
      const keys = Array.from(runs[0]?.graph.keys ?? [])
      expect(
        movers(runs[0])
          .map((index) => keys[index])
          .sort(),
      ).toEqual(['y', 'z'])
      graph.destroy()
    })

    it('never runs a layout when every node is restored', () => {
      const { layout, runs } = fakeLayout()
      const live = new LoadingSource<Item>()
      const graph = mount([nodes(live)], { layout, initialPositions: snapshot })
      for (const id of ['a', 'b', 'c']) live.add({ id })
      dom.flushFrames()
      live.set('ready')
      dom.flushFrames()
      expect(runs).toHaveLength(0)
      expect(graph.positions.get('c')).toEqual({ x: 500, y: 40 })
      graph.destroy()
    })

    it('uses the entries of keys that arrive in a later batch', () => {
      const { layout, runs } = fakeLayout()
      const live = new LoadingSource<Item>()
      const graph = mount([nodes(live)], { layout, initialPositions: snapshot })
      live.add({ id: 'z' })
      dom.flushFrames()
      live.add({ id: 'a' })
      dom.flushFrames()
      expect(graph.positions.get('a')).toEqual({ x: -300, y: 40 })
      live.set('ready')
      dom.flushFrames()
      expect(runs).toHaveLength(1)
      const keys = Array.from(runs[0]?.graph.keys ?? [])
      expect(movers(runs[0]).map((index) => keys[index])).toEqual(['z'])
      graph.destroy()
    })

    it('stops waiting when the time is up and lays out what has no entry', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const { layout, runs } = fakeLayout()
      const live = new LoadingSource<Item>()
      const graph = mount([nodes(live)], { layout, initialPositions: snapshot, waitForData: 500 })
      live.add({ id: 'a' })
      live.add({ id: 'z' })
      dom.flushFrames()
      expect(runs).toHaveLength(0)
      vi.advanceTimersByTime(500)
      dom.flushFrames()
      expect(runs).toHaveLength(1)
      const keys = Array.from(runs[0]?.graph.keys ?? [])
      expect(movers(runs[0]).map((index) => keys[index])).toEqual(['z'])
      graph.destroy()
    })
  })

  describe('with groups', () => {
    const members: Item[] = [
      { id: 'g' },
      { id: 'a', parent: 'g' },
      { id: 'b', parent: 'g' },
      { id: 'c' },
    ]
    const restored = new Map<Key, Point>([
      ['g', { x: 900, y: 900 }],
      ['a', { x: -200, y: 0 }],
      ['b', { x: -100, y: 0 }],
      ['c', { x: 300, y: 0 }],
    ])

    function grouped(options: Partial<MountGraphOptions> = {}) {
      const { layout } = fakeLayout()
      return mount([nodes<Item>(members, { x: 'x', y: 'y', parent: 'parent' })], {
        layout,
        initialFolded: ['g'],
        initialPositions: restored,
        ...options,
      })
    }

    it('keeps a folded group where it was, and its members where they were for unfolding', () => {
      const graph = grouped()
      expect(graph.positions.get('g')).toEqual({ x: 900, y: 900 })
      graph.groups.unfold(['g'])
      dom.flushFrames()
      expect(graph.positions.get('a')).toEqual({ x: -200, y: 0 })
      expect(graph.positions.get('b')).toEqual({ x: -100, y: 0 })
      expect(graph.positions.get('c')).toEqual({ x: 300, y: 0 })
      graph.destroy()
    })

    it('runs no layout for the hidden members', () => {
      const { layout, runs } = fakeLayout()
      const graph = mount([nodes<Item>(members, { x: 'x', y: 'y', parent: 'parent' })], {
        layout,
        initialFolded: ['g'],
        initialPositions: restored,
      })
      graph.groups.unfold(['g'])
      dom.flushFrames()
      expect(runs).toHaveLength(0)
      graph.destroy()
    })
  })

  describe('with spread members', () => {
    const stacked: Item[] = [
      { id: 'a', zone: 'z' },
      { id: 'b', zone: 'z' },
      { id: 'c', zone: 'z' },
    ]
    const entries = new Map<Key, Point>(stacked.map((item) => [item.id, { x: 0, y: 0 }]))

    function zoned(items: readonly Item[], options: Partial<MountGraphOptions>) {
      return mount(
        [
          nodes(items, { x: 'x', y: 'y', name: 'items', size: 10, units: 'screen' }),
          groups(items, { by: 'zone', name: 'zones', size: 30 }),
        ],
        options,
      )
    }

    it('does not spread members that were restored, so a snapshot of a spread stays exact', () => {
      const graph = zoned(stacked, { initialPositions: entries })
      graph.groups.unfold([graph.groups.keyOf('zones', 'z')])
      dom.flushFrames()
      for (const id of ['a', 'b', 'c']) expect(graph.positions.get(id)).toEqual({ x: 0, y: 0 })
      graph.destroy()
    })

    it('spreads members the data stacks, as before', () => {
      const graph = zoned(
        stacked.map((item) => ({ ...item, x: 0, y: 0 })),
        {},
      )
      graph.groups.unfold([graph.groups.keyOf('zones', 'z')])
      dom.flushFrames()
      const a = graph.positions.get('a')
      const b = graph.positions.get('b')
      expect(a).not.toEqual(b)
      graph.destroy()
    })
  })

  describe('on a map', () => {
    interface Place {
      readonly id: string
      readonly longitude?: number
      readonly latitude?: number
    }

    it('places the nodes without coordinates where the entries say, keeping the coordinates', () => {
      const { map } = fakeMap()
      const graph = mountMapGraph(map, {
        definition: defineGraph({
          marks: [
            nodes<Place>(
              [{ id: 'a', longitude: 2.35, latitude: 48.86 }, { id: 'b' }, { id: 'c' }],
              {
                longitude: (place) => place.longitude,
                latitude: (place) => place.latitude,
                size: 10,
              },
            ),
          ],
          layout: null,
        }),
        ariaLabel: 'carte',
        initialPositions: [
          ['a', { x: 1, y: 1 }],
          ['b', { x: 300, y: 200 }],
        ],
      })
      const seen: string[] = []
      graph.on('positionchange', () => seen.push('positionchange'))
      dom.flushFrames()
      expect(graph.positions.get('b')).toEqual({ x: 300, y: 200 })
      expect(graph.positions.get('a')?.x).not.toBe(1)
      expect(seen).toEqual([])
      graph.destroy()
    })
  })
})
