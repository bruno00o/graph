import {
  createPathFinder,
  defineGraph,
  edges,
  type GraphInstance,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { layers } from '@bruno00o/graph/layouts'
import { createHierarchy, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

const { items, links } = createHierarchy(90, 130, 8)

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
    nodes<Item>(items, { label: 'label', size: () => 18 }),
  ],
  states: {
    downstream: {
      fill: 'var(--graph-cat-1)',
      stroke: 'var(--graph-cat-1)',
      strokeWidth: 2,
      raise: true,
    },
    upstream: {
      fill: 'var(--graph-cat-2)',
      stroke: 'var(--graph-cat-2)',
      strokeWidth: 2,
      raise: true,
    },
    traced: { others: { opacity: 0.15, label: false } },
  },
  interaction: { select: 'single' },
  layout: layers(),
})

const backward = createPathFinder({
  marks: [nodes<Item>(items), edges<Link>(links, { source: 'to', target: 'from' })],
})

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)

  graph.on('selectionchange', ({ nodes: [start] }) => {
    if (start === undefined) {
      graph.states.clear()
      status.textContent = messages.hint
      return
    }
    const down = graph.paths.reach(start, { directed: true })
    const up = backward.reach(start, { directed: true })
    graph.states.set('downstream', { nodes: down.nodes.slice(1), edges: down.edges })
    graph.states.set('upstream', { nodes: up.nodes.slice(1), edges: up.edges })
    graph.states.set('traced', {
      nodes: [...down.nodes, ...up.nodes],
      edges: [...down.edges, ...up.edges],
    })
    status.textContent = messages.counts(up.nodes.length - 1, down.nodes.length - 1)
  })

  graph.selection.set({ nodes: ['n23'] })

  return graph
}
