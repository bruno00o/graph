import { QueryClient } from '@tanstack/query-core'
import { queryOptions } from '@tanstack/react-query'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createGraphModel } from '../core/graph-model'
import { edges, nodes } from '../marks'
import type { Key, LiveSource, SourceChange } from '../types'
import { createExploration, type Exploration } from './index'

interface Item {
  readonly id: string
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const world = new Map<string, string[]>([
  ['a', ['b', 'c']],
  ['b', ['a', 'd']],
  ['c', ['a']],
  ['d', ['b']],
  ['e', ['a']],
])

const api = vi.fn(async (key: string) => {
  const around = world.get(key) ?? []
  return {
    nodes: [key, ...around].map((id): Item => ({ id })),
    edges: around.map(
      (other): Link => ({ id: [key, other].sort().join('-'), from: key, to: other }),
    ),
  }
})

const neighbors = (key: Key) =>
  queryOptions({ queryKey: ['neighbors', key], queryFn: () => api(String(key)) })

function watch<T>(source: LiveSource<T>) {
  const values = new Map<Key, T>()
  const subscription = source.subscribeChanges(
    (changes: ReadonlyArray<SourceChange<T>>) => {
      for (const change of changes) {
        if (change.type === 'delete') values.delete(change.key)
        else values.set(change.key, change.value)
      }
    },
    { includeInitialState: true },
  )
  return { keys: () => [...values.keys()].sort(), stop: () => subscription.unsubscribe() }
}

function setup() {
  const client = new QueryClient()
  const exploration = createExploration(client, { roots: ['a'], neighbors })
  return { client, exploration }
}

function watchBoth(exploration: Exploration<Item, Link>) {
  const seenNodes = watch(exploration.nodes)
  const seenEdges = watch(exploration.edges)
  return {
    nodes: seenNodes.keys,
    edges: seenEdges.keys,
    stop: () => {
      seenNodes.stop()
      seenEdges.stop()
    },
  }
}

afterEach(() => {
  api.mockClear()
  world.set('a', ['b', 'c'])
})

describe('createExploration', () => {
  it('infers element types from queryOptions', () => {
    const { exploration } = setup()
    expectTypeOf(exploration.nodes).toEqualTypeOf<LiveSource<Item>>()
    expectTypeOf(exploration.edges).toEqualTypeOf<LiveSource<Link>>()
  })

  it('fetches roots only once someone listens', async () => {
    const { exploration } = setup()
    expect(api).not.toHaveBeenCalled()
    const seen = watchBoth(exploration)
    await vi.waitFor(() => expect(seen.nodes()).toEqual(['a', 'b', 'c']))
    expect(seen.edges()).toEqual(['a-b', 'a-c'])
    expect(exploration.store.state.expanded).toEqual(['a'])
  })

  it('expands and collapses with provenance', async () => {
    const { exploration } = setup()
    const seen = watchBoth(exploration)
    await vi.waitFor(() => expect(seen.nodes()).toEqual(['a', 'b', 'c']))
    exploration.expand('b')
    await vi.waitFor(() => expect(seen.nodes()).toEqual(['a', 'b', 'c', 'd']))
    expect(seen.edges()).toEqual(['a-b', 'a-c', 'b-d'])
    exploration.collapse('b')
    expect(seen.nodes()).toEqual(['a', 'b', 'c'])
    expect(seen.edges()).toEqual(['a-b', 'a-c'])
    exploration.toggle('a')
    expect(seen.nodes()).toEqual(['a'])
    expect(seen.edges()).toEqual([])
    exploration.reset()
    await vi.waitFor(() => expect(seen.nodes()).toEqual(['a', 'b', 'c']))
  })

  it('keeps what another expansion still holds', async () => {
    const { exploration } = setup()
    const seen = watchBoth(exploration)
    exploration.expand('b')
    await vi.waitFor(() => expect(seen.nodes()).toEqual(['a', 'b', 'c', 'd']))
    exploration.collapse('a')
    expect(seen.nodes()).toEqual(['a', 'b', 'd'])
    expect(seen.edges()).toEqual(['a-b', 'b-d'])
  })

  it('keeps an expanded node its own response leaves out', async () => {
    const client = new QueryClient()
    const exploration = createExploration(client, {
      roots: ['a'],
      neighbors: (key) =>
        queryOptions({
          queryKey: ['outward', key],
          queryFn: async () =>
            key === 'a'
              ? { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'a-b', from: 'a', to: 'b' }] }
              : { nodes: [{ id: 'c' }], edges: [{ id: 'b-c', from: 'b', to: 'c' }] },
        }),
    })
    const seen = watchBoth(exploration)
    await vi.waitFor(() => expect(seen.nodes()).toEqual(['a', 'b']))
    exploration.expand('b')
    await vi.waitFor(() => expect(seen.nodes()).toEqual(['a', 'b', 'c']))
    exploration.collapse('a')
    expect(seen.nodes()).toEqual(['a', 'b', 'c'])
    expect(seen.edges()).toEqual(['b-c'])
    seen.stop()
  })

