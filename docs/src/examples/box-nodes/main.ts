import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { type LayersDirection, layers } from '@bruno00o/graph/layouts'
import { messages } from './messages'
import '../shared/overlays.css'

interface Item {
  readonly id: string
  readonly label: string
  readonly branch: number
  readonly level: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

type Width = keyof typeof messages.widths
type Direction = keyof typeof messages.directions

const names = [
  'Alpha',
  'Beta',
  'Gamma',
  'Delta',
  'Epsilon',
  'Zeta',
  'Eta',
  'Theta',
  'Iota',
  'Kappa',
  'Lambda',
  'Mu',
  'Omicron',
  'Sigma',
  'Upsilon',
  'Omega',
]
const parents = [-1, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 6, 6, 8, 9, 9]
const shortcuts = [
  [5, 11],
  [7, 13],
  [4, 15],
] as const

const levelOf = (index: number): number => {
  const parent = parents[index] ?? -1
  return parent < 0 ? 0 : levelOf(parent) + 1
}
const branchOf = (index: number): number => {
  const parent = parents[index] ?? -1
  return parent <= 0 ? index : branchOf(parent)
}

const items: Item[] = names.map((label, index) => ({
  id: `n${index}`,
  label,
  branch: branchOf(index),
  level: levelOf(index),
}))
const links: Link[] = [
  ...parents.flatMap((parent, index) => (parent < 0 ? [] : [[parent, index] as const])),
  ...shortcuts,
].map(([from, to], index) => ({ id: `e${index}`, from: `n${from}`, to: `n${to}` }))

const directions = Object.keys(messages.directions) as Direction[]
const widths = Object.keys(messages.widths) as Width[]
const arrange = (direction: LayersDirection) =>
  layers({ direction, layerSpacing: 40, nodeSpacing: 16 })
const initial = arrange('down')

const define = (width: Width) =>
  defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
      nodes<Item>(items, {
        shape: 'box',
        size: 28,
        width: width === 'label' ? 'label' : 72,
        fill: (item) => (item.level === 0 ? 'var(--graph-ink)' : `var(--graph-cat-${item.branch})`),
        label: 'label',
      }),
    ],
    layout: initial,
  })

export function mount(container: HTMLElement): GraphInstance {
  let width: Width = 'label'
  let direction: Direction = 'down'
  const graph = mountGraph(container, {
    definition: define(width),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })
  const relayout = () => void graph.layout.run(arrange(direction), { fit: true })

  const resize = document.createElement('button')
  resize.type = 'button'
  resize.className = 'example-button'
  resize.textContent = messages.width(messages.widths[width])
  resize.addEventListener('click', () => {
    width = widths[(widths.indexOf(width) + 1) % widths.length] ?? 'label'
    resize.textContent = messages.width(messages.widths[width])
    graph.update({ definition: define(width) })
    relayout()
  })

  const turn = document.createElement('button')
  turn.type = 'button'
  turn.className = 'example-button'
  turn.textContent = messages.direction(messages.directions[direction])
  turn.addEventListener('click', () => {
    direction = directions[(directions.indexOf(direction) + 1) % directions.length] ?? 'down'
    turn.textContent = messages.direction(messages.directions[direction])
    relayout()
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(resize, turn)
  container.append(actions)
  return graph
}
