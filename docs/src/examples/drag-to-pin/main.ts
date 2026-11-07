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

const { items, links } = createCommunities(160, 240, 29)
const nodeKeys = items.map((item) => item.id)
const hubs = [...items].sort((a, b) => b.weight - a.weight).slice(0, 3)
const corners = hubs.map((hub, index): [Key, { x: number; y: number }] => {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / hubs.length
  return [hub.id, { x: Math.cos(angle) * 320, y: Math.sin(angle) * 320 }]
})

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
  ],
  scales: { size: { range: [10, 36] } },
  states: { pinned: { outline: 'var(--graph-ink)', outlineWidth: 3, label: true } },
  layout: force(),
})

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(items.length, links.length),
  })
  const pinned = new Set<Key>()

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)

  function show(): void {
    graph.states.set('pinned', { nodes: pinned })
    status.textContent = messages.pinned(pinned.size)
  }

  function settle(fit = false): void {
    graph.layout.run(undefined, { keys: nodeKeys.filter((key) => !pinned.has(key)), fit })
  }

  graph.on('dragend', ({ keys }) => {
    for (const key of keys) pinned.add(key)
    show()
    settle()
  })

  graph.on('doubleclick', ({ target }) => {
    if (target?.kind !== 'node' || !pinned.delete(target.key)) return
    show()
    settle()
  })

  const stop = graph.on('layoutend', () => {
    stop()
    graph.positions.set(corners)
    for (const [key] of corners) pinned.add(key)
    show()
    settle(true)
  })

  show()
  return graph
}
