import {
  createPathFinder,
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

const { items, links } = createSample(300, 250, 10, 53, 0)

const finder = createPathFinder({
  marks: [nodes<Item>(items), edges<Link>(links, { source: 'from', target: 'to' })],
})
const componentOf = new Map<Key, number>()
const sizes: number[] = []
for (const item of items) {
  if (componentOf.has(item.id)) continue
  const { nodes: members } = finder.reach(item.id)
  for (const key of members) componentOf.set(key, sizes.length)
  sizes.push(members.length)
}
finder.destroy()

const rank = new Map(
  sizes
    .map((size, component) => ({ size, component }))
    .sort((a, b) => b.size - a.size)
    .map(({ component }, place) => [component, place]),
)
const colorOf = (key: Key) => {
  const place = rank.get(componentOf.get(key) ?? -1) ?? Number.POSITIVE_INFINITY
  return place < 8 ? `var(--graph-cat-${place + 1})` : 'var(--graph-node)'
}

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', stroke: (link) => colorOf(link.from) }),
    nodes<Item>(items, { fill: (item) => colorOf(item.id), size: 'weight', label: 'label' }),
  ],
  scales: { size: { range: [8, 28] } },
  layout: force(),
})

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const summary = messages.summary(sizes.length, Math.max(...sizes))
  const status = document.createElement('output')
  status.className = 'example-status'
  status.textContent = summary
  container.append(status)

  graph.on('click', ({ target }) => {
    if (target?.kind !== 'node') {
      status.textContent = summary
      return
    }
    const component = graph.paths.reach(target.key)
    graph.selection.set({ nodes: component.nodes })
    graph.view.fit(component.nodes, { padding: 64, duration: 500 })
    status.textContent = messages.component(component.nodes.length)
  })

  return graph
}
