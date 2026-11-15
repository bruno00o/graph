import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGraphModel, type GraphModel } from '../core/graph-model'
import { type HistoryCut, wholeHistory } from '../core/history'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import type { HistoryEntry, HistoryValues, Key, LiveSource, SourceChange } from '../types'
import { historyFrom } from '.'

type Item = { id: string; status: string; weight: number; time?: number | null }
type Change = { id: string; node: string; at: number; status?: string; weight?: number }

const item = (id: string, status = 's0', weight = 1): Item => ({ id, status, weight })
const at = (time: number, inclusive = true): HistoryCut => ({ time, inclusive })

function live<T>(initial: SourceChange<T>[] = []) {
  let listener: ((changes: ReadonlyArray<SourceChange<T>>) => void) | null = null
  let status = 'ready'
  const statusListeners = new Set<() => void>()
  const source: LiveSource<T> = {
    get status() {
      return status
    },
    on(_event, handler) {
      statusListeners.add(handler)
      return () => statusListeners.delete(handler)
    },
    subscribeChanges(callback, options) {
      listener = callback
      if (options?.includeInitialState && initial.length > 0) callback(initial)
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
    setStatus(next: string) {
      status = next
      for (const handler of statusListeners) handler()
    },
    get subscribed() {
      return listener !== null
    },
  }
}

function datum(model: GraphModel, key: Key): unknown {
  return model.node(key)?.datum
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('history of a mark', () => {
  const items = [item('a'), item('b'), item('c')]
  const entries: HistoryEntry<HistoryValues<Item>>[] = [
    { key: 'a', time: 10, values: { status: 's1' } },
    { key: 'a', time: 20, values: { weight: 5 } },
    { key: 'b', time: 20, values: { status: 's2', weight: undefined } },
    { key: 'a', time: 30, values: { status: null as never } },
  ]

  it('shows the latest values without a window', () => {
    const model = createGraphModel()
    model.setMarks([nodes(items, { history: historyFrom(entries) })])
    model.flush()
    expect(datum(model, 'a')).toEqual({ id: 'a', status: null, weight: 5 })
    expect(datum(model, 'b')).toEqual({ id: 'b', status: 's2', weight: 1 })
    expect(datum(model, 'c')).toBe(items[2])
  })

  it('reads the values at the cut, including or excluding its moment', () => {
    const model = createGraphModel()
    model.readAt(at(20))
    model.setMarks([nodes(items, { history: historyFrom(entries) })])
    model.flush()
    expect(datum(model, 'a')).toEqual({ id: 'a', status: 's1', weight: 5 })
    model.readAt(at(20, false))
    const changes = model.flush()
    expect(changes.nodes.updated.map((ref) => ref.key).sort()).toEqual(['a', 'b'])
    expect(datum(model, 'a')).toEqual({ id: 'a', status: 's1', weight: 1 })
    expect(datum(model, 'b')).toBe(items[1])
    model.readAt(at(5))
    model.flush()
    expect(datum(model, 'a')).toBe(items[0])
    model.readAt(wholeHistory)
    model.flush()
    expect(datum(model, 'a')).toEqual({ id: 'a', status: null, weight: 5 })
  })

  it('touches only the elements whose entries the step crosses', () => {
    const model = createGraphModel()
    model.readAt(at(15))
    model.setMarks([nodes(items, { history: historyFrom(entries) })])
    model.flush()
    const before = datum(model, 'a')
    model.readAt(at(16))
    expect(model.flush().nodes.updated).toEqual([])
    expect(datum(model, 'a')).toBe(before)
    model.readAt(at(25))
    expect(
      model
        .flush()
        .nodes.updated.map((ref) => ref.key)
        .sort(),
    ).toEqual(['a', 'b'])
  })

  it('never takes the key and time fields from the values', () => {
    const model = createGraphModel()
    const rows = [{ id: 'a', status: 's0', weight: 1, time: 4 }]
    const history = historyFrom<HistoryValues<(typeof rows)[number]>>([
      { key: 'a', time: 1, values: { id: 'z', time: 9, status: 's1' } },
    ])
    model.setMarks([nodes(rows, { time: 'time', history })])
    model.flush()
    expect(datum(model, 'a')).toEqual({ id: 'a', status: 's1', weight: 1, time: 4 })
  })

  it('keeps the prototype and the frozen state of the item', () => {
    class Row {
      constructor(
        readonly id: string,
        readonly status: string,
      ) {}
    }
    const model = createGraphModel()
    const row = Object.freeze(new Row('a', 's0'))
    model.setMarks([
      nodes([row], { history: historyFrom([{ key: 'a', time: 1, values: { status: 's1' } }]) }),
    ])
    model.flush()
    const shown = datum(model, 'a') as Row
    expect(shown).toBeInstanceOf(Row)
    expect(shown.status).toBe('s1')
    expect(Object.isFrozen(shown)).toBe(true)
  })

  it('moves edges whose ends change over time', () => {
    const model = createGraphModel()
    model.readAt(at(0))
    model.setMarks([
      nodes([item('a'), item('b'), item('c')]),
      edges([{ id: 'e', from: 'a', to: 'b' }], {
        source: 'from',
        target: 'to',
        history: historyFrom([{ key: 'e', time: 5, values: { to: 'c' } }]),
      }),
    ])
    model.flush()
    expect(model.endpoints('e')).toEqual({ source: 'a', target: 'b' })
    model.readAt(at(5))
    model.flush()
    expect(model.endpoints('e')).toEqual({ source: 'a', target: 'c' })
    expect(model.neighbors('b')).toEqual([])
  })

  it('reads entries of another shape through its options', () => {
    const changes: Change[] = [
      { id: 'c1', node: 'a', at: 3, status: 's3' },
      { id: 'c2', node: 'b', at: 4, weight: 7 },
    ]
    const model = createGraphModel()
    model.setMarks([
      nodes(items, {
        history: historyFrom(changes, {
          key: 'node',
          time: 'at',
          values: (change) => ({ status: change.status, weight: change.weight }),
        }),
      }),
    ])
    model.flush()
    expect(datum(model, 'a')).toEqual({ id: 'a', status: 's3', weight: 1 })
    expect(datum(model, 'b')).toEqual({ id: 'b', status: 's0', weight: 7 })
    expect(model.history('nodes', 'a')).toEqual([
      { key: 'a', time: 3, values: { status: 's3', weight: undefined } },
    ])
  })

  it('ignores invalid entries with one warning per source', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const history = historyFrom<HistoryValues<Item>>([
      { key: 'a', time: Number.NaN, values: { status: 's1' } },
      { key: 'a', time: 'soon' as never, values: { status: 's1' } },
      { key: {} as never, time: 1, values: { status: 's1' } },
      { key: 'a', time: 1, values: 5 as never },
      { key: 'a', time: new Date(2), values: { status: 's2' } },
    ])
    const model = createGraphModel()
    model.setMarks([nodes(items, { history })])
    model.flush()
    expect(datum(model, 'a')).toEqual({ id: 'a', status: 's2', weight: 1 })
    const other = createGraphModel()
    other.setMarks([nodes(items, { history })])
    other.flush()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('ignored 4 entries')
    const found: unknown[] = []
    model.collectIssues(found as never)
    expect(found).toEqual([])
  })

  it('lists the entries of an element in order', () => {
    const model = createGraphModel()
    model.setMarks([nodes(items, { history: historyFrom(entries) })])
    model.flush()
    expect(model.history('nodes', 'a')?.map((entry) => entry.time)).toEqual([10, 20, 30])
    expect(model.history('nodes', 'c')).toBeNull()
    expect(model.history('edges', 'a')).toBeNull()
  })

  it('keeps the history of a mark recreated with the same history', () => {
    const history = historyFrom(entries)
    const model = createGraphModel()
    model.setMarks([nodes(items, { history })])
    model.flush()
    const shown = datum(model, 'a')
    model.setMarks([nodes(items, { history })])
    expect(model.flush().nodes.updated).toEqual([])
    expect(datum(model, 'a')).toBe(shown)
    model.setMarks([nodes([...items], { history })])
    expect(model.flush().nodes.updated).toEqual([])
  })

  it('goes back to the items when the history goes away', () => {
    const model = createGraphModel()
    model.setMarks([nodes(items, { history: historyFrom(entries) })])
    model.flush()
    model.setMarks([nodes(items)])
    const changes = model.flush()
    expect(changes.nodes.updated.map((ref) => ref.key).sort()).toEqual(['a', 'b'])
    expect(datum(model, 'a')).toBe(items[0])
  })

  it('applies a new history to the elements of both', () => {
    const model = createGraphModel()
    model.setMarks([nodes(items, { history: historyFrom(entries) })])
    model.flush()
    model.setMarks([
      nodes(items, { history: historyFrom([{ key: 'c', time: 1, values: { status: 'x' } }]) }),
    ])
    const changes = model.flush()
    expect(changes.nodes.updated.map((ref) => ref.key).sort()).toEqual(['a', 'b', 'c'])
    expect(datum(model, 'a')).toBe(items[0])
    expect(datum(model, 'c')).toEqual({ id: 'c', status: 'x', weight: 1 })
  })

  it('applies the history to an element that arrives later', () => {
    const rows = live<Item>()
    const model = createGraphModel()
    model.readAt(at(15))
    model.setMarks([nodes(rows.source, { history: historyFrom(entries) })])
    model.flush()
    rows.emit([{ type: 'insert', key: 'a', value: item('a') }])
    expect(model.flush().nodes.added).toEqual([{ key: 'a', index: 0 }])
    expect(datum(model, 'a')).toEqual({ id: 'a', status: 's1', weight: 1 })
    const next = item('a', 's0', 3)
    rows.emit([{ type: 'update', key: 'a', value: next }])
    model.flush()
    expect(datum(model, 'a')).toEqual({ id: 'a', status: 's1', weight: 3 })
  })

  it('follows a live source of entries', () => {
    const log = live<Change>([
      { type: 'insert', key: 'c1', value: { id: 'c1', node: 'a', at: 5, status: 's1' } },
    ])
    const model = createGraphModel()
    model.readAt(at(10))
    const history = historyFrom(log.source, {
      key: 'node',
      time: 'at',
      values: (change) => ({ status: change.status }),
    })
    model.setMarks([nodes(items, { history })])
    model.flush()
    expect(datum(model, 'a')).toEqual({ id: 'a', status: 's1', weight: 1 })
    log.emit([{ type: 'insert', key: 'c2', value: { id: 'c2', node: 'a', at: 20, status: 's2' } }])
    expect(model.flush().nodes.updated).toEqual([])
    log.emit([{ type: 'update', key: 'c2', value: { id: 'c2', node: 'a', at: 8, status: 's2' } }])
    model.flush()
    expect(datum(model, 'a')).toEqual({ id: 'a', status: 's2', weight: 1 })
    log.emit([{ type: 'delete', key: 'c2', value: { id: 'c2', node: 'a', at: 8 } }])
    model.flush()
    expect(datum(model, 'a')).toEqual({ id: 'a', status: 's1', weight: 1 })
    log.emit([{ type: 'update', key: 'c1', value: { id: 'c1', node: 'b', at: 5, status: 's9' } }])
    model.flush()
    expect(datum(model, 'a')).toBe(items[0])
    expect(datum(model, 'b')).toEqual({ id: 'b', status: 's9', weight: 1 })
  })

  it('counts a loading source of entries as loading data', () => {
    const log = live<HistoryEntry<HistoryValues<Item>>>()
    log.setStatus('loading')
    const model = createGraphModel()
    model.setMarks([nodes(items, { history: historyFrom(log.source) })])
    expect(model.loadingSources).toBe(1)
    const version = model.readinessVersion
    log.setStatus('ready')
    expect(model.loadingSources).toBe(0)
    expect(model.readinessVersion).toBeGreaterThan(version)
    log.setStatus('error')
    expect(model.failedSources()).toEqual([log.source])
    model.setMarks([nodes(items)])
    expect(log.subscribed).toBe(false)
    expect(model.failedSources()).toEqual([])
  })

  it('unsubscribes from a live source of entries on destroy', () => {
    const log = live<HistoryEntry<HistoryValues<Item>>>()
    const model = createGraphModel()
    model.setMarks([nodes(items, { history: historyFrom(log.source) })])
    expect(log.subscribed).toBe(true)
    model.destroy()
    expect(log.subscribed).toBe(false)
  })

  it('lets go of a live source of entries when the marks are refused', () => {
    const log = live<HistoryEntry<HistoryValues<Item>>>()
    const broken: LiveSource<Item> = {
      subscribeChanges() {
        throw new Error('refused')
      },
    }
    const model = createGraphModel()
    expect(() =>
      model.setMarks([nodes(items, { history: historyFrom(log.source) }), nodes(broken)]),
    ).toThrow('refused')
    expect(log.subscribed).toBe(false)
    const kept = historyFrom(log.source)
    model.setMarks([nodes(items, { history: kept })])
    expect(log.subscribed).toBe(true)
    expect(() => model.setMarks([nodes(items, { history: kept }), nodes(broken)])).toThrow()
    expect(log.subscribed).toBe(true)
  })

  it('leaves a mark without history as it was', () => {
    const model = createGraphModel()
    const schedule = vi.fn()
    const plain = createGraphModel({ schedule })
    plain.setMarks([nodes(items)])
    plain.flush()
    schedule.mockClear()
    plain.readAt(at(3))
    expect(schedule).not.toHaveBeenCalled()
    model.setMarks([nodes(items)])
    model.flush()
    expect(datum(model, 'a')).toBe(items[0])
  })

  it('refuses a history that historyFrom did not make', () => {
    expect(() => defineGraph({ marks: [nodes(items, { history: {} as never })] })).toThrow(
      TypeError,
    )
  })
})
