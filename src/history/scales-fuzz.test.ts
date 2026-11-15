import { describe, expect, it } from 'vitest'
import { createGraphModel } from '../core/graph-model'
import type { HistoryCut } from '../core/history'
import { createScene } from '../core/scene'
import { defineGraph } from '../define-graph'
import { nodes } from '../marks'
import type { HistoryValues, LiveSource, SourceChange } from '../types'
import { historyFrom } from '.'

type Row = { id: string; a: number; b: string | null }
type Entry = { id: number; node: string; time: number; values: HistoryValues<Row> }
type Kept = Entry & { order: number }

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

function states(row: Row, entries: readonly Kept[]): { datum: Row; time: number }[] {
  const out: { datum: Row; time: number }[] = [{ datum: row, time: -Infinity }]
  let datum: Record<string, unknown> = { ...row }
  for (const entry of entries) {
    datum = { ...datum }
    for (const [name, value] of Object.entries(entry.values)) {
      if (value !== undefined && name !== 'id') datum[name] = value
    }
    out.push({ datum: datum as Row, time: entry.time })
  }
  return out
}

function run(seed: number, fields: boolean): void {
  const random = generator(seed)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T
  const keys = Array.from({ length: 3 + Math.floor(random() * 20) }, (_, index) => `k${index}`)
  const span = 2 + Math.floor(random() * 30)
  const time = () => Math.floor(random() * span)
  const valuesOf = (): HistoryValues<Row> => {
    const values: { -readonly [K in keyof Row]?: Row[K] | undefined } = {}
    if (random() < 0.6) values.a = Math.floor(random() * 200) - 50
    if (random() < 0.5) values.b = random() < 0.2 ? null : pick(['x', 'y', 'z', 'w'])
    if (random() < 0.1) values.id = 'nope'
    return values
  }
  const rowOf = (id: string): Row => ({
    id,
    a: Math.floor(random() * 10),
    b: random() < 0.5 ? null : pick(['p', 'q']),
  })
  const still: Row[] = [
    { id: 's0', a: Math.floor(random() * 20), b: 'q' },
    { id: 's1', a: 3, b: null },
  ]
  const rows = new Map<string, Row>()
  const rowSource = live<Row>()
  const entrySource = live<Entry>()
  const entries = new Map<number, Kept>()
  let arrival = 0
  let nextEntry = 0
  const initialRows: SourceChange<Row>[] = []
  for (const key of keys) {
    if (random() < 0.85) {
      const row = rowOf(key)
      rows.set(key, row)
      initialRows.push({ type: 'insert', key, value: row })
    }
  }
  rowSource.seed(initialRows)
  const initialEntries: SourceChange<Entry>[] = []
  for (let count = Math.floor(random() * 60); count > 0; count--) {
    const entry: Entry = { id: nextEntry++, node: pick(keys), time: time(), values: valuesOf() }
    entries.set(entry.id, { ...entry, order: arrival++ })
    initialEntries.push({ type: 'insert', key: entry.id, value: entry })
  }
  entrySource.seed(initialEntries)
  const model = createGraphModel()
  const scene = createScene()
  let cut: HistoryCut = { time: Math.floor(random() * span), inclusive: random() < 0.5 }
  model.readAt(cut)
  const definition = defineGraph({
    marks: [
      nodes(rowSource.source, {
        color: fields ? 'b' : (row) => row.b,
        size: fields ? 'a' : (row) => row.a,
        history: historyFrom(entrySource.source, { key: 'node', values: 'values' }),
      }),
      nodes(still, { color: 'b', size: 'a' }),
    ],
  })
  model.setMarks(definition.marks)
  scene.setDefinition(definition)
  const apply = () => {
    scene.apply(model, model.flush())
    return scene.takeDirty()
  }
  apply()
  const folds = () => {
    const out: { key: string; datum: Row; time: number }[] = []
    for (const key of keys) {
      const row = rows.get(key)
      if (!row) continue
      const mine = [...entries.values()]
        .filter((entry) => entry.node === key)
        .sort((x, y) => x.time - y.time || x.order - y.order)
      for (const state of states(row, mine)) out.push({ key, ...state })
    }
    return out
  }
  const check = (first: boolean) => {
    const all = folds()
    let low = Infinity
    let high = -Infinity
    for (const { datum } of [...all, ...still.map((datum) => ({ datum }))]) {
      low = Math.min(low, datum.a)
      high = Math.max(high, datum.a)
    }
    const scales = scene.scales()
    expect(scales.size.extent, `size of seed ${seed}`).toEqual([low, high])
    const held = new Map<string, Set<string>>()
    for (const { key, datum } of all) {
      if (datum.b === null) continue
      const owners = held.get(datum.b) ?? new Set()
      owners.add(key)
      held.set(datum.b, owners)
    }
    const past = new Map([...held].map(([value, owners]) => [value, owners.size]))
    expect(new Map(scales.color.past ?? []), `held of seed ${seed}`).toEqual(past)
    const categories = [...scales.color.scale.categories()]
    for (const value of past.keys()) expect(categories).toContain(value)
    if (!first) return
    const order = [...all]
      .filter(({ datum }) => datum.b !== null)
      .sort((x, y) => x.time - y.time)
      .map(({ datum }) => datum.b)
    expect(categories.slice(0, new Set(order).size)).toEqual([...new Set(order)])
  }
  check(true)
  for (let round = 0; round < 30; round++) {
    const roll = random()
    if (roll < 0.5) {
      const extent = scene.scales().size.extent
      const crossed = new Set<string>()
      const next: HistoryCut = {
        time: Math.floor(random() * (span + 2)) - 1,
        inclusive: random() < 0.5,
      }
      for (const entry of entries.values()) {
        if (applies(entry.time, cut) !== applies(entry.time, next)) crossed.add(entry.node)
      }
      cut = next
      model.readAt(cut)
      const dirty = apply()
      expect(scene.scales().size.extent).toEqual(extent)
      expect(dirty.nodes.size).toBeLessThanOrEqual(crossed.size)
    } else if (roll < 0.8) {
      const changes: SourceChange<Entry>[] = []
      for (let count = 1 + Math.floor(random() * 5); count > 0; count--) {
        const known = [...entries.keys()]
        if (random() < 0.6 || known.length === 0) {
          const entry: Entry = {
            id: nextEntry++,
            node: pick(keys),
            time: time(),
            values: valuesOf(),
          }
          entries.set(entry.id, { ...entry, order: arrival++ })
          changes.push({ type: 'insert', key: entry.id, value: entry })
        } else {
          const id = pick(known)
          changes.push({ type: 'delete', key: id, value: entries.get(id) as Entry })
          entries.delete(id)
        }
      }
      entrySource.emit(changes)
      apply()
    } else {
      const key = pick(keys)
      if (rows.has(key) && random() < 0.3) {
        rowSource.emit([{ type: 'delete', key, value: rows.get(key) as Row }])
        rows.delete(key)
      } else {
        const row = rowOf(key)
        rowSource.emit([{ type: rows.has(key) ? 'update' : 'insert', key, value: row }])
        rows.set(key, row)
      }
      apply()
    }
    check(false)
  }
}

describe('scales over a history against a naive fold', () => {
  it('match on random histories, steps and live changes, reading fields', () => {
    for (let seed = 1; seed <= 150; seed++) run(seed, true)
  })

  it('match on random histories, steps and live changes, reading functions', () => {
    for (let seed = 1; seed <= 150; seed++) run(seed, false)
  })
})
