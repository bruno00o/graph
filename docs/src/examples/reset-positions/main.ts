import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

const { items, links } = createSample(60, 84, 4, 31, 0.05)
const home = new Map<Key, { x: number; y: number }>(items.map(({ id, x, y }) => [id, { x, y }]))
const reach = Math.max(...items.map(({ x, y }) => Math.hypot(x, y)))

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', opacity: 0.5 }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
  scales: { size: { range: [12, 28] } },
  transitions: { positions: 700 },
  interaction: { select: 'multiple', lasso: true },
})

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', onClick)
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, { definition, ariaLabel: messages.graphLabel })
  const next = random(5)
  const away = new Set<Key>()

  const status = document.createElement('output')
  status.className = 'example-status'

  const resetAll = button(messages.resetAll, () => graph.positions.reset())
  const resetSelection = button(messages.resetSelection, () =>
    graph.positions.reset(graph.store.get().selection.nodes),
  )

  const refresh = () => {
    status.textContent = messages.away(away.size)
    resetAll.disabled = away.size === 0
    resetSelection.disabled = graph.store.get().selection.nodes.length === 0
  }

  graph.on('positionchange', ({ positions }) => {
    for (const [key, point] of positions) {
      const data = home.get(key)
      if (data && Math.hypot(point.x - data.x, point.y - data.y) < 0.01) away.delete(key)
      else away.add(key)
    }
    refresh()
  })
  graph.on('selectionchange', refresh)

  const scatter = button(messages.scatter, () => {
    graph.positions.set(
      items.map(({ id }) => [
        id,
        { x: (next() * 2 - 1) * reach, y: (next() * 2 - 1) * reach * 0.7 },
      ]),
      { duration: 600 },
    )
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(scatter, resetAll, resetSelection)
  container.append(actions, status)
  refresh()

  return graph
}
