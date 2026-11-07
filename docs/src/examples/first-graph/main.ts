import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { messages } from './messages'

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
}

const items: Item[] = [
  { id: 'n1', label: messages.node(1), group: 'A', weight: 9, x: 0, y: 0 },
  { id: 'n2', label: messages.node(2), group: 'A', weight: 4, x: -150, y: -90 },
  { id: 'n3', label: messages.node(3), group: 'A', weight: 3, x: -170, y: 80 },
  { id: 'n4', label: messages.node(4), group: 'B', weight: 6, x: 180, y: -70 },
  { id: 'n5', label: messages.node(5), group: 'B', weight: 2, x: 320, y: -150 },
  { id: 'n6', label: messages.node(6), group: 'B', weight: 2, x: 340, y: 10 },
  { id: 'n7', label: messages.node(7), group: 'C', weight: 5, x: 60, y: 170 },
  { id: 'n8', label: messages.node(8), group: 'C', weight: 1, x: 220, y: 200 },
  { id: 'n9', label: messages.node(9), group: 'C', weight: 1, x: -60, y: 290 },
]

const links: Link[] = [
  { id: 'e1', from: 'n1', to: 'n2' },
  { id: 'e2', from: 'n1', to: 'n3' },
  { id: 'e3', from: 'n2', to: 'n3' },
  { id: 'e4', from: 'n1', to: 'n4' },
  { id: 'e5', from: 'n4', to: 'n5' },
  { id: 'e6', from: 'n4', to: 'n6' },
  { id: 'e7', from: 'n1', to: 'n7' },
  { id: 'e8', from: 'n7', to: 'n8' },
  { id: 'e9', from: 'n7', to: 'n9' },
  { id: 'e10', from: 'n6', to: 'n8' },
]

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
})

export function mount(container: HTMLElement): GraphInstance {
  return mountGraph(container, { definition, ariaLabel: messages.graphLabel })
}
