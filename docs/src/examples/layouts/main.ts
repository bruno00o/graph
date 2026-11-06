import {
  defineGraph,
  edges,
  type GraphInstance,
  type Layout,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { grid, type LayersDirection, layers, radial, rings } from '@bruno00o/graph/layouts'
import { force } from '@bruno00o/graph/layouts/force'
import { createHierarchy, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

type Kind = keyof typeof messages.layoutKinds

const kinds = Object.keys(messages.layoutKinds) as Kind[]
const directions = Object.keys(messages.directions) as LayersDirection[]

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createHierarchy(160, 220)
  let direction: LayersDirection = 'down'
  const layouts: Record<Kind, Layout> = {
    layers: layers({ direction }),
    force: force(),
    grid: grid<Item>({
      order: (a, b) => a.group.localeCompare(b.group) || b.weight - a.weight,
    }),
    rings: rings(),
    radial: radial(),
  }
  let kind: Kind = 'layers'

  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', arrow: 'target', opacity: 0.6 }),
        nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
      ],
      scales: { size: { range: [10, 26] } },
      layout: layouts.layers,
      interaction: { lasso: true },
    }),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const kindButton = button(messages.layoutKind(messages.layoutKinds[kind]), (element) => {
    kind = kinds[(kinds.indexOf(kind) + 1) % kinds.length] ?? 'layers'
    element.textContent = messages.layoutKind(messages.layoutKinds[kind])
    void graph.layout.run(layouts[kind], { fit: true })
  })
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    kindButton,
    button(messages.direction(messages.directions[direction]), (element) => {
      direction = directions[(directions.indexOf(direction) + 1) % directions.length] ?? 'down'
      element.textContent = messages.direction(messages.directions[direction])
      layouts.layers = layers({ direction })
      kind = 'layers'
      kindButton.textContent = messages.layoutKind(messages.layoutKinds[kind])
      void graph.layout.run(layouts.layers, { fit: true })
    }),
    button(messages.arrange, () => {
      const keys = graph.store.get().selection.nodes
      if (keys.length > 0) void graph.layout.run(layouts[kind], { keys })
    }),
  )
  container.append(actions)

  return graph
}
