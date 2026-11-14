import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
  type Point,
} from '@bruno00o/graph'
import { layers, placed } from '@bruno00o/graph/layouts'
import { force } from '@bruno00o/graph/layouts/force'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

const light = 20
const gap = 60

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

function byGroup(items: readonly Item[]): Map<string, Item[]> {
  const groups = new Map<string, Item[]>()
  for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item])
  return new Map([...groups].sort(([a], [b]) => a.localeCompare(b)))
}

function columns(items: readonly Item[]): Map<Key, Point> {
  const positions = new Map<Key, Point>()
  let x = 0
  for (const members of byGroup(items).values()) {
    const sorted = [...members].sort((a, b) => b.weight - a.weight)
    sorted.forEach((item, row) => {
      positions.set(item.id, { x: x + (row % 2) * 30, y: Math.floor(row / 2) * 34 })
    })
    x += 30 + gap * 2
  }
  return positions
}

function sideBySide(parts: readonly Map<Key, Point>[]): Map<Key, Point> {
  const positions = new Map<Key, Point>()
  let left = 0
  for (const part of parts) {
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    for (const { x, y } of part.values()) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
    }
    for (const [key, { x, y }] of part) positions.set(key, { x: x - minX + left, y: y - minY })
    left += maxX - minX + gap
  }
  return positions
}

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createSample(110, 150, 5, 21, 0.04)
  let hidden = false

  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', opacity: 0.5 }),
        nodes<Item>(items, { color: 'group', size: 'weight', label: 'group' }),
      ],
      scales: { size: { range: [8, 24] } },
      states: { light: { hide: true } },
      layout: force(),
      view: { padding: { top: 72, right: 32, bottom: 32, left: 32 } },
    }),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)
  graph.on('layoutstart', ({ name }) => {
    status.textContent = messages.running(name)
  })
  graph.on('layoutend', ({ name, completed }) => {
    status.textContent = messages.ended(name, completed)
  })

  const shown = () => items.filter((item) => !hidden || item.weight >= light)

  const trees = async () => {
    status.textContent = messages.computing
    const parts: Map<Key, Point>[] = []
    for (const members of byGroup(shown()).values()) {
      const keys = members.map((item) => item.id)
      parts.push(await graph.layout.compute(layers(), { keys, others: 'ignored' }))
    }
    await graph.layout.run(placed(sideBySide(parts)), { fit: true })
  }

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.columns, () => {
      void graph.layout.run(placed(columns(shown())), { fit: true })
    }),
    button(messages.trees, () => void trees()),
    button(messages.force, () => {
      const keys = shown().map((item) => item.id)
      void graph.layout.run(force(), { keys, others: 'ignored', fit: true })
    }),
    button(messages.hide(hidden), (element) => {
      hidden = !hidden
      element.textContent = messages.hide(hidden)
      const keys = hidden ? items.filter((item) => item.weight < light).map((item) => item.id) : []
      graph.states.set('light', { nodes: keys })
    }),
  )
  container.append(actions)

  return graph
}
