import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { button, choice, createPage, status, themeToggle } from '../shared/page'

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
  states: {
    muted: { opacity: 0.15, label: false },
  },
})

const { header, main } = createPage(messages.vanilla)
const graph = mountGraph(main, {
  definition,
  ariaLabel: messages.graphLabel(formatNumber(items.length), formatNumber(links.length)),
})

const selectionStatus = status()
const showSelection = () => {
  const { nodes: selectedNodes, edges: selectedEdges } = graph.selection.get()
  selectionStatus.textContent = messages.selection(selectedNodes.length, selectedEdges.length)
}
showSelection()

graph.on('selectionchange', ({ nodes: selected }) => {
  showSelection()
  if (selected.length === 0) {
    graph.states.clear('muted')
    return
  }
  const keepNodes = new Set<string | number>(selected)
  const keepEdges = new Set<string | number>()
  for (const key of selected) {
    for (const neighbor of graph.neighbors(key)) keepNodes.add(neighbor)
    for (const edge of graph.edgesOf(key)) keepEdges.add(edge)
  }
  graph.states.set('muted', {
    nodes: items.filter((item) => !keepNodes.has(item.id)).map((item) => item.id),
    edges: links.filter((link) => !keepEdges.has(link.id)).map((link) => link.id),
  })
})

header.append(
  selectionStatus,
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
