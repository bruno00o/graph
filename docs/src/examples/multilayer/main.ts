import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { createLegend, mountLegend } from '@bruno00o/graph/legend'
import { createStrata } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

const strata = createStrata(12, 9)
const edgeCount = strata.lower.length + strata.middle.length + strata.upper.length
const link = { source: 'from', target: 'to', supportedBy: 'over' } as const

const definition = defineGraph({
  marks: [
    edges(strata.lower, { ...link, layer: 'lower', width: 1.5 }),
    edges(strata.middle, {
      ...link,
      layer: 'middle',
      stroke: 'var(--graph-cat-1)',
      width: 2.5,
    }),
    edges(strata.upper, {
      ...link,
      layer: 'upper',
      stroke: 'var(--graph-cat-2)',
      width: 3.5,
      dash: 'dashed',
    }),
    nodes(strata.places, { x: 'x', y: 'y', label: 'label' }),
  ],
  states: {
    carrier: {
      stroke: 'var(--graph-accent)',
      outline: 'var(--graph-accent)',
      strokeWidth: 3,
      raise: true,
    },
    carried: {
      stroke: 'var(--graph-cat-4)',
      outline: 'var(--graph-cat-4)',
      strokeWidth: 3,
      raise: true,
    },
  },
  support: { carriers: 'carrier', carried: 'carried' },
  interaction: { select: 'single' },
})

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(strata.places.length, edgeCount),
  })

  const legend = createLegend(graph)
  const view = mountLegend(legend, {
    sections: ['layers'],
    titles: { layers: messages.layersTitle },
    layerText: (layer) => messages.layerNames[layer.name] ?? layer.name,
    ariaLabel: messages.layersLabel,
  })
  view.element.classList.add('example-scale-legend')
  container.append(view.element)

  const status = document.createElement('output')
  status.className = 'example-status'
  status.textContent = messages.supportHint
  container.append(status)

  graph.on('selectionchange', ({ selection }) => {
    const [key] = selection.edges
    status.textContent =
      key === undefined
        ? messages.supportHint
        : messages.supportStatus(
            graph.support.carriers(key).edges.length,
            graph.support.carried(key).edges.length,
          )
  })

  return graph
}
