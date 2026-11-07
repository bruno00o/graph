import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createSample, type Item, type Link } from '../shared/data'
import { circleByGroup } from './circle'
import { messages } from './messages'
import '../shared/overlays.css'

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createSample(90, 140, 6, 7, 0.3)
  const layouts = {
    circle: circleByGroup<Item>((item) => item.group),
    force: force(),
  }
  let kind: keyof typeof layouts = 'circle'

  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', opacity: 0.35 }),
        nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
      ],
      scales: { size: { range: [10, 24] } },
      layout: layouts.circle,
    }),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'example-button'
  toggle.textContent = messages.layout(messages.layouts[kind])
  toggle.addEventListener('click', () => {
    kind = kind === 'circle' ? 'force' : 'circle'
    toggle.textContent = messages.layout(messages.layouts[kind])
    void graph.layout.run(layouts[kind], { fit: true })
  })
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(toggle)
  container.append(actions)

  return graph
}
