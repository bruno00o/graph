import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './keys.css'

const { items, links } = createSample(240, 360, 6, 41)
const start = items.find((item) => item.weight > 50) ?? items[0]

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
  states: { focused: { outlineWidth: 4, halo: true, label: true } },
  interaction: { keyboard: true },
})

function keyList(): HTMLElement {
  const list = document.createElement('dl')
  list.className = 'example-keys'
  for (const { keys, action } of messages.keys) {
    const term = document.createElement('dt')
    for (const key of keys) {
      const cap = document.createElement('kbd')
      cap.textContent = key
      term.append(cap)
    }
    const description = document.createElement('dd')
    description.textContent = action
    list.append(term, description)
  }
  return list
}

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  status.textContent = messages.hint
  container.append(keyList(), status)

  graph.on('focuschange', ({ target }) => {
    status.textContent =
      target?.kind === 'node'
        ? messages.focused(target.datum.label, target.datum.group)
        : messages.hint
  })
  graph.on('selectionchange', ({ selection }) => {
    const count = selection.nodes.length
    if (count > 0) status.textContent = messages.selected(count)
  })

  if (start) graph.focus.set({ kind: 'node', key: start.id })

  return graph
}
