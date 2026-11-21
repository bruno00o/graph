import { describe, expect, it } from 'vitest'
import { createGraphModel, type GraphChanges } from '../core/graph-model'
import type { HistoryCut } from '../core/history'
import { createScene, type Scene } from '../core/scene'
import { defineGraph } from '../define-graph'
import { edges, nodes } from '../marks'
import { resolvedOf } from '../resolved-definition'
import { shapes } from '../shapes'
import type { Key, LiveSource, Mark, SourceChange } from '../types'
import { historyFrom } from '.'

type Item = { id: string; a: number; b: string | null; l?: string }
type Link = { id: string; from: string; to: string; w: number; c: string }
type Zone = {
  id: string
  geometry: { x: number; y: number; width: number; height: number }
  c: string
}
type Values = {
  a?: number | undefined
  b?: string | null
  l?: string
  w?: number
  c?: string
  to?: string
  from?: string
  id?: string
}
type Entry = { id: number; key: string; time: number; values: Values }

function generator(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4_294_967_296
  }
}

function shared<T>() {
  const listeners = new Set<(changes: ReadonlyArray<SourceChange<T>>) => void>()
  const rows = new Map<Key, T>()
  const source: LiveSource<T> = {
    subscribeChanges(callback, options) {
      listeners.add(callback)
      if (options?.includeInitialState && rows.size > 0) {
        callback([...rows].map(([key, value]) => ({ type: 'insert' as const, key, value })))
      }
      return {
        unsubscribe() {
          listeners.delete(callback)
        },
      }
    },
  }
  return {
    source,
    rows,
    emit(changes: SourceChange<T>[]) {
      for (const change of changes) {
        if (change.type === 'delete') rows.delete(change.key)
        else rows.set(change.key, change.value)
      }
      if (changes.length > 0) for (const listener of listeners) listener(changes)
    },
  }
}

const colorColumns = new Set([
  'fill',
  'stroke',
  'outline',
  'labelBackground',
  'labelColor',
  'imageColor',
  'color',
])

function columnsOf(
  columns: object,
  alive: Uint8Array,
  keys: readonly (Key | undefined)[],
  scene: Scene,
) {
  const out = new Map<Key, Record<string, unknown>>()
  const colors = scene.palette.colors
  for (let index = 0; index < alive.length; index++) {
    if (alive[index] !== 1) continue
    const row: Record<string, unknown> = {}
    for (const [name, column] of Object.entries(columns)) {
      if (!ArrayBuffer.isView(column) && !Array.isArray(column)) continue
      const value = (column as ArrayLike<unknown>)[index]
      row[name] = colorColumns.has(name) ? colors[value as number] : value
    }
    out.set(keys[index] as Key, row)
  }
  return out
}

function sorted(changes: GraphChanges) {
  const keys = (refs: readonly { key: Key }[]) => refs.map((ref) => String(ref.key)).sort()
  return {
    nodes: [keys(changes.nodes.added), keys(changes.nodes.updated), keys(changes.nodes.removed)],
    edges: [
      keys(changes.edges.added),
      keys(changes.edges.updated),
      keys(changes.edges.removed),
      [...changes.edges.pending].map(String).sort(),
    ],
    shapes: [
      keys(changes.shapes.added),
      keys(changes.shapes.updated),
      keys(changes.shapes.removed),
    ],
  }
}

