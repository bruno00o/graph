import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { packTime, timeFilter } from '../core/time-range'
import { defineGraph } from '../define-graph'
import { createGraphHost, type GraphInstance } from '../host/mount-graph'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type {
  HistoryEntry,
  HistoryValues,
  LiveSource,
  Mark,
  SourceChange,
  TimeValue,
} from '../types'
import { historyFrom } from '.'

type Item = { id: string; x: number; y: number; time?: TimeValue }
type Link = { id: string; from: string; to: string }
type Entry = HistoryEntry<HistoryValues<Item>>

let dom: FakeDom

function mount(marks: readonly Mark[]): GraphInstance {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    { definition: defineGraph({ marks }), ariaLabel: 'graph' },
    () => fakeRenderer(),
  )
  dom.flushFrames()
  return graph as unknown as GraphInstance
}

function shownAt(graph: GraphInstance, start: number, end: number, key: string): boolean {
  graph.time.set({ start, end })
  dom.flushFrames()
  return graph.isShown({ kind: 'node', key })
}

function generator(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4_294_967_296
  }
}

function presence(entries: readonly HistoryEntry[]): number[] | null {
  const sorted = entries.filter((entry) => entry.present !== undefined)
  sorted.sort((a, b) => Number(a.time) - Number(b.time))
  if (sorted.length === 0) return null
  const bounds: number[] = []
  let there = sorted[0]?.present === false
  let start = Number.NEGATIVE_INFINITY
  for (const entry of sorted) {
    const time = Number(entry.time)
    if (entry.present && !there) {
      there = true
      start = time
    } else if (!entry.present && there) {
      if (time > start) bounds.push(start, time)
      there = false
    }
  }
  if (there) bounds.push(start, Number.POSITIVE_INFINITY)
  return bounds
}

function meets(bounds: readonly number[] | null, start: number, end: number): boolean {
  if (!bounds) return true
  const window = timeFilter({ start, end }, 0)
  const packed = new Float32Array(4)
  for (let at = 0; at < bounds.length; at += 2) {
    packTime(bounds[at] ?? 0, packed, 0)
    packTime(bounds[at + 1] ?? 0, packed, 2)
    if (window?.covers(packed, 0)) return true
  }
  return false
}

describe('presence in a history', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.restore()
  })

  it('turns entries with a presence into periods of the element', () => {
    const journal: Entry[] = [
      { key: 'a', time: 10, values: {}, present: true },
      { key: 'a', time: 20, values: {}, present: false },
      { key: 'a', time: 30, values: {}, present: true },
      { key: 'b', time: 15, values: {}, present: false },
      { key: 'c', time: 5, values: { x: 3 } },
    ]
    const items: Item[] = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 10, y: 0 },
      { id: 'c', x: 20, y: 0 },
    ]
    const graph = mount([nodes(items, { x: 'x', y: 'y', history: historyFrom(journal) })])
    expect(shownAt(graph, 0, 5, 'a')).toBe(false)
    expect(shownAt(graph, 12, 13, 'a')).toBe(true)
    expect(shownAt(graph, 22, 25, 'a')).toBe(false)
    expect(shownAt(graph, 40, 50, 'a')).toBe(true)
    expect(shownAt(graph, 0, 5, 'b')).toBe(true)
    expect(shownAt(graph, 16, 20, 'b')).toBe(false)
    expect(shownAt(graph, 0, 1, 'c')).toBe(true)
    expect(graph.history.of({ kind: 'node', key: 'a' })[1]).toEqual({
      key: 'a',
      time: 20,
      values: {},
      present: false,
    })
    graph.destroy()
  })

  it('combines the presence with the time of the mark and hides edges of absent ends', () => {
    const journal: Entry[] = [
      { key: 'a', time: 10, values: {}, present: false },
      { key: 'a', time: 30, values: {}, present: true },
    ]
    const items: Item[] = [
      { id: 'a', x: 0, y: 0, time: { start: 5, end: 40 } },
      { id: 'b', x: 10, y: 0 },
    ]
    const links: Link[] = [{ id: 'ab', from: 'a', to: 'b' }]
    const graph = mount([
      edges(links, { source: 'from', target: 'to' }),
      nodes(items, { x: 'x', y: 'y', time: 'time', history: historyFrom(journal) }),
    ])
    expect(shownAt(graph, 0, 4, 'a')).toBe(false)
    expect(shownAt(graph, 6, 8, 'a')).toBe(true)
    expect(graph.isShown({ kind: 'edge', key: 'ab' })).toBe(true)
    expect(shownAt(graph, 12, 20, 'a')).toBe(false)
    expect(graph.isShown({ kind: 'edge', key: 'ab' })).toBe(false)
    expect(shownAt(graph, 35, 36, 'a')).toBe(true)
    expect(shownAt(graph, 45, 46, 'a')).toBe(false)
    graph.destroy()
  })

  it('follows a live journal like a naive reading of its presence', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const random = generator(seed)
      const channel: { listener: ((changes: ReadonlyArray<SourceChange<Entry>>) => void) | null } =
        {
          listener: null,
        }
      const source: LiveSource<Entry> = {
        subscribeChanges(callback) {
          channel.listener = callback
          return {
            unsubscribe() {
              channel.listener = null
            },
          }
        },
      }
      const keys = ['a', 'b', 'c', 'd', 'e']
      const items: Item[] = keys.map((id, at) => ({ id, x: at * 10, y: 0 }))
      const graph = mount([nodes(items, { x: 'x', y: 'y', history: historyFrom(source) })])
      const journal = new Map<string, Entry>()
      let id = 0
      for (let step = 0; step < 40; step++) {
        const changes: SourceChange<Entry>[] = []
        const count = 1 + Math.floor(random() * 3)
        for (let at = 0; at < count; at++) {
          const known = [...journal.keys()]
          if (known.length > 0 && random() < 0.25) {
            const key = known[Math.floor(random() * known.length)] as string
            journal.delete(key)
            changes.push({ type: 'delete', key, value: undefined as never })
            continue
          }
          const element = keys[Math.floor(random() * keys.length)] as string
          const entry: Entry = {
            key: element,
            time: id * 7 + Math.floor(random() * 5),
            values: {},
            ...(random() < 0.9 ? { present: random() < 0.5 } : {}),
          }
          const key = `e${id++}`
          journal.set(key, entry)
          changes.push({ type: 'insert', key, value: entry })
        }
        channel.listener?.(changes)
        const start = Math.floor(random() * 300) - 10
        const end = start + Math.floor(random() * 30)
        graph.time.set({ start, end })
        dom.flushFrames()
        for (const element of keys) {
          const entries = [...journal.values()].filter((entry) => entry.key === element)
          expect(
            graph.isShown({ kind: 'node', key: element }),
            `seed ${seed} step ${step} ${element}`,
          ).toBe(meets(presence(entries), start, end))
        }
      }
      graph.destroy()
    }
  })
})
