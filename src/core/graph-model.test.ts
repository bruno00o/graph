import { describe, expect, it, vi } from 'vitest'
import { edges, nodes } from '../marks'
import type { Key, LiveSource, SourceChange } from '../types'
import { createGraphModel, type ElementRef } from './graph-model'

type Item = { id: string; group: string }
type Link = { id: string; from: string; to: string }

const item = (id: string, group = 'a'): Item => ({ id, group })
const link = (id: string, from: string, to: string): Link => ({ id, from, to })
const keys = (refs: readonly ElementRef[]): Key[] => refs.map((ref) => ref.key)

const linkOptions = { source: 'from', target: 'to' } as const

function createLiveSource<T>(initial: SourceChange<T>[] = []) {
  let listener: ((changes: ReadonlyArray<SourceChange<T>>) => void) | null = null
  const source: LiveSource<T> = {
    subscribeChanges(callback, options) {
      listener = callback
      if (options?.includeInitialState) callback(initial)
      return {
        unsubscribe() {
          listener = null
        },
      }
    },
  }
  return {
    source,
    emit(changes: SourceChange<T>[]) {
      listener?.(changes)
    },
    get subscribed() {
      return listener !== null
    },
  }
}

describe('createGraphModel', () => {
  it('adds nodes and edges with dense indices', () => {
    const model = createGraphModel()
    model.setMarks([
      nodes([item('a'), item('b'), item('c')]),
      edges([link('ab', 'a', 'b'), link('bc', 'b', 'c')], linkOptions),
    ])
    const changes = model.flush()
    expect(changes.nodes.added).toEqual([
      { key: 'a', index: 0 },
      { key: 'b', index: 1 },
      { key: 'c', index: 2 },
    ])
    expect(changes.edges.added).toEqual([
      { key: 'ab', index: 0 },
      { key: 'bc', index: 1 },
    ])
    expect(model.edge('ab')).toMatchObject({ source: 'a', target: 'b' })
    expect([...model.nodes()].map((node) => node.key)).toEqual(['a', 'b', 'c'])
  })

  it('reconciles new data by key and keeps indices', () => {
    const model = createGraphModel()
    const b = item('b')
    model.setMarks([nodes([item('a'), b, item('c')])])
    model.flush()
    model.setMarks([nodes([b, item('c', 'z'), item('d')])])
    const changes = model.flush()
    expect(keys(changes.nodes.removed)).toEqual(['a'])
    expect(changes.nodes.updated).toEqual([{ key: 'c', index: 2 }])
    expect(keys(changes.nodes.added)).toEqual(['d'])
    expect(model.node('b')?.index).toBe(1)
  })

  it('reports nothing when a definition is rebuilt from the same data', () => {
    const model = createGraphModel()
    const data = [item('a'), item('b')]
    const links = [link('ab', 'a', 'b')]
    model.setMarks([nodes(data, { color: 'group' }), edges(links, linkOptions)])
    model.flush()
    const nodeMark = nodes(data, { color: 'group' })
    model.setMarks([nodeMark, edges(links, linkOptions)])
    const changes = model.flush()
    expect(changes.nodes).toEqual({ added: [], updated: [], removed: [] })
    expect(changes.edges).toEqual({ added: [], updated: [], removed: [], pending: [] })
    expect(model.node('a')?.mark).toBe(nodeMark)
  })

  it('updates every element of a mark whose options change', () => {
    const model = createGraphModel()
    const data = [item('a'), item('b')]
    model.setMarks([nodes(data, { color: 'group' })])
    model.flush()
    model.setMarks([nodes(data, { color: 'id' })])
    expect(keys(model.flush().nodes.updated)).toEqual(['a', 'b'])
  })

  it('keeps an edge pending until both endpoints exist', () => {
    const model = createGraphModel()
    const links = edges([link('ab', 'a', 'b')], linkOptions)
    model.setMarks([nodes([item('a')]), links])
    const first = model.flush()
    expect(first.edges.added).toEqual([])
    expect(first.edges.pending).toEqual(['ab'])
    expect(model.pendingEdges()).toEqual(['ab'])
    expect(model.edge('ab')).toBeUndefined()

    model.setMarks([nodes([item('a'), item('b')]), links])
    const second = model.flush()
    expect(second.edges.added).toEqual([{ key: 'ab', index: 0 }])
    expect(second.edges.pending).toEqual([])
    expect(model.pendingEdges()).toEqual([])
  })

  it('makes edges pending when an endpoint disappears', () => {
    const model = createGraphModel()
    const links = edges([link('ab', 'a', 'b'), link('bb', 'b', 'b')], linkOptions)
    model.setMarks([nodes([item('a'), item('b')]), links])
    model.flush()
    model.setMarks([nodes([item('a')]), links])
    const changes = model.flush()
    expect(keys(changes.nodes.removed)).toEqual(['b'])
    expect(keys(changes.edges.removed)).toEqual(['ab', 'bb'])
    expect(changes.edges.pending).toEqual(['ab', 'bb'])
    expect(model.edgesOf('a')).toEqual([])
  })

  it('moves an edge whose endpoints change', () => {
    const model = createGraphModel()
    const data = nodes([item('a'), item('b'), item('c')])
    model.setMarks([data, edges([link('e', 'a', 'b')], linkOptions)])
    model.flush()
    model.setMarks([data, edges([link('e', 'a', 'c')], linkOptions)])
    const changes = model.flush()
    expect(changes.edges.updated).toEqual([{ key: 'e', index: 0 }])
    expect(model.endpoints('e')).toEqual({ source: 'a', target: 'c' })
    expect(model.neighbors('b')).toEqual([])
    expect(model.neighbors('c')).toEqual(['a'])
  })

  it('reports missing and duplicate keys and keeps the first owner', () => {
    const model = createGraphModel()
    const first = item('a', 'first')
    const unkeyed = { group: 'x' } as unknown as Item
    model.setMarks([nodes([first, item('a', 'second'), unkeyed]), nodes([item('a', 'third')])])
    const changes = model.flush()
    expect(changes.issues).toEqual([
      { type: 'duplicate-key', kind: 'nodes', key: 'a' },
      { type: 'missing-key', kind: 'nodes', datum: unkeyed },
      { type: 'duplicate-key', kind: 'nodes', key: 'a' },
    ])
    expect(model.node('a')?.datum).toBe(first)
    expect(model.flush().issues).toEqual([])
  })

  it('never reuses an index inside the flush that frees it', () => {
    const model = createGraphModel()
    model.setMarks([nodes([item('a'), item('b')])])
    model.flush()
    model.setMarks([nodes([item('b'), item('c')])])
    expect(model.flush().nodes.added).toEqual([{ key: 'c', index: 2 }])
    model.setMarks([nodes([item('b'), item('c'), item('d')])])
    expect(model.flush().nodes.added).toEqual([{ key: 'd', index: 0 }])
  })

  it('answers neighborhood queries with loops and parallel edges', () => {
    const model = createGraphModel()
    model.setMarks([
      nodes([item('a'), item('b'), item('c')]),
      edges(
        [link('ab', 'a', 'b'), link('ba', 'b', 'a'), link('aa', 'a', 'a'), link('ax', 'a', 'x')],
        linkOptions,
      ),
    ])
    model.flush()
    expect(model.neighbors('a').sort()).toEqual(['a', 'b'])
    expect(model.edgesOf('a').sort()).toEqual(['aa', 'ab', 'ba'])
    expect(model.endpoints('ba')).toEqual({ source: 'b', target: 'a' })
    expect(model.endpoints('ax')).toBeUndefined()
    expect([...model.edges()].map((edge) => edge.key)).toEqual(['ab', 'ba', 'aa'])
  })

  it('applies live changes on flush only', () => {
    const model = createGraphModel()
    const live = createLiveSource<Item>([{ type: 'insert', key: 'a', value: item('a') }])
    model.setMarks([nodes(live.source)])
    expect(model.node('a')).toBeUndefined()
    expect(keys(model.flush().nodes.added)).toEqual(['a'])

    live.emit([
      { type: 'insert', key: 'b', value: item('b') },
      { type: 'update', key: 'a', value: item('a', 'z') },
    ])
    expect(model.node('b')).toBeUndefined()
    const changes = model.flush()
    expect(keys(changes.nodes.added)).toEqual(['b'])
    expect(keys(changes.nodes.updated)).toEqual(['a'])

    live.emit([{ type: 'delete', key: 'a', value: item('a', 'z') }])
    expect(keys(model.flush().nodes.removed)).toEqual(['a'])
  })

  it('keeps a live subscription when the definition is rebuilt', () => {
    const model = createGraphModel()
    const live = createLiveSource<Item>()
    const subscribe = vi.spyOn(live.source, 'subscribeChanges')
    model.setMarks([nodes(live.source, { color: 'group' })])
    model.setMarks([nodes(live.source, { color: 'group' })])
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes a live source that leaves the definition', () => {
    const model = createGraphModel()
    const live = createLiveSource<Item>([{ type: 'insert', key: 'a', value: item('a') }])
    model.setMarks([nodes(live.source)])
    model.flush()
    model.setMarks([nodes([item('b')])])
    expect(live.subscribed).toBe(false)
    const changes = model.flush()
    expect(keys(changes.nodes.removed)).toEqual(['a'])
    expect(keys(changes.nodes.added)).toEqual(['b'])
  })

  it('schedules a flush whenever work is queued', () => {
    const schedule = vi.fn()
    const model = createGraphModel({ schedule })
    const live = createLiveSource<Item>()
    const mark = nodes(live.source)
    model.setMarks([mark])
    expect(schedule).not.toHaveBeenCalled()
    live.emit([{ type: 'insert', key: 'a', value: item('a') }])
    expect(schedule).toHaveBeenCalledTimes(1)
    model.flush()
    model.setMarks([mark])
    expect(schedule).toHaveBeenCalledTimes(1)
  })

  it('keeps adjacency, indices and pending edges consistent through random batches', () => {
    let state = 7
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 4294967296
    }
    const pick = (count: number) => Math.floor(next() * count)
    const randomNodes = () =>
      Array.from({ length: pick(12) }, () => item(`n${pick(16)}`, `g${pick(3)}`))
    const randomEdges = () =>
      Array.from({ length: pick(20) }, () => link(`e${pick(30)}`, `n${pick(18)}`, `n${pick(18)}`))
    const model = createGraphModel()
    const live = createLiveSource<Item>()
    const liveItems = new Map<string, Item>()
    const liveMark = nodes(live.source)
    let firstItems: Item[] = []
    let secondItems: Item[] = []
    let links: Link[] = []
    let moreLinks: Link[] = []
    let first = nodes(firstItems)
    let second = nodes(secondItems)
    let linkMark = edges(links, linkOptions)
    let moreLinkMark = edges(moreLinks, linkOptions)
    const apply = () => model.setMarks([first, second, liveMark, linkMark, moreLinkMark])
    apply()
    for (let round = 0; round < 300; round++) {
      for (let batch = 0; batch < 1 + pick(2); batch++) {
        const roll = next()
        if (roll < 0.3) {
          firstItems = randomNodes()
          first = nodes(firstItems)
        } else if (roll < 0.45) {
          secondItems = randomNodes()
          second = nodes(secondItems)
        } else if (roll < 0.75) {
          links = randomEdges()
          linkMark = edges(links, linkOptions)
        } else if (roll < 0.85) {
          moreLinks = randomEdges()
          moreLinkMark = edges(moreLinks, linkOptions)
        } else {
          const key = `n${pick(16)}`
          const known = liveItems.get(key)
          if (known && next() < 0.5) {
            live.emit([{ type: 'delete', key, value: known }])
            liveItems.delete(key)
          } else {
            const value = item(key, `g${pick(3)}`)
            live.emit([{ type: known ? 'update' : 'insert', key, value }])
            liveItems.set(key, value)
          }
        }
        if (next() < 0.5) {
          secondItems = [...secondItems]
          second = nodes(secondItems)
        }
        if (next() < 0.5) {
          links = [...links]
          linkMark = edges(links, linkOptions)
        }
        apply()
      }
      model.flush()
      const present = new Map<string, Item>()
      for (const list of [firstItems, secondItems, liveItems.values()]) {
        for (const each of list) if (!present.has(each.id)) present.set(each.id, each)
      }
      const known = new Map<string, Link>()
      for (const list of [links, moreLinks]) {
        for (const each of list) if (!known.has(each.id)) known.set(each.id, each)
      }
      const visible = [...known.values()].filter(
        (each) => present.has(each.from) && present.has(each.to),
      )
      expect(new Set([...model.nodes()].map((node) => node.key))).toEqual(new Set(present.keys()))
      for (const node of model.nodes()) expect(model.nodeAt(node.index)).toBe(node)
      expect(new Set([...model.edges()].map((edge) => edge.key))).toEqual(
        new Set(visible.map((each) => each.id)),
      )
      const pending = [...known.keys()].filter((key) => !visible.some((each) => each.id === key))
      expect(new Set(model.pendingEdges())).toEqual(new Set(pending))
      for (const edge of model.edges()) {
        expect(model.edgeAt(edge.index)).toBe(edge)
        expect(edge.sourceIndex).toBe(model.node(edge.source)?.index)
        expect(edge.targetIndex).toBe(model.node(edge.target)?.index)
      }
      for (const key of present.keys()) {
        const touching = visible.filter((each) => each.from === key || each.to === key)
        expect(model.edgesOf(key).sort()).toEqual(touching.map((each) => each.id).sort())
        const around = new Set(touching.map((each) => (each.from === key ? each.to : each.from)))
        expect(model.neighbors(key).sort()).toEqual([...around].sort())
      }
    }
  })

  it('releases everything on destroy', () => {
    const model = createGraphModel()
    const live = createLiveSource<Item>()
    model.setMarks([nodes(live.source), nodes([item('a')])])
    model.flush()
    model.destroy()
    expect(live.subscribed).toBe(false)
    expect([...model.nodes()]).toEqual([])
  })
})
