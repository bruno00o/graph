import { describe, expect, it } from 'vitest'
import { createGraphModel } from '../core/graph-model'
import type { HistoryCut } from '../core/history'
import { nodes } from '../marks'
import type { HistoryValues, Key, LiveSource, SourceChange } from '../types'
import { historyFrom } from '.'

type Row = { id: string; a: number; b: string | null; c?: number }
type Entry = { id: number; node: string; time: number; values: HistoryValues<Row> }

function generator(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4_294_967_296
  }
}

function live<T>() {
  let listener: ((changes: ReadonlyArray<SourceChange<T>>) => void) | null = null
  let initial: SourceChange<T>[] = []
  const source: LiveSource<T> = {
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
    seed(changes: SourceChange<T>[]) {
      initial = changes
    },
    emit(changes: SourceChange<T>[]) {
      if (changes.length > 0) listener?.(changes)
    },
  }
}

function applies(time: number, cut: HistoryCut): boolean {
  return time < cut.time || (cut.inclusive && time === cut.time)
}

function expected(row: Row, entries: readonly Entry[], cut: HistoryCut): Row {
  const out: Record<string, unknown> = { ...row }
  const sorted = [...entries].sort((x, y) => x.time - y.time)
  for (const entry of sorted) {
    if (!applies(entry.time, cut)) continue
    for (const [name, value] of Object.entries(entry.values)) {
      if (value !== undefined && name !== 'id') out[name] = value
    }
  }
  return out as Row
}

function run(seed: number): void {
  const random = generator(seed)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T
  const keyCount = 4 + Math.floor(random() * 30)
  const keys = Array.from({ length: keyCount }, (_, index) => `k${index}`)
  const span = 2 + Math.floor(random() * 40)
  const time = () => Math.floor(random() * span)
  const valuesOf = (): HistoryValues<Row> => {
    const values: { -readonly [K in keyof Row]?: Row[K] | undefined } = {}
    if (random() < 0.6) values.a = Math.floor(random() * 100)
    if (random() < 0.4) values.b = random() < 0.2 ? null : pick(['x', 'y', 'z'])
    if (random() < 0.2) values.c = Math.floor(random() * 10)
    if (random() < 0.1) values.id = 'nope'
    if (random() < 0.1) values.a = undefined
    return values
  }
  const rowOf = (id: string): Row => ({ id, a: 0, b: null })
  const rows = new Map<string, Row>()
  const rowSource = live<Row>()
  const entrySource = live<Entry>()
  let arrival = 0
  const entries = new Map<number, Entry & { order: number }>()
  const initialRows: SourceChange<Row>[] = []
  for (const key of keys) {
    if (random() < 0.8) {
      const row = rowOf(key)
      rows.set(key, row)
      initialRows.push({ type: 'insert', key, value: row })
    }
  }
  rowSource.seed(initialRows)
  let nextEntry = 0
  const initialEntries: SourceChange<Entry>[] = []
  const entryCount = Math.floor(random() * 80)
  for (let count = 0; count < entryCount; count++) {
    const entry: Entry = { id: nextEntry++, node: pick(keys), time: time(), values: valuesOf() }
    entries.set(entry.id, { ...entry, order: arrival++ })
    initialEntries.push({ type: 'insert', key: entry.id, value: entry })
  }
  entrySource.seed(initialEntries)
  const model = createGraphModel()
  let cut: HistoryCut = { time: Math.floor(random() * span), inclusive: random() < 0.5 }
  model.readAt(cut)
  model.setMarks([
    nodes(rowSource.source, {
      history: historyFrom(entrySource.source, { key: 'node', values: 'values' }),
    }),
  ])
  model.flush()
  const shown = new Map<string, unknown>()
  const check = (touched: ReadonlySet<string> | null) => {
    for (const key of keys) {
      const row = rows.get(key)
      const record = model.node(key)
      if (!row) {
        expect(record).toBeUndefined()
        continue
      }
      const mine = [...entries.values()]
        .filter((entry) => entry.node === key)
        .sort((x, y) => x.time - y.time || x.order - y.order)
      const want = expected(row, mine, cut)
      expect(record?.datum, `${key} at ${cut.time}`).toEqual(want)
      if (touched && !touched.has(key) && shown.has(key)) {
        expect(record?.datum, `${key} kept`).toBe(shown.get(key))
      }
      shown.set(key, record?.datum)
    }
  }
  check(null)
  for (let round = 0; round < 40; round++) {
    const touched = new Set<string>()
    const roll = random()
    if (roll < 0.45) {
      const next: HistoryCut =
        random() < 0.1
          ? { time: Infinity, inclusive: true }
          : { time: Math.floor(random() * (span + 2)) - 1, inclusive: random() < 0.5 }
      for (const entry of entries.values()) {
        if (applies(entry.time, cut) !== applies(entry.time, next)) touched.add(entry.node)
      }
      cut = next
      model.readAt(cut)
    } else if (roll < 0.75) {
      const changes: SourceChange<Entry>[] = []
      const count = 1 + Math.floor(random() * 6)
      for (let at = 0; at < count; at++) {
        const known = [...entries.keys()]
        const action = random()
        if (action < 0.5 || known.length === 0) {
          const entry: Entry = {
            id: nextEntry++,
            node: pick(keys),
            time: time(),
            values: valuesOf(),
          }
          entries.set(entry.id, { ...entry, order: arrival++ })
          changes.push({ type: 'insert', key: entry.id, value: entry })
          touched.add(entry.node)
        } else if (action < 0.8) {
          const id = pick(known)
          const old = entries.get(id) as Entry
          const entry: Entry = { id, node: pick(keys), time: time(), values: valuesOf() }
          entries.set(id, { ...entry, order: arrival++ })
          changes.push({ type: 'update', key: id, value: entry })
          touched.add(entry.node)
          touched.add(old.node)
        } else {
          const id = pick(known)
          const old = entries.get(id) as Entry
          entries.delete(id)
          changes.push({ type: 'delete', key: id, value: old })
          touched.add(old.node)
        }
      }
      entrySource.emit(changes)
    } else {
      const changes: SourceChange<Row>[] = []
      const key = pick(keys)
      touched.add(key)
      if (rows.has(key) && random() < 0.3) {
        changes.push({ type: 'delete', key, value: rows.get(key) as Row })
        rows.delete(key)
      } else {
        const row = { ...rowOf(key), a: Math.floor(random() * 5) }
        changes.push({ type: rows.has(key) ? 'update' : 'insert', key, value: row })
        rows.set(key, row)
      }
      rowSource.emit(changes)
    }
    model.flush()
    check(touched)
  }
}

