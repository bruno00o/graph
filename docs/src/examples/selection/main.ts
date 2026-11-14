import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

const { items, links } = createSample(1_000, 2_000)

const marks = [
  edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
  nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
]

const define = (drawing: boolean) =>
  defineGraph({
    marks,
    states: { kept: { others: { opacity: 0.15, label: false } } },
    interaction: { lasso: { modifier: drawing ? null : 'Shift', edges: true } },
  })

export function mount(container: HTMLElement): GraphInstance {
  let drawing = false
  const graph = mountGraph(container, {
    definition: define(drawing),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'example-button'
  toggle.textContent = messages.mode(drawing)
  toggle.addEventListener('click', () => {
    drawing = !drawing
    toggle.textContent = messages.mode(drawing)
    graph.update({ definition: define(drawing) })
    graph.element.focus()
  })
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(toggle)
  container.append(actions)

  const status = document.createElement('output')
  status.className = 'example-status'
  status.textContent = messages.selection(0, 0)
  container.append(status)

  graph.on('selectionchange', ({ selection }) => {
    status.textContent = messages.selection(selection.nodes.length, selection.edges.length)
    if (selection.nodes.length === 0) {
      graph.states.clear('kept')
      return
    }
    const keepNodes = new Set<Key>(selection.nodes)
    const keepEdges = new Set<Key>(selection.edges)
    for (const key of selection.nodes) {
      for (const neighbor of graph.neighbors(key)) keepNodes.add(neighbor)
      for (const edge of graph.edgesOf(key)) keepEdges.add(edge)
    }
    graph.states.set('kept', { nodes: keepNodes, edges: keepEdges })
  })

  return graph
}
