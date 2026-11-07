import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { type NodeOrder, rings } from '@bruno00o/graph/layouts'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

type Rank = keyof typeof messages.ranks

const ranks = Object.keys(messages.ranks) as Rank[]
const orders: Record<Rank, NodeOrder<Item>> = {
  weight: (a, b) => b.weight - a.weight,
  degree: 'degree',
  group: (a, b) => a.group.localeCompare(b.group) || b.weight - a.weight,
}

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createSample(90, 120, 5)
  let rank: Rank = 'weight'
  let center: Key | undefined
  const layout = () => rings<Item>({ order: orders[rank], center })

  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', opacity: 0.2 }),
        nodes<Item>(items, {
          color: 'group',
          size: 'weight',
          label: (item) => messages.weight(item.weight),
        }),
      ],
      scales: { size: { range: [8, 30] } },
      states: { center: { outline: 'var(--graph-accent)', outlineWidth: 3, raise: true } },
      layout: layout(),
      interaction: { select: false },
    }),
    ariaLabel: messages.graphLabel(items.length),
  })
  const arrange = () => void graph.layout.run(layout(), { fit: true })

  graph.on('click', ({ target }) => {
    if (target?.kind !== 'node') return
    center = target.key
    graph.states.set('center', { nodes: [center] })
    arrange()
  })

  const rankButton = document.createElement('button')
  rankButton.type = 'button'
  rankButton.className = 'example-button'
  rankButton.textContent = messages.rank(messages.ranks[rank])
  rankButton.addEventListener('click', () => {
    rank = ranks[(ranks.indexOf(rank) + 1) % ranks.length] ?? 'weight'
    rankButton.textContent = messages.rank(messages.ranks[rank])
    arrange()
  })
  const resetButton = document.createElement('button')
  resetButton.type = 'button'
  resetButton.className = 'example-button'
  resetButton.textContent = messages.reset
  resetButton.addEventListener('click', () => {
    center = undefined
    graph.states.clear('center')
    arrange()
  })
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(rankButton, resetButton)
  container.append(actions)

  return graph
}
