import { defineGraph, edges, type GraphInstance, mountGraph, nodes, raw } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createGroups, type Member, type Tie } from './data'
import { messages } from './messages'
import '../shared/overlays.css'

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createGroups()
  const sizes = new Map<string, number>()
  for (const item of items) {
    if (item.parent) sizes.set(item.parent, (sizes.get(item.parent) ?? 0) + 1)
  }
  let relayout = true

  const define = () =>
    defineGraph({
      marks: [
        edges<Tie>(links, {
          source: 'from',
          target: 'to',
          opacity: 0.6,
          aggregate: { width: (aggregate) => aggregate.count },
        }),
        nodes<Member>(items, {
          parent: 'parent',
          color: 'tone',
          size: raw((item) => (item.parent ? 12 : 16 + (sizes.get(item.id) ?? 0) * 2)),
          label: (item) => (item.parent ? null : item.label),
          container: { padding: 12 },
        }),
      ],
      scales: { width: (value) => 1 + value },
      layout: force(),
      relayout,
    })

  const graph = mountGraph(container, {
    definition: define(),
    ariaLabel: messages.graphLabel(items.length - sizes.size, sizes.size),
    initialFolded: ['B', 'D', 'F'],
  })
  graph.on('layoutend', ({ completed }) => {
    if (completed) graph.view.fit(undefined, { duration: 400 })
  })

  const button = (text: string, onClick: (element: HTMLButtonElement) => void) => {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'example-button'
    element.textContent = text
    element.addEventListener('click', () => onClick(element))
    return element
  }
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.mode(relayout), (element) => {
      relayout = !relayout
      element.textContent = messages.mode(relayout)
      graph.update({ definition: define() })
    }),
    button(messages.foldAll, () => graph.groups.fold()),
    button(messages.unfoldAll, () => graph.groups.unfold()),
  )
  container.append(actions)

  return graph
}
