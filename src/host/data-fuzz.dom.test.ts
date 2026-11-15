import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineGraph } from '../define-graph'
import { historyFrom } from '../history'
import { createLegend, type Legend } from '../legend'
import { edges, nodes } from '../marks'
import { type FakeDom, fakeRenderer, installDom } from '../testing/dom'
import type { HistoryValues, Key, TimeValue, TimeWindow } from '../types'
import { createGraphHost, type GraphInstance } from './mount-graph'

type Time = TimeValue | readonly TimeValue[] | undefined
type Item = { id: string; parent: string | null; kind: string; t?: Time; x: number; y: number }
type Link = { id: string; from: string; to: string; kind: string; t?: Time }
type Entry<T> = {
  id: number
  key: string
  time: number
  values?: HistoryValues<T>
  present?: boolean
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

const groupIds = ['g0', 'g1', 'g2']
const leafIds = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']
const kinds = ['k0', 'k1']

interface World {
  items: Item[]
  links: Link[]
  nodeLog: Entry<Item>[]
  edgeLog: Entry<Link>[]
  merge: number
  halves: boolean
  foldedAsOne: boolean
  between: 'members' | 'groups'
  directed: boolean
  fade: number
  history: boolean
  twins: boolean
}

let dom: FakeDom

function definitionOf(world: World) {
  const nodeHistory = world.history
    ? historyFrom(world.nodeLog, { values: 'values', present: 'present' })
    : undefined
  const edgeHistory = world.history
    ? historyFrom(world.edgeLog, { values: 'values', present: 'present' })
    : undefined
  const firstItems = world.items.filter((item) => groupIds.includes(item.id) || item.x < 50)
  const secondItems = world.items.filter((item) => !firstItems.includes(item))
  if (world.twins) {
    const twin = firstItems.find((item) => !groupIds.includes(item.id))
    if (twin) secondItems.unshift({ ...twin, kind: twin.kind === 'k0' ? 'k1' : 'k0', t: 3 })
    const other = secondItems.find((item) => item !== secondItems[0])
    if (other) firstItems.push({ ...other, kind: 'k0', parent: null })
  }
  return defineGraph({
    marks: [
      nodes(firstItems, {
        x: 'x',
        y: 'y',
        parent: 'parent',
        color: 'kind',
        time: 't',
        layer: 'a',
        ...(nodeHistory ? { history: nodeHistory } : {}),
      }),
      nodes(secondItems, {
        x: 'x',
        y: 'y',
        parent: 'parent',
        color: 'kind',
        time: 't',
        layer: 'b',
        ...(nodeHistory ? { history: nodeHistory } : {}),
      }),
      edges(world.links, {
        source: 'from',
        target: 'to',
        color: 'kind',
        time: 't',
        betweenGroups: world.between,
        aggregate: {
          color: (aggregate: { data: readonly { kind: string }[] }) =>
            aggregate.data.map((each) => each.kind).sort()[0] ?? 'none',
        } as never,
        merge:
          world.merge === 0
            ? {
                by: 'kind',
                min: 2,
                directed: world.directed,
                halves: world.halves && !world.directed,
                foldedAsOne: world.foldedAsOne,
              }
            : world.merge === 1
              ? { min: 2, directed: world.directed, foldedAsOne: world.foldedAsOne }
              : undefined,
        ...(edgeHistory ? { history: edgeHistory } : {}),
      }),
    ],
    time: { fade: world.fade },
  })
}

function mount(
  world: World,
  window: TimeWindow | null,
  folded: readonly Key[],
  hidden: readonly string[],
) {
  const container = document.createElement('div')
  document.body.append(container)
  const graph = createGraphHost(
    container,
    {
      definition: definitionOf(world),
      ariaLabel: 'graph',
      initialTime: window,
      initialFolded: folded,
      initialHiddenLayers: hidden as never,
    },
    () => fakeRenderer(),
  ) as unknown as GraphInstance
  dom.flushFrames()
  return graph
}

const entries = [
  {
    entries: [
      {
        id: 'k0',
        label: 'k0',
        swatch: { kind: 'nodes' as const },
        nodes: (datum: unknown) => (datum as { kind?: unknown }).kind === 'k0',
        edges: (datum: unknown) => (datum as { kind?: unknown }).kind === 'k0',
      },
      {
        id: 'agg',
        label: 'agg',
        swatch: { kind: 'edges' as const },
        edges: (datum: unknown) => typeof (datum as { count?: unknown }).count === 'number',
        nodes: (datum: unknown) => typeof (datum as { count?: unknown }).count === 'number',
      },
    ],
  },
]

function legendOf(graph: GraphInstance): Legend {
  return createLegend(graph as never, { entries: entries as never })
}

function readLegendState(legend: Legend) {
  const state = legend.store.state
  const categories: string[] = []
  const color = state.color
  if (color?.type === 'categories') {
    for (const item of color.items) {
      if (item.nodes + item.edges > 0)
        categories.push(`${String(item.value)}:${item.nodes}:${item.edges}`)
    }
  }
  const counted: string[] = []
  for (const section of state.entries) {
    for (const item of section.items) counted.push(`${item.id}:${item.nodes}:${item.edges}`)
  }
  return { categories: categories.sort(), entries: counted }
}

function snapshot(graph: GraphInstance) {
  const shown = graph.shown()
  const count = graph.count()
  const data: Record<string, unknown> = {}
  for (const key of [...groupIds, ...leafIds]) {
    const datum = graph.datumOf({ kind: 'node', key }) as Partial<Item> | undefined
    data[key] = datum ? { kind: datum.kind, parent: datum.parent, t: datum.t } : null
  }
  return {
    nodes: [...shown.nodes].map(String).sort(),
    edges: [...shown.edges].map(String).sort(),
    count,
    folded: [...graph.groups.folded()].map(String).sort(),
    data,
  }
}

function randomTime(random: () => number): Time {
  const roll = random()
  if (roll < 0.45) return undefined
  const a = Math.floor(random() * 10)
  const b = a + Math.floor(random() * 5)
  if (roll < 0.6) return a
  if (roll < 0.8) return { start: a, end: b }
  const c = b + 1 + Math.floor(random() * 3)
  return [
    { start: a, end: b },
    { start: c, end: c + Math.floor(random() * 3) },
  ]
}

function randomWorld(random: () => number): World {
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T
  const items: Item[] = []
  for (const id of groupIds) {
    if (random() < 0.85)
      items.push({
        id,
        parent:
          random() < 0.3 && groupIds.indexOf(id) > 0
            ? pick(groupIds.slice(0, groupIds.indexOf(id)))
            : null,
        kind: pick(kinds),
        x: 0,
        y: 0,
      })
  }
  for (const id of leafIds) {
    if (random() < 0.85)
      items.push({
        id,
        parent: random() < 0.6 ? pick(groupIds) : null,
        kind: pick(kinds),
        t: randomTime(random),
        x: Math.floor(random() * 100),
        y: 0,
      })
  }
  const links: Link[] = []
  for (let at = 0; at < 10; at++) {
    links.push({
      id: `e${at}`,
      from: pick(leafIds),
      to: pick(leafIds),
      kind: pick(kinds),
      t: randomTime(random),
    })
  }
  const nodeLog: Entry<Item>[] = []
  const edgeLog: Entry<Link>[] = []
  for (let at = 0; at < 8; at++) {
    const roll = random()
    const entry: Entry<Item> = { id: at, key: pick(leafIds), time: Math.floor(random() * 12) }
    if (roll < 0.5) entry.values = { kind: pick(kinds) }
    else if (roll < 0.7) entry.values = { parent: random() < 0.5 ? null : pick(groupIds) }
    else entry.present = random() < 0.5
    nodeLog.push(entry)
  }
  for (let at = 0; at < 6; at++) {
    const roll = random()
    const entry: Entry<Link> = {
      id: at,
      key: `e${Math.floor(random() * 10)}`,
      time: Math.floor(random() * 12),
    }
    if (roll < 0.6) entry.values = { kind: pick(kinds) }
    else entry.present = random() < 0.5
    edgeLog.push(entry)
  }
  return {
    items,
    links,
    nodeLog,
    edgeLog,
    merge: Math.floor(random() * 3),
    halves: random() < 0.5,
    foldedAsOne: random() < 0.5,
    between: random() < 0.5 ? 'members' : 'groups',
    directed: random() < 0.5,
    fade: random() < 0.25 ? 2 : 0,
    history: random() < 0.7,
    twins: random() < 0.3,
  }
}

function randomWindow(random: () => number): TimeWindow | null {
  const roll = random()
  if (roll < 0.15) return null
  const a = Math.floor(random() * 12)
  if (roll < 0.35) return { start: a, end: a }
  return { start: a, end: a + 1 + Math.floor(random() * 4) }
}

function run(seed: number): void {
  const random = generator(seed)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T
  let world = randomWorld(random)
  let window = randomWindow(random)
  const graph = mount(world, window, [], [])
  const legend = legendOf(graph)
  const log: string[] = []
  for (let step = 0; step < 14; step++) {
    const roll = random()
    if (roll < 0.3) {
      window = randomWindow(random)
      graph.time.set(window)
      log.push(`time ${JSON.stringify(window)}`)
    } else if (roll < 0.45) {
      const key = pick(groupIds)
      graph.groups.toggle(key)
      log.push(`toggle ${key}`)
    } else if (roll < 0.55) {
      const name = pick(['a', 'b'])
      if (graph.layers.isHidden(name as never)) graph.layers.show([name] as never)
      else graph.layers.hide([name] as never)
      log.push(`layer ${name}`)
    } else {
      const next = randomWorld(random)
      const keep = random()
      world = {
        ...world,
        items:
          keep < 0.5 ? next.items : world.items.map((item) => ({ ...item, kind: pick(kinds) })),
        links: keep < 0.3 ? next.links : world.links,
        nodeLog: keep < 0.6 ? next.nodeLog : world.nodeLog,
        edgeLog: keep < 0.6 ? next.edgeLog : world.edgeLog,
        merge: random() < 0.2 ? next.merge : world.merge,
      }
      graph.update({ definition: definitionOf(world) })
      log.push('update')
    }
    dom.flushFrames()
    const fresh = mount(world, window, graph.groups.folded(), graph.layers.hidden() as string[])
    vi.advanceTimersByTime(5_000)
    dom.flushFrames()
    vi.advanceTimersByTime(5_000)
    const other = legendOf(fresh)
    const got = { ...snapshot(graph), legend: readLegendState(legend) }
    const want = { ...snapshot(fresh), legend: readLegendState(other) }
    other.destroy()
    fresh.destroy()
    expect(got, `seed ${seed} after ${log.join(', ')}`).toEqual(want)
  }
  legend.destroy()
  graph.destroy()
}

describe('incremental changes against a fresh mount', () => {
  beforeEach(() => {
    dom = installDom()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    dom.restore()
  })

  for (let first = 41; first <= 91; first += 10) {
    it(`agrees with a fresh graph, seeds ${first} to ${first + 9}`, { timeout: 30_000 }, () => {
      for (let seed = first; seed < first + 10; seed++) run(seed)
    })
  }
})
