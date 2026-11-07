import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { createGrid, type Link, type Spot } from './grid'
import { messages } from './messages'
import '../shared/overlays.css'
import './costs.css'

const { spots, links } = createGrid(9, 6, 11)

const definition = defineGraph({
  marks: [
    edges<Link>(links, {
      source: 'from',
      target: 'to',
      label: { text: (link) => String(link.cost), background: true },
    }),
    nodes<Spot>(spots, {
      x: 'x',
      y: 'y',
      label: { text: 'label', placement: 'center' },
      size: () => 24,
    }),
  ],
  states: {
    path: {
      stroke: 'var(--graph-accent)',
      strokeWidth: 3,
      flow: true,
      raise: true,
      others: { opacity: 0.25 },
    },
  },
})

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(spots.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)

  let chips: (() => void)[] = []

  function trace(): void {
    for (const remove of chips) remove()
    chips = []
    graph.states.clear()
    const [from, to] = graph.selection.get().nodes
    const path =
      from !== undefined && to !== undefined
        ? graph.paths.shortest(from, to, { weight: 'cost' })
        : null
    if (!path) {
      status.textContent = from !== undefined && to !== undefined ? messages.noPath : messages.hint
      return
    }
    graph.states.set('path', path)
    chips = path.nodes.map((key, index) => {
      const chip = document.createElement('span')
      chip.className = 'example-cost'
      chip.textContent = messages.cost(path.costs[index] ?? 0)
      return graph.anchors.set(chip, { node: key, side: 'top' })
    })
    status.textContent = messages.found(path.cost, path.edges.length)
  }

  graph.on('selectionchange', trace)
  const first = spots[0]
  const last = spots[spots.length - 1]
  if (first && last) graph.selection.set({ nodes: [first.id, last.id] })

  return graph
}
