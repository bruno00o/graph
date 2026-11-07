import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

type Arrangement = keyof typeof messages.arrangements

const arrangements = Object.keys(messages.arrangements) as Arrangement[]
const groups = ['A', 'B', 'C', 'D']
const golden = Math.PI * (3 - Math.sqrt(5))

const { items, links } = createSample(48, 64, groups.length, 21, 0.04)
const ordered = [...items].sort((a, b) => a.group.localeCompare(b.group) || b.weight - a.weight)

function place(kind: Arrangement, item: Item, index: number, shift: number) {
  const group = groups.indexOf(item.group)
  const members = ordered.filter((other) => other.group === item.group)
  const rank = members.indexOf(item)
  const offset = item.group === 'A' ? shift * 120 : 0
  if (kind === 'circle') {
    const angle = (index / ordered.length) * Math.PI * 2
    return { x: Math.cos(angle) * 200 + offset, y: Math.sin(angle) * 200 }
  }
  if (kind === 'grid') {
    return { x: ((index % 8) - 3.5) * 64 + offset, y: (Math.floor(index / 8) - 2.5) * 64 }
  }
  if (kind === 'rows') {
    return { x: (rank - (members.length - 1) / 2) * 30 + offset, y: (group - 1.5) * 100 }
  }
  const radius = 22 * Math.sqrt(rank + 0.5)
  return {
    x: (group % 2 === 0 ? -140 : 140) + Math.cos(rank * golden) * radius + offset,
    y: (group < 2 ? -120 : 120) + Math.sin(rank * golden) * radius,
  }
}

function define(kind: Arrangement, shift: number) {
  const placed = ordered.map((item, index) => ({ ...item, ...place(kind, item, index, shift) }))
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', opacity: 0.6 }),
      nodes<Item>(placed, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
    ],
    scales: { size: { range: [10, 26] } },
    transitions: { positions: 700 },
  })
}

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  let kind: Arrangement = 'clusters'
  let shift = 0
  const graph = mountGraph(container, {
    definition: define(kind, shift),
    ariaLabel: messages.graphLabel,
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  status.textContent = messages.hint

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.arrangement(messages.arrangements[kind]), (element) => {
      kind = arrangements[(arrangements.indexOf(kind) + 1) % arrangements.length] ?? kind
      element.textContent = messages.arrangement(messages.arrangements[kind])
      graph.update({ definition: define(kind, shift) })
    }),
    button(messages.shift, (element) => {
      shift = 1 - shift
      element.textContent = shift === 0 ? messages.shift : messages.unshift
      graph.update({ definition: define(kind, shift) })
    }),
  )
  container.append(actions, status)

  return graph
}
