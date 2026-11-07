import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { messages } from './messages'
import '../shared/overlays.css'

type Row = 'stroke' | 'outline' | 'both'

interface Item {
  readonly id: string
  readonly row: Row
  readonly width: number
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const rows: readonly Row[] = ['stroke', 'outline', 'both']
const widths = [1, 3, 6, 10]

const items: Item[] = rows.flatMap((row, at) =>
  widths.map((width, column) => ({
    id: `${row}-${width}`,
    row,
    width,
    x: (column - 1.5) * 150,
    y: (at - 1) * 150,
  })),
)

const links: Link[] = items.flatMap((item, index) => {
  const next = items[index + 1]
  return next && next.row === item.row
    ? [{ id: `${item.id}:${next.id}`, from: item.id, to: next.id }]
    : []
})

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Item>(items, {
      x: 'x',
      y: 'y',
      size: () => 48,
      color: 'row',
      stroke: (item) => (item.row === 'outline' ? 'var(--graph-node-ring)' : 'var(--graph-ink)'),
      strokeWidth: (item) => (item.row === 'outline' ? 1 : item.row === 'both' ? 3 : item.width),
      outline: (item) => (item.row === 'stroke' ? null : 'var(--graph-cat-2)'),
      outlineWidth: (item) => item.width,
      label: {
        text: (item) => messages.row[item.row],
        secondary: (item) => messages.widths(item.row, item.width),
      },
    }),
  ],
  scales: {
    size: (value) => value,
    color: {
      domain: rows,
      range: ['var(--graph-cat-1)', 'var(--graph-cat-3)', 'var(--graph-cat-5)'],
    },
  },
  view: { padding: 80 },
})

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, { definition, ariaLabel: messages.graphLabel })
  graph.selection.set({ nodes: ['both-10'] })
  return graph
}
