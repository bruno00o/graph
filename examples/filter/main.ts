import { defineGraph, edges, type LiveSource, mountGraph, nodes } from '@bruno00o/graph'
import { subset } from '@bruno00o/graph/db'
import {
  and,
  BTreeIndex,
  type Collection,
  createCollection,
  createLiveQueryCollection,
  eq,
  gte,
  inArray,
  localOnlyCollectionOptions,
  or,
} from '@tanstack/db'
import { createSample, type Item, type Link } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { button, choice, createPage, status, themeToggle } from '../shared/page'
import { createLinkCollection } from './links'

const sizes = [50_000, 200_000, 500_000]
const groups = 'ABCDEFGH'.split('').map((letter) => messages.group(letter))
const params = new URLSearchParams(location.search)
const nodeCount = Number(params.get('nodes') ?? 200_000)
const { items, links } = createSample(nodeCount, nodeCount * 2)

type Mode = 'subset' | 'query'
let mode: Mode = params.get('source') === 'query' ? 'query' : 'subset'
let minimum = 20
let group = ''
let opened: string[] = []

const records = createCollection(
  localOnlyCollectionOptions({
    id: 'filter-items',
    getKey: (item: Item) => item.id,
    initialData: items,
  }),
)
records.createIndex((item) => item.weight, { indexType: BTreeIndex })
const loaded = status()
const relations = createLinkCollection(links, () => {
  loaded.textContent = messages.linksLoaded(relations.size)
})

const filtered = (): LiveSource<Item> | Collection<Item, string> => {
  if (mode === 'query') {
    return createLiveQueryCollection((q) =>
      q
        .from({ item: records })
        .where(({ item }) =>
          group ? and(gte(item.weight, minimum), eq(item.group, group)) : gte(item.weight, minimum),
        ),
    )
  }
  return subset(records, (item) =>
    group ? and(gte(item.weight, minimum), eq(item.group, group)) : gte(item.weight, minimum),
  )
}
const around = () =>
  opened.length === 0
    ? []
    : [
        edges<Link>(
          subset(relations, (link) => or(inArray(link.from, opened), inArray(link.to, opened))),
          { source: 'from', target: 'to' },
        ),
      ]

let shown = filtered()
let linked = around()

const define = () =>
  defineGraph({
    marks: [
      ...linked,
      nodes<Item>(shown, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
    ],
    interaction: { select: false },
    states: { opened: { stroke: 'var(--graph-ink)', strokeWidth: 2 } },
  })

const { header, main } = createPage(messages.filter)
const graph = mountGraph(main, { definition: define(), ariaLabel: messages.filterLabel })
const timing = status()

const measure = (change: () => void) => {
  let start = performance.now()
  requestAnimationFrame(() => {
    start = performance.now()
  })
  const before = performance.now()
  change()
  const database = performance.now() - before
  requestAnimationFrame(() => {
    timing.textContent = messages.filterTiming(database, performance.now() - start)
  })
}

const refilter = () => {
  const previous = shown
  measure(() => {
    shown = filtered()
    graph.update({ definition: define() })
  })
  if ('cleanup' in previous) void previous.cleanup()
}

const reopen = (keys: string[]) => {
  opened = keys
  linked = around()
  graph.update({ definition: define() })
  graph.states.set('opened', { nodes: opened })
}

graph.on('doubleclick', ({ target }) => {
  if (target?.kind !== 'node' || opened.includes(String(target.key))) return
  reopen([...opened, String(target.key)])
})

const weight = document.createElement('label')
const range = document.createElement('input')
range.type = 'range'
range.min = '1'
range.max = '100'
range.value = String(minimum)
const value = document.createElement('output')
value.textContent = formatNumber(minimum)
range.addEventListener('input', () => {
  value.textContent = formatNumber(Number(range.value))
})
range.addEventListener('change', () => {
  minimum = Number(range.value)
  refilter()
})
weight.append(`${messages.minimumWeight} `, range, value)

const hint = document.createElement('span')
hint.className = 'hint'
hint.textContent = messages.filterHint

header.append(
  hint,
  timing,
  loaded,
  weight,
  choice(
    messages.groupFilter,
    [
      { value: '', text: messages.allGroups },
      ...groups.map((name) => ({ value: name, text: name })),
    ],
    group,
    (next) => {
      group = next
      refilter()
    },
  ),
  choice(
    messages.filterSource,
    (['subset', 'query'] as const).map((value) => ({ value, text: messages.filterSources[value] })),
    mode,
    (next) => {
      mode = next === 'query' ? 'query' : 'subset'
      refilter()
    },
  ),
  choice(
    messages.size,
    sizes.map((size) => ({ value: String(size), text: formatNumber(size) })),
    String(nodeCount),
    (next) => {
      params.set('nodes', next)
      location.search = params.toString()
    },
  ),
  button(messages.unload, () => reopen([])),
  button(messages.fit, () => graph.view.fit(undefined, { duration: 400 })),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph, records, relations })
