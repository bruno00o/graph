import {
  defineGraph,
  edges,
  type GraphInstance,
  type LabelPlacement,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

interface Item {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly weight: number
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly name: string
}

const groups = ['A', 'B', 'C', 'D']

const items: Item[] = Array.from({ length: 12 }, (_, index) => ({
  id: `n${index}`,
  label:
    index % 5 === 2
      ? messages.longLabel(index + 1)
      : index % 5 === 4
        ? messages.twoLines(index + 1)
        : messages.node(index + 1),
  group: messages.group(groups[index % groups.length] ?? 'A'),
  weight: 12 - index,
  x: (index % 4) * 220 - 330,
  y: Math.floor(index / 4) * 170 - 170 + (index % 2) * 50,
}))

const links: Link[] = items.slice(1).map((item, index) => ({
  id: `l${index}`,
  from: items[Math.floor(index / 2)]?.id ?? 'n0',
  to: item.id,
  name: messages.edgeName(index + 1),
}))

const placements: readonly LabelPlacement[] = ['bottom', 'top', 'right', 'left', 'center']

interface Settings {
  readonly placement: LabelPlacement
  readonly background: boolean
  readonly truncate: boolean
}

const define = ({ placement, background, truncate }: Settings) =>
  defineGraph({
    marks: [
      edges<Link>(links, {
        source: 'from',
        target: 'to',
        arrow: 'target',
        label: { text: 'name', size: 10, color: 'var(--graph-ink-muted)', background },
      }),
      nodes<Item>(items, {
        x: 'x',
        y: 'y',
        color: 'group',
        size: 'weight',
        label: {
          text: 'label',
          secondary: 'group',
          background,
          placement,
          size: (item) => 10 + item.weight / 2,
          weight: (item) => (item.weight > 8 ? 'bold' : 'normal'),
          color: (item) => (item.weight % 3 === 0 ? 'var(--graph-accent)' : 'var(--graph-ink)'),
          ...(truncate ? { maxWidth: 110 } : {}),
          minScreenSize: 18,
        },
      }),
    ],
    scales: { size: { range: [14, 48] } },
    states: { hovered: { labelColor: 'var(--graph-accent)' } },
  })

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  let settings: Settings = { placement: 'bottom', background: false, truncate: false }
  const graph = mountGraph(container, {
    definition: define(settings),
    ariaLabel: messages.labelsLabel,
  })

  const change = (next: Partial<Settings>) => {
    settings = { ...settings, ...next }
    graph.update({ definition: define(settings) })
  }

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.placement(messages.placements[settings.placement]), (element) => {
      const placement =
        placements[(placements.indexOf(settings.placement) + 1) % placements.length] ?? 'bottom'
      element.textContent = messages.placement(messages.placements[placement])
      change({ placement })
    }),
    button(messages.backgroundsOn, (element) => {
      element.textContent = settings.background ? messages.backgroundsOn : messages.backgroundsOff
      change({ background: !settings.background })
    }),
    button(messages.truncateOn, (element) => {
      element.textContent = settings.truncate ? messages.truncateOn : messages.truncateOff
      change({ truncate: !settings.truncate })
    }),
  )
  container.append(actions)

  return graph
}
