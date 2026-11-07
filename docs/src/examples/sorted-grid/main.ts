import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { grid, type NodeOrder } from '@bruno00o/graph/layouts'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

type Sort = keyof typeof messages.sorts

const sorts = Object.keys(messages.sorts) as Sort[]
const orders: Record<Sort, NodeOrder<Item>> = {
  group: (a, b) => a.group.localeCompare(b.group) || b.weight - a.weight,
  weight: (a, b) => b.weight - a.weight,
  degree: 'degree',
}
const columnCounts = [12, 8, 6]

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createSample(72, 90, 6)
  let sort: Sort = 'group'
  let columns = columnCounts[0] ?? 12
  const layout = () => grid<Item>({ order: orders[sort], columns })

  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', opacity: 0.15 }),
        nodes<Item>(items, {
          color: 'group',
          size: 'weight',
          label: (item) => messages.weight(item.weight),
        }),
      ],
      scales: { size: { range: [8, 30] } },
      layout: layout(),
    }),
    ariaLabel: messages.graphLabel(items.length),
  })
  const arrange = () => void graph.layout.run(layout(), { fit: true })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.sort(messages.sorts[sort]), (element) => {
      sort = sorts[(sorts.indexOf(sort) + 1) % sorts.length] ?? 'group'
      element.textContent = messages.sort(messages.sorts[sort])
      arrange()
    }),
    button(messages.columns(columns), (element) => {
      columns = columnCounts[(columnCounts.indexOf(columns) + 1) % columnCounts.length] ?? 12
      element.textContent = messages.columns(columns)
      arrange()
    }),
  )
  container.append(actions)

  return graph
}