  it('follows invalidated queries', async () => {
    const { client, exploration } = setup()
    const seen = watchBoth(exploration)
    await vi.waitFor(() => expect(seen.nodes()).toEqual(['a', 'b', 'c']))
    world.set('a', ['b', 'e'])
    await client.invalidateQueries({ queryKey: ['neighbors', 'a'] })
    await vi.waitFor(() => expect(seen.nodes()).toEqual(['a', 'b', 'e']))
    expect(seen.edges()).toEqual(['a-b', 'a-e'])
  })

  it('reports loading and errors in its store', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const failing = createExploration(client, {
      roots: ['x'],
      neighbors: (key) =>
        queryOptions({
          queryKey: ['failing', key],
          queryFn: async (): Promise<{ nodes: Item[]; edges: Link[] }> => {
            throw new Error('offline')
          },
        }),
    })
    const seen = watchBoth(failing)
    expect(failing.store.state.loading).toEqual(['x'])
    await vi.waitFor(() => expect(failing.store.state.errors.get('x')).toBeInstanceOf(Error))
    expect(failing.store.state.loading).toEqual([])
    seen.stop()
  })

  it('retries a failed expansion and clears its error meanwhile', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let online = false
    const fetches = vi.fn(async (key: string) => {
      if (!online) throw new Error('offline')
      return { nodes: [{ id: key }, { id: `${key}1` }], edges: [] as Link[] }
    })
    const flaky = createExploration(client, {
      roots: ['x'],
      neighbors: (key) =>
        queryOptions({
          queryKey: ['flaky', key],
          queryFn: () => fetches(String(key)),
          staleTime: Number.POSITIVE_INFINITY,
        }),
    })
    flaky.retry('x')
    const seen = watchBoth(flaky)
    await vi.waitFor(() => expect(flaky.store.state.errors.has('x')).toBe(true))
    flaky.retry('nothing')
    flaky.retry('x')
    expect(flaky.store.state.errors.has('x')).toBe(false)
    await vi.waitFor(() => expect(flaky.store.state.errors.has('x')).toBe(true))
    expect(fetches).toHaveBeenCalledTimes(2)
    seen.stop()
    online = true
    flaky.retry('x')
    expect(flaky.store.state.errors.has('x')).toBe(false)
    expect(fetches).toHaveBeenCalledTimes(2)
    const again = watchBoth(flaky)
    await vi.waitFor(() => expect(again.nodes()).toEqual(['x', 'x1']))
    expect(flaky.store.state.errors.has('x')).toBe(false)
    expect(fetches).toHaveBeenCalledTimes(3)
    again.stop()
  })

  it('pauses without listeners and resumes from the cache', async () => {
    const { exploration } = setup()
    const first = watchBoth(exploration)
    await vi.waitFor(() => expect(first.nodes()).toEqual(['a', 'b', 'c']))
    first.stop()
    exploration.expand('b')
    expect(api).toHaveBeenCalledTimes(1)
    const second = watchBoth(exploration)
    expect(second.nodes()).toEqual(['a', 'b', 'c'])
    await vi.waitFor(() => expect(second.nodes()).toEqual(['a', 'b', 'c', 'd']))
  })

  it('feeds graph marks as live sources', async () => {
    const { exploration } = setup()
    const schedule = vi.fn()
    const model = createGraphModel({ schedule })
    model.setMarks([
      edges(exploration.edges, { source: 'from', target: 'to' }),
      nodes(exploration.nodes, {}),
    ])
    await vi.waitFor(() => expect(schedule).toHaveBeenCalled())
    await vi.waitFor(() => expect(model.flush().nodes.added.length).toBeGreaterThan(0))
    expect(model.neighbors('a').sort()).toEqual(['b', 'c'])
    model.destroy()
  })
})
