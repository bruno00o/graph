import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
  type Point,
} from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createCommunities, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

const { items, links } = createCommunities(160, 240, 29)
const hubs = [...items].sort((a, b) => b.weight - a.weight).slice(0, 3)
const corners = hubs.map((hub, index): [Key, Point] => {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / hubs.length
  return [hub.id, { x: Math.cos(angle) * 320, y: Math.sin(angle) * 320 }]
})

export function mount(container: HTMLElement): GraphInstance {
  const pins = new Map<Key, Point>()

  const define = () =>
    defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to' }),
        nodes<Item>(items, {
          x: (item) => pins.get(item.id)?.x,
          y: (item) => pins.get(item.id)?.y,
          color: 'group',
          size: 'weight',
          label: 'label',
        }),
      ],
      scales: { size: { range: [10, 36] } },
      states: { pinned: { outline: 'var(--graph-ink)', outlineWidth: 3, label: true } },
      layout: force(),
    })

  const graph = mountGraph(container, {
    definition: define(),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)

  function settle(fit = false): void {
    graph.update({ definition: define() })
    graph.states.set('pinned', { nodes: [...pins.keys()] })
    status.textContent = messages.pinned(pins.size)
    void graph.layout.run(undefined, { fit })
  }

  graph.on('dragend', ({ keys }) => {
    for (const key of keys) {
      const position = graph.positions.get(key)
      if (position) pins.set(key, position)
    }
    settle()
  })

  graph.on('doubleclick', ({ target }) => {
    if (target?.kind !== 'node' || !pins.delete(target.key)) return
    settle()
  })

  const stop = graph.on('layoutend', () => {
    stop()
    for (const [key, corner] of corners) pins.set(key, corner)
    settle(true)
  })

  status.textContent = messages.pinned(0)
  return graph
}
