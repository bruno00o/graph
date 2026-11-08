import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { createLegend, mountLegend } from '@bruno00o/graph/legend'
import '../shared/overlays.css'
import { createNetwork, type Link } from './data'
import { messages } from './messages'

const network = createNetwork()
const link = {
  source: 'from',
  target: 'to',
  supportedBy: 'over',
  label: { text: 'name', size: 14, background: true },
} as const
const total = network.routes.length + network.paths.length + network.segments.length
const beneath = [...network.paths, ...network.segments].map((edge) => edge.id)

const definition = defineGraph({
  marks: [
    edges(network.segments, { ...link, layer: 'lower', width: 2 }),
    edges(network.paths, {
      ...link,
      layer: 'middle',
      stroke: 'var(--graph-cat-1)',
      width: 2.5,
    }),
    edges(network.routes, {
      ...link,
      layer: 'upper',
      stroke: 'var(--graph-cat-2)',
      width: 3.5,
      dash: 'dashed',
    }),
    nodes(network.places, { x: 'x', y: 'y', size: 6 }),
  ],
  states: {
    closed: { hide: true },
    open: { stroke: 'var(--graph-accent)', raise: true },
  },
  interaction: { select: 'single' },
})

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(network.places.length, network.routes.length),
  })
  const opened = new Set<Key>()
  const revealed = new Set<Key>()
  let hovered: Link | null = null

  const legend = createLegend(graph)
  const view = mountLegend(legend, {
    sections: ['layers'],
    titles: { layers: messages.layersTitle },
    layerText: (layer) => messages.layerNames[layer.name] ?? layer.name,
    ariaLabel: messages.layersLabel,
  })
  view.element.classList.add('example-scale-legend', 'example-scale-legend-right')
  container.append(view.element)

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)

  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'example-button'
  reset.textContent = messages.reset
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(reset)
  container.append(actions)

  function describe(): void {
    status.textContent = hovered
      ? messages.edge(hovered.name, hovered.capacity, hovered.over.length)
      : messages.shown(network.routes.length + revealed.size, total)
  }

  function reveal(): void {
    revealed.clear()
    for (const key of opened) {
      for (const carrier of graph.support.carriers(key, { maxDepth: 1 }).edges) {
        revealed.add(carrier)
      }
    }
    graph.states.set('closed', { edges: beneath.filter((key) => !revealed.has(key)) })
    graph.states.set('open', { edges: [...opened] })
    if (hovered && beneath.includes(hovered.id) && !revealed.has(hovered.id)) hovered = null
    describe()
  }

  function toggle(key: Key): void {
    if (opened.delete(key)) {
      for (const deeper of graph.support.carriers(key).edges) opened.delete(deeper)
    } else if (graph.support.carriers(key, { maxDepth: 1 }).edges.length > 0) {
      opened.add(key)
    }
    reveal()
  }

  graph.on('doubleclick', ({ target }) => {
    if (target?.kind === 'edge') toggle(target.key)
  })

  graph.on('pointerenter', ({ target }) => {
    if (target.kind !== 'edge') return
    hovered = target.datum
    describe()
  })

  graph.on('pointerleave', () => {
    hovered = null
    describe()
  })

  reset.addEventListener('click', () => {
    opened.clear()
    graph.selection.clear()
    reveal()
  })

  reveal()

  return graph
}
