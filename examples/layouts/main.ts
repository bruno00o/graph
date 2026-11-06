import { defineGraph, edges, type Layout, mountGraph, nodes } from '@bruno00o/graph'
import { grid, type LayersDirection, layers, radial, rings } from '@bruno00o/graph/layouts'
import { force } from '@bruno00o/graph/layouts/force'
import { createHierarchy, type Item, type Link } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { button, choice, createPage, status, themeToggle } from '../shared/page'

type Kind = keyof typeof messages.layoutKinds

const { items, links } = createHierarchy(160, 220)
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
      nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
    ],
    scales: { size: { range: [10, 26] } },
    layout: layouts.layers,
    interaction: { lasso: true },
  }),
  ariaLabel: messages.graphLabel(formatNumber(items.length), formatNumber(links.length)),
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
  button(messages.arrange, () => {
    const keys = graph.store.get().selection.nodes
    if (keys.length > 0) void graph.layout.run(layouts[kind], { keys })
  }),
  button(messages.fit, () => graph.view.fit(undefined, { duration: 400 })),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph })
