import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { createLegend, mountLegend } from '@bruno00o/graph/legend'
import { createStrata } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { button, choice, createPage, exportButtons, status, themeToggle } from '../shared/page'

const sizes = [12, 60, 180]
const params = new URLSearchParams(location.search)
const side = Number(params.get('side') ?? 12)
const strata = createStrata(side, Math.max(2, Math.round(side * 0.75)))
const edgeCount = strata.lower.length + strata.middle.length + strata.upper.length

const link = { source: 'from', target: 'to', supportedBy: 'over' } as const

const definition = defineGraph({
  marks: [
    edges(strata.lower, { ...link, layer: 'lower', width: () => 1.5 }),
    edges(strata.middle, {
      ...link,
      layer: 'middle',
      stroke: 'var(--graph-cat-1)',
      width: () => 2.5,
    }),
    edges(strata.upper, {
      ...link,
      layer: 'upper',
      stroke: 'var(--graph-cat-2)',
      width: () => 3.5,
      dash: 'dashed',
    }),
    nodes(strata.places, { x: 'x', y: 'y', label: 'label' }),
  ],
  scales: { width: (value) => value },
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

const { header, main } = createPage(messages.multilayer)
const graph = mountGraph(main, {
  definition,
  ariaLabel: messages.graphLabel(formatNumber(strata.places.length), formatNumber(edgeCount)),
})

const legend = createLegend(graph)
const legendView = mountLegend(legend, {
  sections: ['layers'],
  titles: { layers: messages.layersTitle },
  layerText: (layer) => messages.layerNames[layer.name] ?? layer.name,
  ariaLabel: messages.layersLabel,
})
legendView.element.classList.add('legend')
main.append(legendView.element)

const supportStatus = status()
graph.on('selectionchange', ({ edges: selected }) => {
  const [key] = selected
  if (key === undefined) {
    supportStatus.textContent = messages.supportNone
    return
  }
  supportStatus.textContent = messages.supportStatus(
    graph.support.carriers(key).edges.length,
    graph.support.carried(key).edges.length,
  )
})
supportStatus.textContent = messages.supportNone

const layersStatus = status()
const describeLayers = () => {
  const shown = graph.layers.names().length - graph.layers.hidden().length
  layersStatus.textContent = messages.layersStatus(formatNumber(edgeCount), shown)
}
graph.on('layerchange', describeLayers)
describeLayers()

const hint = document.createElement('span')
hint.className = 'hint'
hint.textContent = messages.multilayerHint

header.append(
  hint,
  supportStatus,
  layersStatus,
  button(messages.showLayers, () => graph.layers.show()),
  choice(
    messages.placeCount,
    [...new Set([...sizes, side])].map((value) => ({
      value: String(value),
      text: formatNumber(value * Math.max(2, Math.round(value * 0.75))),
    })),
    String(side),
    (value) => {
      location.search = `?side=${value}`
    },
  ),
  button(messages.fit, () => graph.view.fit(undefined, { duration: 400 })),
  ...exportButtons(graph, 'multilayer', { png: messages.exportPng, svg: messages.exportSvg }),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph, legend, strata })
