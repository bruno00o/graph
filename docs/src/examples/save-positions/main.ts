import {
  defineGraph,
  edges,
  type GraphInstance,
  mountGraph,
  nodes,
  type Point,
} from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createCommunities, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './save.css'

type Saved = Record<string, [number, number]>

const { items, links } = createCommunities(160, 240, 19)

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', opacity: 0.6 }),
    nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
  ],
  scales: { size: { range: [14, 34] } },
  layout: force(),
  interaction: { lasso: true },
})

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', onClick)
  return element
}

const round = (value: number) => Math.round(value * 10) / 10

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, { definition, ariaLabel: messages.graphLabel })
  let saved: Saved | null = null

  const preview = document.createElement('pre')
  preview.className = 'saved-json'
  preview.hidden = true

  const save = () => {
    const next: Saved = {}
    for (const { id } of items) {
      const point = graph.positions.get(id)
      if (point) next[id] = [round(point.x), round(point.y)]
    }
    saved = next
    const lines = Object.entries(next).map(([key, [x, y]]) => `  "${key}": [${x}, ${y}],`)
    preview.textContent = [
      '{',
      ...lines.slice(0, 8),
      `  ${messages.more(lines.length - 8)}`,
      '}',
    ].join('\n')
    preview.hidden = false
    restore.disabled = download.disabled = false
  }

  const scatter = () => {
    const box = Math.sqrt(items.length) * 40
    graph.positions.set(
      items.map(({ id }) => [
        id,
        { x: (Math.random() - 0.5) * box, y: (Math.random() - 0.5) * box },
      ]),
      { duration: 500 },
    )
  }

  const restore = button(messages.restore, () => {
    if (!saved) return
    const entries = Object.entries(saved).map(([key, [x, y]]): [string, Point] => [key, { x, y }])
    graph.positions.set(entries, { duration: 600 })
  })
  const download = button(messages.download, () => {
    if (!saved) return
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([JSON.stringify(saved)], { type: 'application/json' }))
    link.download = 'positions.json'
    link.click()
    URL.revokeObjectURL(link.href)
  })
  restore.disabled = download.disabled = true

  graph.on('layoutend', ({ completed }) => {
    if (completed && !saved) save()
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button(messages.save, save), button(messages.scatter, scatter), restore, download)
  container.append(actions, preview)

  return graph
}
