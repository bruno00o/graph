import { defineGraph, edges, type Layout, mountGraph, nodes } from '@bruno00o/graph'
import { grid, radial, rings } from '@bruno00o/graph/layouts'
import { force } from '@bruno00o/graph/layouts/force'
import { createCommunities, type Item, type Link } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { button, choice, createPage, status, themeToggle } from '../shared/page'

type Kind = keyof typeof messages.layoutKinds

const { items, links } = createCommunities(300, 420)
const layouts: Record<Kind, Layout> = {
  force: force(),
  grid: grid<Item>({
    order: (a, b) => a.group.localeCompare(b.group) || b.weight - a.weight,
  }),
  rings: rings(),
  radial: radial(),
}
let kind: Kind = 'force'

const { header, main } = createPage(messages.layouts)
const graph = mountGraph(main, {
  definition: defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
    ],
    scales: { size: { range: [8, 28] } },
    layout: layouts.force,
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

header.append(
  hint,
  progress,
  choice(
    messages.layoutKind,
    kinds.map((value) => ({ value, text: messages.layoutKinds[value] })),
    kind,
    (value) => {
      kind = kinds.find((candidate) => candidate === value) ?? 'force'
      void graph.layout.run(layouts[kind], { fit: true })
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
