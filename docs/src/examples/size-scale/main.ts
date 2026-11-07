import {
  defineGraph,
  edges,
  type GraphInstance,
  mountGraph,
  type NumberScale,
  nodes,
} from '@bruno00o/graph'
import { messages } from './messages'
import '../shared/overlays.css'

interface Item {
  readonly id: string
  readonly value: number
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

type Mode = keyof typeof messages.modes

const columns = 6
const spacing = 120
const modes = Object.keys(messages.modes) as Mode[]
const scales: Record<Mode, NumberScale> = {
  sqrt: { type: 'sqrt', domain: [0, 100], range: [6, 96] },
  linear: { type: 'linear', domain: [0, 100], range: [6, 96] },
  identity: (value) => value,
}

const items: Item[] = Array.from({ length: 24 }, (_, index) => {
  const row = Math.floor(index / columns)
  const column = row % 2 === 0 ? index % columns : columns - 1 - (index % columns)
  return {
    id: `n${index}`,
    value: (index + 1) * 4,
    x: (column - (columns - 1) / 2) * spacing,
    y: (row - 1.5) * spacing,
  }
})

const links: Link[] = items.slice(1).map((item, index) => ({
  id: `e${index}`,
  from: items[index]?.id ?? item.id,
  to: item.id,
}))

const define = (mode: Mode) =>
  defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
      nodes<Item>(items, {
        x: 'x',
        y: 'y',
        size: 'value',
        fill: 'var(--graph-cat-1)',
        label: (item) => messages.value(item.value),
      }),
    ],
    scales: { size: scales[mode] },
  })

export function mount(container: HTMLElement): GraphInstance {
  let mode: Mode = 'sqrt'
  const graph = mountGraph(container, { definition: define(mode), ariaLabel: messages.graphLabel })

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-button'
  button.textContent = messages.mode(messages.modes[mode])
  button.addEventListener('click', () => {
    mode = modes[(modes.indexOf(mode) + 1) % modes.length] ?? 'sqrt'
    button.textContent = messages.mode(messages.modes[mode])
    graph.update({ definition: define(mode) })
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions)
  return graph
}