function run(seed: number): void {
  const random = generator(seed)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T
  const nodeKeys = Array.from({ length: 4 + Math.floor(random() * 20) }, (_, at) => `n${at}`)
  const linkKeys = Array.from({ length: 2 + Math.floor(random() * 25) }, (_, at) => `e${at}`)
  const zoneKeys = Array.from({ length: 1 + Math.floor(random() * 6) }, (_, at) => `z${at}`)
  const ends = [...nodeKeys, 'ghost']
  const span = 2 + Math.floor(random() * 30)
  const time = () => Math.floor(random() * span)
  const itemOf = (id: string): Item => ({
    id,
    a: Math.floor(random() * 10),
    b: random() < 0.3 ? null : pick(['p', 'q']),
  })
  const linkOf = (id: string): Link => ({
    id,
    from: pick(nodeKeys),
    to: pick(ends),
    w: Math.floor(random() * 5),
    c: pick(['r', 's']),
  })
  const zoneOf = (id: string): Zone => ({
    id,
    geometry: { x: random() * 10, y: random() * 10, width: 1, height: 1 },
    c: pick(['u', 'v']),
  })
  const valuesOf = (kind: number): Values => {
    const values: Values = {}
    if (kind === 0) {
      if (random() < 0.6) values.a = Math.floor(random() * 100) - 20
      if (random() < 0.4) values.b = random() < 0.2 ? null : pick(['x', 'y', 'z'])
      if (random() < 0.2) values.l = pick(['one', 'two'])
    } else if (kind === 1) {
      if (random() < 0.6) values.w = Math.floor(random() * 8)
      if (random() < 0.4) values.c = pick(['r', 's', 't'])
      if (random() < 0.08) values.to = pick(ends)
      if (random() < 0.05) values.from = pick(nodeKeys)
    } else if (random() < 0.7) values.c = pick(['u', 'v', 'w'])
    if (random() < 0.05) values.id = 'nope'
    if (random() < 0.05) values.a = undefined
    return values
  }
  const items = shared<Item>()
  const links = shared<Link>()
  const zones = shared<Zone>()
  const journals = [shared<Entry>(), shared<Entry>(), shared<Entry>()]
  const keysOf = [nodeKeys, linkKeys, zoneKeys]
  let nextEntry = 0
  const entry = (kind: number): Entry => ({
    id: nextEntry++,
    key: pick(keysOf[kind] as string[]),
    time: time(),
    values: valuesOf(kind),
  })
  items.emit(nodeKeys.filter(() => random() < 0.85).map((id) => insert(id, itemOf(id))))
  links.emit(linkKeys.filter(() => random() < 0.85).map((id) => insert(id, linkOf(id))))
  zones.emit(zoneKeys.map((id) => insert(id, zoneOf(id))))
  journals.forEach((journal, kind) => {
    const count = Math.floor(random() * 6 * (keysOf[kind] as string[]).length)
    journal.emit(Array.from({ length: count }, () => insert(nextEntry, entry(kind))))
  })
  const histories = journals.map((journal) =>
    historyFrom(journal.source as LiveSource<Entry>, { key: 'key', values: 'values' }),
  )
  const still: Item[] = [{ id: 'n0', a: 50, b: 'still' }]
  const marksOf = (): readonly Mark[] =>
    defineGraph({
      marks: [
        nodes(items.source, {
          size: 'a',
          color: 'b',
          label: (item) => item.l ?? null,
          history: histories[0],
        }),
        nodes(still, { size: 'a', color: 'b' }),
        edges(links.source, {
          source: 'from',
          target: 'to',
          width: 'w',
          color: 'c',
          history: histories[1],
        }),
        shapes(zones.source, { color: 'c', history: histories[2] }),
      ],
    }).marks
  const worlds = [true, false].map((steps) => {
    const model = createGraphModel({ steps })
    const scene = createScene()
    return { model, scene }
  })
  let cut: HistoryCut = { time: time(), inclusive: random() < 0.5 }
  const define = () => {
    const marks = marksOf()
    const definition = defineGraph({ marks })
    for (const { model, scene } of worlds) {
      model.setMarks(definition.marks)
      scene.setDefinition(resolvedOf(definition))
    }
  }
  for (const { model } of worlds) model.readAt(cut)
  define()
  const flush = (round: number) => {
    const [direct, full] = worlds.map(({ model, scene }) => {
      const changes = model.flush()
      scene.apply(model, changes)
      scene.takeDirty()
      return { changes: sorted(changes), model, scene }
    }) as [
      { changes: ReturnType<typeof sorted>; model: (typeof worlds)[0]['model']; scene: Scene },
      { changes: ReturnType<typeof sorted>; model: (typeof worlds)[0]['model']; scene: Scene },
    ]
    const label = `seed ${seed}, round ${round}`
    expect(direct.changes, label).toEqual(full.changes)
    for (const key of nodeKeys) {
      expect(direct.model.node(key)?.datum, `${label}, ${key}`).toEqual(full.model.node(key)?.datum)
    }
    for (const key of linkKeys) {
      expect(direct.model.edge(key)?.datum, `${label}, ${key}`).toEqual(full.model.edge(key)?.datum)
      expect(direct.model.endpoints(key), `${label}, ends of ${key}`).toEqual(
        full.model.endpoints(key),
      )
    }
    for (const key of zoneKeys) {
      expect(direct.model.shape(key)?.datum, `${label}, ${key}`).toEqual(
        full.model.shape(key)?.datum,
      )
    }
    const look = ({ scene }: { scene: Scene }) => ({
      nodes: columnsOf(scene.nodes, scene.nodes.alive, scene.nodes.keys, scene),
      edges: columnsOf(scene.edges, scene.edges.alive, scene.edges.keys, scene),
    })
    expect(look(direct), label).toEqual(look(full))
    expect(direct.scene.scales().size.extent, label).toEqual(full.scene.scales().size.extent)
    expect(direct.scene.scales().width.extent, label).toEqual(full.scene.scales().width.extent)
  }
  flush(-1)
  for (let round = 0; round < 40; round++) {
    const roll = random()
    if (roll < 0.5 || roll >= 0.85) {
      cut =
        random() < 0.1
          ? { time: Infinity, inclusive: true }
          : { time: Math.floor(random() * (span + 2)) - 1, inclusive: random() < 0.5 }
      for (const { model } of worlds) model.readAt(cut)
    }
    if (roll >= 0.5 && roll < 0.65) {
      const kind = Math.floor(random() * 3)
      const journal = journals[kind] as ReturnType<typeof shared<Entry>>
      const changes: SourceChange<Entry>[] = []
      for (let count = 1 + Math.floor(random() * 4); count > 0; count--) {
        const known = [...journal.rows.keys()]
        if (random() < 0.6 || known.length === 0) changes.push(insert(nextEntry, entry(kind)))
        else {
          const id = pick(known)
          changes.push({ type: 'delete', key: id, value: journal.rows.get(id) as Entry })
        }
      }
      journal.emit(changes)
    } else if (roll >= 0.65 && roll < 0.95) {
      const which = random()
      if (which < 0.45) changeRow(items, nodeKeys, itemOf)
      else if (which < 0.9) changeRow(links, linkKeys, linkOf)
      else changeRow(zones, zoneKeys, zoneOf)
    } else if (roll >= 0.95) {
      if (random() < 0.5) define()
      else {
        const key = pick(nodeKeys)
        for (const { model } of worlds) model.refresh('nodes', [key])
      }
    }
    flush(round)
  }

  function changeRow<T>(
    table: ReturnType<typeof shared<T>>,
    keys: string[],
    make: (id: string) => T,
  ) {
    const key = pick(keys)
    if (table.rows.has(key) && random() < 0.25) {
      table.emit([{ type: 'delete', key, value: table.rows.get(key) as T }])
    } else {
      table.emit([{ type: table.rows.has(key) ? 'update' : 'insert', key, value: make(key) }])
    }
  }
}

function insert<T>(key: Key, value: T): SourceChange<T> {
  return { type: 'insert', key, value }
}

describe('cursor steps read only the elements whose values change', () => {
  for (let first = 1; first <= 200; first += 25) {
    it(`match the full path on random histories, seeds ${first} to ${first + 24}`, () => {
      for (let seed = first; seed < first + 25; seed++) run(seed)
    })
  }
})
