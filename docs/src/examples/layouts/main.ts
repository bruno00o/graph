import {
  defineGraph,
  edges,
  type GraphInstance,
  type Layout,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { grid, radial, rings } from '@bruno00o/graph/layouts'
import { force } from '@bruno00o/graph/layouts/force'
import { createCommunities, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

type Kind = keyof typeof messages.layoutKinds

const kinds = Object.keys(messages.layoutKinds) as Kind[]

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createCommunities(300, 420)
  const layouts: Record<Kind, Layout> = {
    force: force(),
    grid: grid<Item>({
      order: (a, b) => a.group.localeCompare(b.group) || b.weight - a.weight,
    }),
    rings: rings(),
    radial: radial(),
  }
  let kind: Kind = 'force'

  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', opacity: 0.5 }),
        nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
      ],
      scales: { size: { range: [8, 28] } },
      layout: layouts.force,
      interaction: { lasso: true },
    }),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.layoutKind(messages.layoutKinds[kind]), (element) => {
      kind = kinds[(kinds.indexOf(kind) + 1) % kinds.length] ?? 'force'
      element.textContent = messages.layoutKind(messages.layoutKinds[kind])
      void graph.layout.run(layouts[kind], { fit: true })
    }),
    button(messages.arrange, () => {
      const keys = graph.store.get().selection.nodes
      if (keys.length > 0) void graph.layout.run(layouts[kind], { keys })
    }),
  )
  container.append(actions)

  return graph
}
