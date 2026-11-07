import {
  type ColorScale,
  defineGraph,
  edges,
  type GraphInstance,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { createLegend, mountLegend } from '@bruno00o/graph/legend'
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
  readonly value: number
}

type Mode = keyof typeof messages.modes

const columns = 24
const rows = 15
const spacing = 36
const peaks = [
  { x: 0.25, y: 0.3, height: 1, spread: 0.18 },
  { x: 0.72, y: 0.65, height: 0.8, spread: 0.22 },
  { x: 0.8, y: 0.15, height: 0.45, spread: 0.12 },
]

const items: Item[] = []
for (let row = 0; row < rows; row++) {
  for (let column = 0; column < columns; column++) {
    const u = column / (columns - 1)
    const v = row / (rows - 1)
    const field = peaks.reduce(
      (sum, peak) =>
        sum + peak.height * Math.exp(-((u - peak.x) ** 2 + (v - peak.y) ** 2) / peak.spread ** 2),
      0,
    )
    items.push({
      id: `n${row}-${column}`,
      value: Math.round(Math.min(1, field) * 100),
      x: (column + (row % 2) / 2 - columns / 2) * spacing,
      y: (row - rows / 2) * spacing * 0.87,
    })
  }
}

const valueByKey = new Map(items.map((item) => [item.id, item.value]))
const links: Link[] = []
const link = (from: string, to: string) => {
  const a = valueByKey.get(from)
  const b = valueByKey.get(to)
  if (a === undefined || b === undefined) return
  links.push({ id: `${from}:${to}`, from, to, value: (a + b) / 2 })
}
for (let row = 0; row < rows; row++) {
  for (let column = 0; column < columns; column++) {
    const shift = row % 2
    link(`n${row}-${column}`, `n${row}-${column + 1}`)
    link(`n${row}-${column}`, `n${row + 1}-${column - 1 + shift}`)
    link(`n${row}-${column}`, `n${row + 1}-${column + shift}`)
  }
}

const modes = Object.keys(messages.modes) as Mode[]
const pale = 'color-mix(in oklab, var(--graph-cat-1) 25%, var(--graph-paper))'
const scales: Record<Mode, ColorScale> = {
  two: { type: 'sequential', domain: [0, 100], range: [pale, 'var(--graph-cat-1)'] },
  three: {
    type: 'sequential',
    domain: [0, 100],
    range: ['var(--graph-cat-6)', 'var(--graph-cat-2)', 'var(--graph-cat-4)'],
  },
  clamped: { type: 'sequential', domain: [40, 60], range: [pale, 'var(--graph-cat-1)'] },
  theme: { type: 'sequential' },
}

const define = (mode: Mode) =>
  defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', color: 'value' }),
      nodes<Item>(items, {
        x: 'x',
        y: 'y',
        color: 'value',
        label: { text: (item) => messages.value(item.value), minScreenSize: 40 },
      }),
    ],
    scales: { color: scales[mode] },
  })

export function mount(container: HTMLElement): GraphInstance {
  let mode: Mode = 'two'
  const graph = mountGraph(container, {
    definition: define(mode),
    ariaLabel: messages.graphLabel(items.length),
  })

  const legend = mountLegend(createLegend(graph), {
    sections: ['color'],
    titles: { color: messages.legendTitle },
    toggle: false,
    ariaLabel: messages.legendLabel,
  })
  legend.element.classList.add('example-scale-legend', 'example-scale-legend-right')

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-button'
  button.textContent = messages.mode(messages.modes[mode])
  button.addEventListener('click', () => {
    mode = modes[(modes.indexOf(mode) + 1) % modes.length] ?? 'two'
    button.textContent = messages.mode(messages.modes[mode])
    graph.update({ definition: define(mode) })
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions, legend.element)
  return graph
}
