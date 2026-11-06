import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { createTiers, type Item, type Link, tierWeights } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

const branchZoom = 0.55
const leafZoom = 1.3
const ringZoom = 0.9

function minZoomOf(item: Item): number | null {
  if (item.weight === tierWeights.leaf) return leafZoom
  if (item.weight === tierWeights.branch) return branchZoom
  return null
}

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createTiers()
  const ring = links.filter((link) => link.id.startsWith('r'))
  const tree = links.filter((link) => !link.id.startsWith('r'))

  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Link>(ring, {
          source: 'from',
          target: 'to',
          dash: 'dashed',
          opacity: 0.7,
          maxZoom: ringZoom,
        }),
        edges<Link>(tree, { source: 'from', target: 'to', opacity: 0.6 }),
        nodes<Item>(items, {
          x: 'x',
          y: 'y',
          color: 'group',
          size: 'weight',
          label: 'label',
          minZoom: minZoomOf,
        }),
      ],
      scales: { size: { range: [8, 44] } },
    }),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)
  const describe = () => {
    const { zoom } = graph.store.get().view
    const shown = 1 + (zoom > branchZoom ? 1 : 0) + (zoom > leafZoom ? 1 : 0)
    status.textContent = messages.zoomTiers(zoom, shown)
  }
  graph.store.subscribe(describe)
  describe()

  return graph
}
