import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './controls.css'

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createSample(260, 420)
  const weights = new Map(items.map((item) => [item.id, item.weight]))
  let threshold = 8

  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', opacity: 0.5 }),
        nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
      ],
      states: { below: { hide: true } },
      interaction: { select: 'multiple' },
    }),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const shown = document.createElement('p')
  const kept = document.createElement('p')
  const show = () => {
    const hidden = items.filter((item) => item.weight < threshold).length
    const selected = graph.store.get().selection.nodes
    const out = selected.filter((key) => (weights.get(String(key)) ?? 0) < threshold).length
    shown.textContent = messages.shown(items.length - hidden, items.length)
    kept.textContent = messages.selected(selected.length, out)
  }
  const filter = () => {
    graph.states.set('below', {
      nodes: items.filter((item) => item.weight < threshold).map((item) => item.id),
    })
    show()
  }
  filter()
  graph.on('selectionchange', show)

  const label = document.createElement('label')
  const caption = document.createElement('span')
  caption.textContent = messages.threshold(threshold)
  const input = document.createElement('input')
  input.type = 'range'
  input.min = '1'
  input.max = '100'
  input.value = String(threshold)
  input.addEventListener('input', () => {
    threshold = input.valueAsNumber
    caption.textContent = messages.threshold(threshold)
    filter()
  })
  label.append(caption, input)

  const panel = document.createElement('div')
  panel.className = 'example-panel filter-panel'
  panel.append(label, shown, kept)
  container.append(panel)

  return graph
}
