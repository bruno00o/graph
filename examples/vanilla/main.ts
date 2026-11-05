import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { button, choice, createPage, themeToggle } from '../shared/page'

const sizes = [1_000, 10_000, 50_000]
const params = new URLSearchParams(location.search)
const nodeCount = Number(params.get('nodes') ?? 1_000)
const edgeCount = Number(params.get('edges') ?? nodeCount * 2)
const { items, links } = createSample(nodeCount, edgeCount)

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
})

const { header, main } = createPage(messages.vanilla)
const graph = mountGraph(main, {
  definition,
  ariaLabel: messages.graphLabel(formatNumber(items.length), formatNumber(links.length)),
})

header.append(
  choice(
    messages.size,
    [...new Set([...sizes, nodeCount])].map((size) => ({
      value: String(size),
      text: formatNumber(size),
    })),
    String(nodeCount),
    (value) => {
      location.search = `?nodes=${value}&edges=${Number(value) * 2}`
    },
  ),
  button(messages.fit, () => graph.view.fit(undefined, { duration: 400 })),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph })
