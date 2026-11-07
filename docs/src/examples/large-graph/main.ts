import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'

const { items, links } = createSample(50_000, 100_000)

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
})

export function mount(container: HTMLElement): GraphInstance {
  return mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(items.length, links.length),
  })
}
