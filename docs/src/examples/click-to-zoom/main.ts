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

const { items, links } = createCommunities(400, 600, 31)
const start = items.find((item) => item.weight === 6) ?? items[0]
const duration = 600

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
    nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
  ],
  scales: { size: { range: [10, 36] } },
  view: { maxZoom: 8 },
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

  function zoomTo(key: Key, label: string): void {
    const around = graph.paths.reach(key, { maxCost: 1 })
    graph.view.fit(around.nodes, { padding: 80, duration })
    status.textContent = messages.framed(label, around.nodes.length - 1)
  }

  graph.on('click', ({ target }) => {
    if (target?.kind === 'node') zoomTo(target.key, target.datum.label)
    else if (!target) {
      graph.view.fit(undefined, { duration })
      status.textContent = messages.hint
    }
  })

  const stop = graph.on('layoutend', () => {
    stop()
    if (start) zoomTo(start.id, start.label)
  })
  if (start) graph.selection.set({ nodes: [start.id] })

  return graph
}
