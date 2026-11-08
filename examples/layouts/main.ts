import { defineGraph, edges, type Layout, mountGraph, nodes } from '@bruno00o/graph'
import { grid, type LayersDirection, layers, radial, rings } from '@bruno00o/graph/layouts'
import { force } from '@bruno00o/graph/layouts/force'
import { createHierarchy, type Item, type Link, nestHierarchy, type Sample } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { button, choice, createPage, status, themeToggle } from '../shared/page'

type Kind = keyof typeof messages.layoutKinds
type Shape = keyof typeof messages.layerSamples

function createLongEdges(count: number, levels: number, seed: number): Sample {
  let state = seed
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  const levelOf = Array.from({ length: count }, (_, index) =>
    Math.min(levels - 1, Math.floor((index / count) * levels)),
  )
  const firstOf = (level: number) => Math.ceil((level / levels) * count)
  const links: Link[] = []
  const degree = new Uint32Array(count)
  const pick = (level: number) => {
    const from = firstOf(level)
    return from + Math.floor(next() * (firstOf(level + 1) - from))
  }
  for (let node = firstOf(1); node < count; node++) {
    const level = levelOf[node] ?? 0
    const sources = new Set([pick(level - 1)])
    if (level > 1 && next() < 0.6) sources.add(pick(Math.floor(next() * (level - 1))))
    if (level > 1 && next() < 0.3) sources.add(pick(Math.floor(next() * (level - 1))))
    for (const source of sources) {
      links.push({ id: `e${links.length}`, from: `n${source}`, to: `n${node}`, strength: next() })
      degree[source] = (degree[source] ?? 0) + 1
      degree[node] = (degree[node] ?? 0) + 1
    }
  }
  const items = Array.from({ length: count }, (_, index) => ({
    id: `n${index}`,
    label: messages.node(formatNumber(index + 1)),
    group: messages.group(
      String.fromCharCode(65 + Math.floor(((levelOf[index] ?? 0) / levels) * 8)),
    ),
    weight: Math.min(100, 1 + (degree[index] ?? 0)),
    x: 0,
    y: 0,
  }))
  return { items, links }
}

const params = new URLSearchParams(location.search)
const shapes = Object.keys(messages.layerSamples) as Shape[]
const shape = shapes.find((value) => value === params.get('sample')) ?? 'hierarchy'
const grouped = shape === 'hierarchy' && params.get('groups') === 'nested'
const hierarchy = createHierarchy(160, 220)
const sample = shape === 'long' ? createLongEdges(400, 18, 7) : hierarchy
const { links } = sample
const items = grouped ? nestHierarchy(hierarchy) : sample.items
const directions = Object.keys(messages.directions) as LayersDirection[]
let direction: LayersDirection = 'down'
const layouts: Record<Kind, Layout> = {
  layers: layers({ direction }),
  force: force(),
  grid: grid<Item>({
    order: (a, b) => a.group.localeCompare(b.group) || b.weight - a.weight,
  }),
  rings: rings(),
  radial: radial(),
}
let kind: Kind = 'layers'

const { header, main } = createPage(messages.layouts)
const graph = mountGraph(main, {
  definition: defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
      nodes<Item>(items, {
        color: 'group',
        size: 'weight',
        label: 'label',
        parent: 'parent',
        container: { padding: 14 },
      }),
    ],
    scales: { size: { range: [10, 26] } },
    layout: layouts.layers,
    interaction: { lasso: true },
  }),
  ariaLabel: messages.graphLabel(formatNumber(sample.items.length), formatNumber(links.length)),
})

const progress = status()
let started = performance.now()
graph.on('layoutstart', () => {
  started = performance.now()
})
graph.on('layoutend', ({ completed }) => {
  progress.textContent = completed
    ? messages.layoutDone((performance.now() - started) / 1000)
    : messages.layoutStopped
})

const hint = document.createElement('span')
hint.className = 'hint'
hint.textContent = messages.layoutsHint

const kinds = Object.keys(messages.layoutKinds) as Kind[]

const kindChoice = choice(
  messages.layoutKind,
  kinds.map((value) => ({ value, text: messages.layoutKinds[value] })),
  kind,
  (value) => {
    kind = kinds.find((candidate) => candidate === value) ?? 'layers'
    void graph.layout.run(layouts[kind], { fit: true })
  },
)

header.append(
  hint,
  progress,
  kindChoice,
  choice(
    messages.direction,
    directions.map((value) => ({ value, text: messages.directions[value] })),
    direction,
    (value) => {
      direction = directions.find((candidate) => candidate === value) ?? 'down'
      layouts.layers = layers({ direction })
      kind = 'layers'
      const select = kindChoice.querySelector('select')
      if (select) select.value = kind
      void graph.layout.run(layouts.layers, { fit: true })
    },
  ),
  choice(
    messages.layerSample,
    shapes.map((value) => ({ value, text: messages.layerSamples[value] })),
    shape,
    (value) => {
      params.set('sample', value)
      if (value !== 'hierarchy') params.delete('groups')
      location.search = params.toString()
    },
  ),
  choice(
    messages.groupMode,
    (['none', 'nested'] as const).map((value) => ({
      value,
      text: messages.hierarchyGroupModes[value],
    })),
    grouped ? 'nested' : 'none',
    (value) => {
      params.set('groups', value)
      if (value === 'nested') params.delete('sample')
      location.search = params.toString()
    },
  ),
  button(messages.arrange, () => {
    const keys = graph.store.get().selection.nodes
    if (keys.length > 0) void graph.layout.run(layouts[kind], { keys })
  }),
  button(messages.fit, () => graph.view.fit({ duration: 400 })),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph })
