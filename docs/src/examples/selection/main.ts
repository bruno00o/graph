import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

const { items, links } = createSample(1_000, 2_000)

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
  states: { muted: { opacity: 0.15, label: false } },
  interaction: { lasso: true },
})

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  status.textContent = messages.selection(0, 0)
  container.append(status)

  graph.on('selectionchange', ({ selection }) => {
    status.textContent = messages.selection(selection.nodes.length, selection.edges.length)
    if (selection.nodes.length === 0) {
      graph.states.clear('muted')
      return
    }
    const keepNodes = new Set<Key>(selection.nodes)
    const keepEdges = new Set<Key>()
    for (const key of selection.nodes) {
      for (const neighbor of graph.neighbors(key)) keepNodes.add(neighbor)
      for (const edge of graph.edgesOf(key)) keepEdges.add(edge)
    }
    graph.states.set('muted', {
      nodes: items.filter((item) => !keepNodes.has(item.id)).map((item) => item.id),
      edges: links.filter((link) => !keepEdges.has(link.id)).map((link) => link.id),
    })
  })

  return graph
}
