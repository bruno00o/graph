import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { createTiers, type Item, type Link, tierWeights } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { button, createPage, exportButtons, status, themeToggle } from '../shared/page'

const branchZoom = 0.55
const leafZoom = 1.3
const ringZoom = 0.9

const { items, links } = createTiers()
const ring = links.filter((link) => link.id.startsWith('r'))
const tree = links.filter((link) => !link.id.startsWith('r'))

const minZoomOf = (item: Item): number | null =>
  item.weight === tierWeights.leaf
    ? leafZoom
    : item.weight === tierWeights.branch
      ? branchZoom
      : null

const definition = defineGraph({
  marks: [
    edges<Link>(ring, {
      source: 'from',
      target: 'to',
      dash: 'dashed',
      opacity: 0.7,
      maxZoom: ringZoom,
    }),
    edges<Link>(tree, { source: 'from', target: 'to', opacity: 0.6 }),
    nodes<Item>(items, {
      x: 'x',
      y: 'y',
      color: 'group',
      size: 'weight',
      label: 'label',
      minZoom: minZoomOf,
    }),
  ],
  scales: { size: { range: [8, 44] } },
})

const { header, main } = createPage(messages.zoomDetail)
const graph = mountGraph(main, {
  definition,
  ariaLabel: messages.graphLabel(formatNumber(items.length), formatNumber(links.length)),
})

const progress = status()
const describe = () => {
  const { zoom } = graph.store.get().view
  const shown = 1 + (zoom > branchZoom ? 1 : 0) + (zoom > leafZoom ? 1 : 0)
  progress.textContent = messages.zoomStatus(zoom, shown)
}
graph.store.subscribe(describe)
describe()

const hint = document.createElement('span')
hint.className = 'hint'
hint.textContent = messages.zoomDetailHint

header.append(
  hint,
  progress,
  button(messages.fit, () => graph.view.fit(undefined, { duration: 400 })),
  ...exportButtons(graph, 'zoom', { png: messages.exportPng, svg: messages.exportSvg }),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph })
