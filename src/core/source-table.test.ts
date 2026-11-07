import { describe, expect, it } from 'vitest'
import { edges, nodes } from '../marks'
import type {
  EdgeMark,
  EdgeOptions,
  Key,
  LiveSource,
  Mark,
  NodeMark,
  NodeOptions,
  SourceChange,
} from '../types'
import { createGraphModel } from './graph-model'
import { SourceTable } from './source-table'

type Item = { id: string; group: string }
type Link = { id: string; from: string; to: string }

class Live<T> implements LiveSource<T> {
  readonly items = new Map<Key, T>()
  readonly listeners = new Set<(changes: ReadonlyArray<SourceChange<T>>) => void>()

  subscribeChanges(
    callback: (changes: ReadonlyArray<SourceChange<T>>) => void,
    options?: { includeInitialState?: boolean },
  ) {
    this.listeners.add(callback)
    if (options?.includeInitialState) {
      callback([...this.items].map(([key, value]) => ({ type: 'insert' as const, key, value })))
    }
    return { unsubscribe: () => this.listeners.delete(callback) }
  }

  emit(changes: SourceChange<T>[]): void {
    for (const change of changes) {
      if (change.type === 'delete') this.items.delete(change.key)
      else this.items.set(change.key, change.value)
    }
    for (const listener of [...this.listeners]) listener(changes)
  }
}

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

const nodeLooks: readonly (() => NodeOptions<Item, undefined, undefined>)[] = [
  () => ({ color: 'group' }),
  () => ({ color: 'id' }),
  () => ({ label: { text: 'id', size: 12 } }),
  () => ({ label: { text: 'id', size: 14 } }),
]
const edgeLooks: readonly (() => EdgeOptions<Link, undefined, undefined>)[] = [
  () => ({ source: 'from', target: 'to', width: 1 }),
  () => ({ source: 'from', target: 'to', ends: { source: { width: 3 } } }),
]

const linkOptions = { source: 'from', target: 'to' } as const

interface Shown {
  readonly datum: unknown
  readonly look: string
  readonly slot: number
}

function commit(table: SourceTable<NodeMark<unknown>>, marks: readonly Mark[]): void {
  table.commit(table.prepare(marks as readonly NodeMark<unknown>[]))
}

describe('SourceTable', () => {
  it('keeps the fast path of a first flush when the definition is rebuilt before it', () => {
    const table = new SourceTable<NodeMark<unknown>>('nodes', () => {})
    const data = Array.from({ length: 10 }, (_, n): Item => ({ id: `n${n}`, group: 'a' }))
    commit(table, [nodes(data)])
    commit(table, [nodes(data)])
    commit(table, [nodes(data)])
    expect(table.sole()).not.toBeNull()
    expect(table.pendingCount).toBe(10)
  })

  it('applies a long queue of live changes to its items before the flush', () => {
    const table = new SourceTable<NodeMark<unknown>>('nodes', () => {})
    const live = new Live<Item>()
    commit(table, [nodes(live)])
    table.drain()
    table.clearDirty()
    for (let n = 0; n < 1000; n++) {
      live.emit([{ type: 'update', key: `k${n % 10}`, value: { id: `k${n % 10}`, group: `${n}` } }])
    }
    expect(table.pendingCount).toBe(0)
    for (let n = 0; n < 100_000; n++) {
      live.emit([{ type: 'update', key: `k${n % 10}`, value: { id: `k${n % 10}`, group: `${n}` } }])
    }
    expect(table.pendingCount).toBe(10)
    table.drain()
    const seen: unknown[] = []
    table.forEachDirty((_, __, source, datum) => {
      expect(source?.live).toBe(live)
      seen.push(datum)
    })
    expect(seen).toEqual([...live.items.values()])
  })

  it('reports only what differs after a long queue on a replacing live source', () => {
    const rows = Array.from({ length: 3000 }, (_, n): Item => ({ id: `n${n}`, group: 'a' }))
    const first = new Live<Item>()
    first.emit(rows.map((value) => ({ type: 'insert', key: value.id, value })))
    const model = createGraphModel()
    model.setMarks([nodes(first)])
    model.flush()
    const second = new Live<Item>()
    second.emit(rows.slice(0, 2000).map((value) => ({ type: 'insert', key: value.id, value })))
    model.setMarks([nodes(second)])
    const moved = Array.from({ length: 1500 }, (_, n): Item => ({ id: `n${n}`, group: 'b' }))
    for (const value of moved) second.emit([{ type: 'update', key: value.id, value }])
    for (const value of moved.slice(0, 500)) {
      second.emit([
        { type: 'update', key: value.id, value: rows[Number(value.id.slice(1))] as Item },
      ])
    }
    second.emit([{ type: 'insert', key: 'extra', value: { id: 'extra', group: 'c' } }])
    const changes = model.flush()
    expect(changes.nodes.added.map(({ key }) => key)).toEqual(['extra'])
    expect(changes.nodes.removed).toHaveLength(1000)
    expect(changes.nodes.updated.map(({ key }) => key).sort()).toEqual(
      moved
        .slice(500)
        .map(({ id }) => id)
        .sort(),
    )
    expect(model.node('n0')?.datum).toBe(rows[0])
    expect(model.node('n600')?.datum).toBe(moved[600])
  })
})

