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

const { items, links } = createSample(260, 620, 5, 12)
const nodeKeys = items.map((item) => item.id)
const edgeKeys = links.map((link) => link.id)
const degree = new Map<string, number>()
for (const link of links) {
  degree.set(link.from, (degree.get(link.from) ?? 0) + 1)
  degree.set(link.to, (degree.get(link.to) ?? 0) + 1)
}
const score = (item: Item) => (degree.get(item.id) ?? 0) * item.weight
const start = items.reduce((best, item) => (score(item) > score(best) ? item : best)).id

const marks = [
  edges<Link>(links, { source: 'from', target: 'to' }),
  nodes<Item>(items, {
    x: 'x',
    y: 'y',
    color: 'group',
    size: 'weight',
    label: { text: 'label', size: 15 },
  }),
]

const define = (raise: boolean) =>
  defineGraph({
    marks,
    states: {
      linked: {
        stroke: 'var(--graph-accent)',
        strokeWidth: 2,
        label: true,
        labelColor: 'var(--graph-accent)',
        raise,
      },
      muted: { opacity: 0.3, label: false },
    },
  })

export function mount(container: HTMLElement): GraphInstance {
  let raise = true
  const graph = mountGraph(container, {
    definition: define(raise),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'

  const highlight = (selected: readonly Key[]) => {
    if (selected.length === 0) {
      graph.states.clear('linked')
      graph.states.clear('muted')
      status.textContent = messages.empty
      return
    }
    const near = new Set<Key>()
    const between = new Set<Key>()
    for (const key of selected) {
      const reach = graph.paths.reach(key, { maxCost: 1 })
      for (const node of reach.nodes) near.add(node)
      for (const edge of reach.edges) between.add(edge)
    }
    graph.states.set('linked', { nodes: [...near], edges: [...between] })
    graph.states.set('muted', {
      nodes: nodeKeys.filter((key) => !near.has(key)),
      edges: edgeKeys.filter((key) => !between.has(key)),
    })
    status.textContent = messages.linked(near.size - selected.length, between.size)
  }

  graph.on('selectionchange', (selection) => highlight(selection.nodes))

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-button'
  button.textContent = messages.raise(raise)
  button.addEventListener('click', () => {
    raise = !raise
    button.textContent = messages.raise(raise)
    graph.update({ definition: define(raise) })
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions, status)

  graph.selection.set({ nodes: [start] })
  highlight([start])
  return graph
}
