import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createCommunities, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import '../shared/controls.css'

const { items, links } = createCommunities(400, 640, 43)
const degree = new Map<string, number>()
for (const { from, to } of links) {
  degree.set(from, (degree.get(from) ?? 0) + 1)
  degree.set(to, (degree.get(to) ?? 0) + 1)
}
const degreeOf = (item: Item) => degree.get(item.id) ?? 0
const highest = Math.max(...degree.values())

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Item>(items, { color: 'group', size: degreeOf, label: 'label', units: 'screen' }),
  ],
  scales: { size: { range: [5, 36] } },
  states: { off: { hide: true } },
  layout: force(),
})

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'

  const text = document.createElement('span')
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '1'
  slider.max = String(Math.min(highest, 20))
  slider.value = '4'
  const control = document.createElement('label')
  control.className = 'example-button example-range'
  control.append(text, slider)
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(control)
  container.append(actions, status)

  function filter(): void {
    const least = Number(slider.value)
    const hidden = items.filter((item) => degreeOf(item) < least).map((item) => item.id)
    graph.states.set('off', { nodes: hidden })
    text.textContent = messages.least(least)
    status.textContent = messages.shown(items.length - hidden.length, items.length)
  }

  slider.addEventListener('input', filter)
  filter()

  return graph
}
