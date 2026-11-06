import { defineGraph, edges, type LabelPlacement, mountGraph, nodes } from '@bruno00o/graph'
import { messages } from '../shared/messages'
import { button, createPage, exportButtons, status, themeToggle } from '../shared/page'

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

const items: Item[] = Array.from({ length: 12 }, (_, index) => {
  const name = String(index + 1)
  return {
    id: `n${index}`,
    label:
      index % 5 === 2
        ? messages.longLabel(name)
        : index % 5 === 4
          ? messages.twoLines(name)
          : messages.node(name),
    group: messages.group(groups[index % groups.length] ?? 'A'),
    weight: 12 - index,
    x: (index % 4) * 220 - 330,
    y: Math.floor(index / 4) * 170 - 170 + (index % 2) * 50,
  }
})

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

let settings: Settings = { placement: 'bottom', background: false, truncate: false }
const { header, main } = createPage(messages.labels)
const graph = mountGraph(main, {
  definition: define(settings),
  ariaLabel: messages.labelsLabel,
})

const hovered = status()
graph.on('pointerenter', ({ target }) => {
  if (target.kind === 'node') hovered.textContent = (target.datum as Item).label
})
graph.on('pointerleave', () => {
  hovered.textContent = ''
})

const change = (next: Partial<Settings>) => {
  settings = { ...settings, ...next }
  graph.update({ definition: define(settings) })
}

const placementButton = button(messages.placement(messages.placements.bottom), () => {
  const placement =
    placements[(placements.indexOf(settings.placement) + 1) % placements.length] ?? 'bottom'
  placementButton.textContent = messages.placement(messages.placements[placement])
  change({ placement })
})

header.append(
  hovered,
  placementButton,
  button(messages.labelBackgrounds, () => change({ background: !settings.background })),
  button(messages.truncate, () => change({ truncate: !settings.truncate })),
  button(messages.fit, () => graph.view.fit(undefined, { duration: 400 })),
  ...exportButtons(graph, 'labels', { png: messages.exportPng, svg: messages.exportSvg }),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph })
