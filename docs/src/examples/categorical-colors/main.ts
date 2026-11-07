import {
  type ColorScale,
  defineGraph,
  edges,
  type GraphInstance,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { createLegend, mountLegend } from '@bruno00o/graph/legend'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

type Mode = keyof typeof messages.modes

const { items, links } = createSample(360, 600, 6, 9)
const groupOf = new Map(items.map((item) => [item.id, item.group]))
const modes = Object.keys(messages.modes) as Mode[]
const shade = (token: string, share: number) =>
  `color-mix(in oklab, var(${token}) ${share}%, var(--graph-paper))`

const scales: Record<Mode, ColorScale | undefined> = {
  appearance: undefined,
  domain: { domain: ['A', 'B', 'C', 'D', 'E', 'F'] },
  range: {
    domain: ['A', 'B', 'C', 'D', 'E', 'F'],
    range: [
      shade('--graph-cat-1', 100),
      shade('--graph-cat-1', 70),
      shade('--graph-cat-1', 45),
      shade('--graph-cat-4', 100),
      shade('--graph-cat-4', 70),
      shade('--graph-cat-4', 45),
    ],
  },
  single: (value) => (value === 'C' ? 'var(--graph-accent)' : 'var(--graph-edge)'),
}

const define = (mode: Mode) =>
  defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', color: (link) => groupOf.get(link.from) }),
      nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
    ],
    scales: scales[mode] ? { color: scales[mode] } : {},
  })

export function mount(container: HTMLElement): GraphInstance {
  let mode: Mode = 'appearance'
  const graph = mountGraph(container, {
    definition: define(mode),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const legend = mountLegend(createLegend(graph), {
    sections: ['color'],
    titles: { color: messages.legendTitle },
    format: (value) => messages.group(String(value)),
    toggle: false,
    ariaLabel: messages.legendLabel,
  })
  legend.element.classList.add('example-scale-legend', 'example-scale-legend-right')

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-button'
  button.textContent = messages.mode(messages.modes[mode])
  button.addEventListener('click', () => {
    mode = modes[(modes.indexOf(mode) + 1) % modes.length] ?? 'appearance'
    button.textContent = messages.mode(messages.modes[mode])
    graph.update({ definition: define(mode) })
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions, legend.element)
  return graph
}
