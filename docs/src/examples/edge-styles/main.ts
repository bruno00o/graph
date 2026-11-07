import {
  defineGraph,
  type EdgeArrow,
  type EdgeDash,
  edges,
  type GraphInstance,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { messages } from './messages'
import '../shared/overlays.css'

interface Item {
  readonly id: string
  readonly label: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly weight: number
  readonly dash: EdgeDash
  readonly arrow: EdgeArrow
}

type Width = keyof typeof messages.widths

const columns = [
  { x: -320, rows: [-180, -60, 60, 180] },
  { x: 0, rows: [-180, -60, 60, 180] },
  { x: 320, rows: [-120, 0, 120] },
]

const items: Item[] = columns.flatMap((column, at) =>
  column.rows.map((y, row) => ({
    id: `${'smt'[at]}${row}`,
    label: messages.node(at, row),
    x: column.x,
    y,
  })),
)

const link = (from: string, to: string, weight: number, dash: EdgeDash, arrow: EdgeArrow) => ({
  id: `${from}-${to}`,
  from,
  to,
  weight,
  dash,
  arrow,
})

const links: Link[] = [
  link('s0', 'm0', 9, 'solid', 'target'),
  link('s0', 'm1', 3, 'dashed', 'target'),
  link('s1', 'm1', 6, 'solid', 'source'),
  link('s2', 'm2', 2, 'dotted', 'target'),
  link('s3', 'm3', 8, 'solid', 'target'),
  link('s3', 'm2', 4, 'dashed', 'both'),
  link('m0', 't0', 7, 'solid', 'target'),
  link('m1', 't0', 5, 'solid', 'target'),
  link('m1', 't1', 1, 'dotted', 'target'),
  link('m2', 't1', 10, 'solid', 'target'),
  link('m3', 't2', 6, 'dashed', 'target'),
  link('m2', 't2', 2, 'dotted', 'none'),
]

const widths = Object.keys(messages.widths) as Width[]

const define = (width: Width) =>
  defineGraph({
    marks: [
      edges<Link>(links, {
        source: 'from',
        target: 'to',
        dash: (link) => link.dash,
        arrow: (link) => link.arrow,
        label: { text: (link) => messages.weight(link.weight), size: 10 },
        ...(width === 'uniform' ? {} : { width: 'weight' }),
      }),
      nodes<Item>(items, { x: 'x', y: 'y', label: 'label' }),
    ],
    scales: {
      width: width === 'sqrt' ? { type: 'sqrt', range: [1, 9] } : { range: [1, 9] },
    },
  })

export function mount(container: HTMLElement): GraphInstance {
  let width: Width = 'linear'
  const graph = mountGraph(container, { definition: define(width), ariaLabel: messages.graphLabel })

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-button'
  button.textContent = messages.width(messages.widths[width])
  button.addEventListener('click', () => {
    width = widths[(widths.indexOf(width) + 1) % widths.length] ?? 'linear'
    button.textContent = messages.width(messages.widths[width])
    graph.update({ definition: define(width) })
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions)
  return graph
}
