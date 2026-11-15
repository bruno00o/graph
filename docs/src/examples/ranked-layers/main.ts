import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { layers } from '@bruno00o/graph/layouts'
import { createParts, type Kind, type Link, type Part } from './data'
import { messages } from './messages'
import '../shared/overlays.css'

const orders: readonly (readonly Kind[])[] = [
  ['A', 'B', 'C', 'D'],
  ['D', 'C', 'B', 'A'],
  ['B', 'A', 'D', 'C'],
]

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const { parts, links } = createParts()
  let order = orders[0] ?? []
  let byKind = true
  const rank = (part: Part) => (part.kind === null ? null : order.indexOf(part.kind))
  const layout = () =>
    layers<Part>({ direction: 'down', nodeSpacing: 14, rank: byKind ? rank : undefined })

  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', arrow: 'target', opacity: 0.6 }),
        nodes<Part>(parts, {
          color: (part) => part.kind ?? messages.noKind,
          size: 18,
          label: 'label',
        }),
      ],
      layout: layout(),
      view: { padding: { top: 72, right: 32, bottom: 32, left: 32 } },
    }),
    ariaLabel: messages.graphLabel(parts.length, links.length),
  })
  const arrange = () => void graph.layout.run(layout(), { fit: true })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.order(order.join(', ')), (element) => {
      order = orders[(orders.indexOf(order) + 1) % orders.length] ?? order
      element.textContent = messages.order(order.join(', '))
      arrange()
    }),
    button(messages.source(byKind), (element) => {
      byKind = !byKind
      element.textContent = messages.source(byKind)
      arrange()
    }),
  )
  container.append(actions)

  return graph
}
