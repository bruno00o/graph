import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createCommunities, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

const { items, links } = createCommunities(150, 240)
const labels = new Map(items.map((item) => [item.id, item.label]))

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Item>(items, { color: 'group', size: 'weight', label: { text: 'label', size: 18 } }),
  ],
  scales: { size: { range: [10, 36] } },
  states: {
    near: {
      nodes: {
        outline: 'var(--graph-accent)',
        label: true,
        raise: true,
        others: { opacity: 0.12, label: false },
      },
      edges: {
        stroke: 'var(--graph-accent)',
        strokeWidth: 2,
        raise: true,
        others: { opacity: 0.12 },
      },
    },
  },
  layout: force(),
})

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  status.textContent = messages.hint
  container.append(status)

  function showNode(key: Key, label: string): void {
    const near = graph.paths.reach(key, { maxCost: 1 })
    graph.states.set('near', near)
    status.textContent = messages.node(label, near.nodes.length - 1)
  }

  graph.on('pointerenter', ({ target }) => {
    if (target.kind === 'node') {
      showNode(target.key, target.datum.label)
      return
    }
    const { from, to } = target.datum
    graph.states.set('near', { nodes: [from, to], edges: [target.key] })
    status.textContent = messages.edge(labels.get(from) ?? from, labels.get(to) ?? to)
  })

  graph.on('pointerleave', () => {
    graph.states.clear()
    status.textContent = messages.hint
  })

  const hub = items.reduce((best, item) => (item.weight > best.weight ? item : best))
  showNode(hub.id, hub.label)

  return graph
}