describe('marks, live sources and options against a reference', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`matches the reference with seed ${seed}`, () => {
      const next = random(seed)
      const pick = (count: number) => Math.floor(next() * count)
      const rows = Array.from({ length: 12 }, (_, n) =>
        Array.from({ length: 2 }, (_, v): Item => ({ id: `n${n}`, group: `g${v}` })),
      )
      const links = Array.from({ length: 16 }, (_, n) =>
        Array.from(
          { length: 2 },
          (_, v): Link => ({ id: `e${n}`, from: `n${(n * 7 + v) % 13}`, to: `n${(n * 3) % 13}` }),
        ),
      )
      const liveNodes = Array.from({ length: 3 }, () => new Live<Item>())
      const liveEdges = Array.from({ length: 2 }, () => new Live<Link>())
      const some = <T extends { id: string }>(table: T[][], most: number): T[] => {
        const seen = new Set<string>()
        const out: T[] = []
        for (let k = pick(most); k > 0; k--) {
          const row = table[pick(table.length)]?.[pick(2)]
          if (row && !seen.has(row.id)) {
            seen.add(row.id)
            out.push(row)
          }
        }
        return out
      }
      const nodeMark = (): NodeMark<Item> => {
        const look = nodeLooks[pick(nodeLooks.length)]?.() ?? {}
        if (next() < 0.5) return nodes(some(rows, 10), look)
        return nodes(liveNodes[pick(liveNodes.length)] as Live<Item>, look)
      }
      const edgeMark = (): EdgeMark<Link> => {
        const look = edgeLooks[pick(edgeLooks.length)]?.() ?? linkOptions
        if (next() < 0.5) return edges(some(links, 12), look)
        return edges(liveEdges[pick(liveEdges.length)] as Live<Link>, look)
      }
      const emit = <T extends { id: string }>(live: Live<T>, table: T[][]) => {
        const row = table[pick(table.length)]?.[pick(2)] as T
        if (live.items.has(row.id) && next() < 0.4) {
          live.emit([{ type: 'delete', key: row.id, value: row }])
        } else {
          live.emit([
            { type: live.items.has(row.id) ? 'update' : 'insert', key: row.id, value: row },
          ])
        }
      }
      const nodeMarks: NodeMark<Item>[] = [nodeMark(), nodeMark()]
      const edgeMarks: EdgeMark<Link>[] = [edgeMark()]
      const marks = (): Mark[] => [...nodeMarks, ...edgeMarks]
      const model = createGraphModel()
      model.setMarks(marks())
      const shownNodes = new Map<Key, Shown>()
      const shownEdges = new Map<Key, Shown>()
      const lookOf = (mark: Mark) => JSON.stringify((mark as NodeMark<unknown>).options)
      const firstOwners = <T extends { id: string }>(list: readonly Mark[]) => {
        const found = new Map<Key, { datum: T; mark: Mark }>()
        for (const mark of list) {
          const { data } = mark as NodeMark<T>
          const values = data instanceof Live ? (data as Live<T>).items.values() : data
          for (const datum of values as Iterable<T>) {
            if (!found.has(datum.id)) found.set(datum.id, { datum, mark })
          }
        }
        return found
      }

      for (let round = 0; round < 250; round++) {
        for (let step = 1 + pick(3); step > 0; step--) {
          const roll = next()
          if (roll < 0.25) nodeMarks[pick(nodeMarks.length)] = nodeMark()
          else if (roll < 0.4) edgeMarks[0] = edgeMark()
          else if (roll < 0.7) emit(liveNodes[pick(liveNodes.length)] as Live<Item>, rows)
          else if (roll < 0.85) emit(liveEdges[pick(liveEdges.length)] as Live<Link>, links)
          else {
            const at = pick(nodeMarks.length)
            const mark = nodeMarks[at] as NodeMark<Item>
            nodeMarks[at] =
              mark.data instanceof Live
                ? nodes(mark.data as Live<Item>, { ...mark.options })
                : nodes(mark.data as readonly Item[], { ...mark.options })
          }
          model.setMarks(marks())
        }
        const changes = model.flush()
        for (const { key } of changes.nodes.removed) shownNodes.delete(key)
        for (const { key } of changes.edges.removed) shownEdges.delete(key)
        for (const { key } of [...changes.nodes.added, ...changes.nodes.updated]) {
          const record = model.node(key)
          if (!record) throw new Error(`no node record for ${String(key)}`)
          const slot = nodeMarks.indexOf(record.mark as NodeMark<Item>)
          shownNodes.set(key, { datum: record.datum, look: lookOf(record.mark), slot })
        }
        for (const { key } of [...changes.edges.added, ...changes.edges.updated]) {
          const record = model.edge(key)
          if (!record) throw new Error(`no edge record for ${String(key)}`)
          const slot = edgeMarks.indexOf(record.mark as EdgeMark<Link>)
          shownEdges.set(key, { datum: record.datum, look: lookOf(record.mark), slot })
        }
        const wantedNodes = firstOwners<Item>(nodeMarks)
        const wantedEdges = firstOwners<Link>(edgeMarks)
        expect(new Set(shownNodes.keys()), `round ${round} nodes`).toEqual(
          new Set(wantedNodes.keys()),
        )
        for (const [key, want] of wantedNodes) {
          const seen = shownNodes.get(key)
          const where = `round ${round} node ${String(key)}`
          expect(seen?.datum, where).toBe(want.datum)
          expect(seen?.look, where).toBe(lookOf(want.mark))
          expect(seen?.slot, where).toBe(nodeMarks.indexOf(want.mark as NodeMark<Item>))
        }
        for (const [key, want] of wantedEdges) {
          const where = `round ${round} edge ${String(key)}`
          if (!wantedNodes.has(want.datum.from) || !wantedNodes.has(want.datum.to)) {
            expect(shownEdges.has(key), where).toBe(false)
            continue
          }
          const seen = shownEdges.get(key)
          expect(seen?.datum, where).toBe(want.datum)
          expect(seen?.look, where).toBe(lookOf(want.mark))
        }
      }
    })
  }
})
