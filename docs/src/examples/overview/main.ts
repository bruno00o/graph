import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { createLegend, mountLegend } from '@bruno00o/graph/legend'
import { createMinimap } from '@bruno00o/graph/minimap'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

const { items, links } = createSample(5_000, 10_000)

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
  states: {
    match: { outline: 'var(--graph-accent)', label: true },
    hidden: { opacity: 0.06, label: false },
  },
})

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(items.length, links.length),
  })
  createMinimap(graph)
  const legend = createLegend(graph, { highlight: 'match', hidden: 'hidden' })
  const view = mountLegend(legend, {
    titles: { color: messages.legendGroup, size: messages.legendWeight },
    ariaLabel: messages.legendLabel,
  })
  view.element.classList.add('example-legend')
  container.append(view.element)
  return graph
}
