import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

interface Tie extends Link {
  readonly strength: number
}

const always = 0.8
const firstZoom = 0.6

function minZoomOf(tie: Tie): number | null {
  return tie.strength >= always ? null : firstZoom * 2 ** ((always - tie.strength) * 3)
}

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createSample(400, 1_600, 6, 7, 0.25)
  const next = random(5)
  const groupOf = new Map(items.map((item) => [item.id, item.group]))
  const ties: Tie[] = links.map((link) => ({
    ...link,
    strength: groupOf.get(link.from) === groupOf.get(link.to) ? 0.3 + next() * 0.7 : next() * 0.5,
  }))

  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Tie>(ties, {
          source: 'from',
          target: 'to',
          width: 'strength',
          opacity: (tie) => 0.35 + tie.strength * 0.5,
          minZoom: minZoomOf,
        }),
        nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
      ],
      scales: { size: { range: [6, 22] }, width: { range: [0.5, 2.5] } },
    }),
    ariaLabel: messages.graphLabel(items.length, ties.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)
  const describe = () => {
    const { zoom } = graph.store.get().view
    const shown = ties.filter((tie) => (minZoomOf(tie) ?? 0) < zoom).length
    status.textContent = messages.shown(zoom, shown, ties.length)
  }
  graph.on('viewchange', describe)
  describe()

  return graph
}
