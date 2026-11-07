import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createCommunities, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './controls.css'

type Setting = keyof typeof messages.settings

const ranges: Record<
  Setting,
  { readonly max: number; readonly step: number; readonly value: number }
> = {
  edgeLength: { max: 160, step: 1, value: 40 },
  repulsion: { max: 400, step: 5, value: 80 },
  gravity: { max: 0.4, step: 0.01, value: 0.04 },
  spacing: { max: 40, step: 1, value: 6 },
}

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createCommunities(160, 230)
  const settings: Record<Setting, number> = {
    edgeLength: ranges.edgeLength.value,
    repulsion: ranges.repulsion.value,
    gravity: ranges.gravity.value,
    spacing: ranges.spacing.value,
  }
  const define = () =>
    defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', opacity: 0.5 }),
        nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
      ],
      scales: { size: { range: [10, 28] } },
      layout: force(settings),
    })

  const graph = mountGraph(container, {
    definition: define(),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)
  graph.store.subscribe(() => {
    const { running, progress } = graph.store.get().layout
    if (running) status.textContent = messages.progress(progress)
  })
  graph.on('layoutend', ({ completed }) => {
    status.textContent = completed ? messages.done : messages.stopped
    if (completed) graph.view.fit(undefined, { duration: 400 })
  })

  const panel = document.createElement('div')
  panel.className = 'example-panel force-panel'
  for (const setting of Object.keys(ranges) as Setting[]) {
    const range = ranges[setting]
    const label = document.createElement('label')
    const caption = document.createElement('span')
    caption.textContent = messages.settings[setting](range.value)
    const input = document.createElement('input')
    input.type = 'range'
    input.min = '0'
    input.max = String(range.max)
    input.step = String(range.step)
    input.value = String(range.value)
    input.addEventListener('input', () => {
      caption.textContent = messages.settings[setting](input.valueAsNumber)
    })
    input.addEventListener('change', () => {
      settings[setting] = input.valueAsNumber
      graph.update({ definition: define() })
    })
    label.append(caption, input)
    panel.append(label)
  }
  container.append(panel)

  return graph
}