describe('history against a naive recomputation', () => {
  it('matches on random histories, steps and live changes', () => {
    for (let seed = 1; seed <= 150; seed++) run(seed)
  })
})

describe('history on large steps', () => {
  it('matches after a jump that recomputes every element', () => {
    const keys: Key[] = Array.from({ length: 300 }, (_, index) => `n${index}`)
    const random = generator(99)
    const rows = keys.map((id) => ({ id: id as string, a: 0, b: null }))
    const list = Array.from({ length: 3000 }, (_, id) => ({
      key: keys[Math.floor(random() * keys.length)] as Key,
      time: Math.floor(random() * 1000),
      values: { a: id },
    }))
    const model = createGraphModel()
    model.readAt({ time: 0, inclusive: true })
    model.setMarks([nodes(rows, { history: historyFrom(list) })])
    model.flush()
    for (const target of [999, 3, 500, 501, 10_000, -5]) {
      const cut = { time: target, inclusive: true }
      model.readAt(cut)
      model.flush()
      for (const row of rows) {
        const mine = list.filter((entry) => entry.key === row.id && entry.time <= target)
        mine.sort((x, y) => x.time - y.time)
        const want = mine.length === 0 ? row : { ...row, a: mine[mine.length - 1]?.values.a }
        expect(model.node(row.id)?.datum).toEqual(want)
      }
    }
  })
})

describe('history over arrays of items replaced by new arrays', () => {
  it('matches on random steps and replaced items', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const random = generator(seed * 7919)
      const keys = Array.from({ length: 3 + Math.floor(random() * 20) }, (_, index) => `k${index}`)
      const span = 2 + Math.floor(random() * 20)
      const list = Array.from({ length: Math.floor(random() * 60) }, () => ({
        key: keys[Math.floor(random() * keys.length)] as string,
        time: Math.floor(random() * span),
        values: { a: Math.floor(random() * 50) } as HistoryValues<Row>,
      }))
      const history = historyFrom(list)
      let rows: Row[] = keys.filter(() => random() < 0.8).map((id) => ({ id, a: -1, b: null }))
      let cut: HistoryCut = { time: Math.floor(random() * span), inclusive: random() < 0.5 }
      const model = createGraphModel()
      model.readAt(cut)
      model.setMarks([nodes(rows, { history })])
      model.flush()
      for (let round = 0; round < 25; round++) {
        if (random() < 0.5) {
          cut = { time: Math.floor(random() * (span + 2)) - 1, inclusive: random() < 0.5 }
          model.readAt(cut)
        } else {
          rows = keys
            .filter(() => random() < 0.85)
            .map((id) => {
              const old = rows.find((row) => row.id === id)
              return old && random() < 0.7 ? old : { id, a: -1, b: random() < 0.5 ? 'x' : null }
            })
          model.setMarks([nodes(rows, { history })])
        }
        model.flush()
        for (const key of keys) {
          const row = rows.find((candidate) => candidate.id === key)
          const record = model.node(key)
          if (!row) {
            expect(record).toBeUndefined()
            continue
          }
          const mine = list
            .map((entry, order) => ({
              id: order,
              node: key,
              time: entry.time,
              values: entry.values,
              owner: entry.key,
            }))
            .filter((entry) => entry.owner === key)
          expect(record?.datum).toEqual(expected(row, mine, cut))
        }
      }
    }
  })
})
