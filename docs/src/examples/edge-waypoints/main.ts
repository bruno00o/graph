import {
  defineGraph,
  edges,
  type GraphInstance,
  mountGraph,
  nodes,
  type Point,
} from '@bruno00o/graph'
import { messages } from './messages'
import '../shared/overlays.css'

interface Spot {
  readonly id: string
  readonly label: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly via: readonly Point[]
  readonly kind: 'main' | 'side' | 'split'
  readonly label?: string
}

const spot = (id: string, x: number, y: number): Spot => ({
  id,
  label: messages.node(id.toUpperCase()),
  x,
  y,
})

const spots: Spot[] = [
  spot('a', -300, -140),
  spot('b', 300, -140),
  spot('c', 0, -140),
  spot('d', -300, 150),
  spot('e', 300, 150),
  spot('f', 0, 150),
  spot('g', 0, 10),
]

const links: Link[] = [
  {
    id: 'ab',
    from: 'a',
    to: 'b',
    kind: 'main',
    label: messages.detour,
    via: [
      { x: -200, y: -250 },
      { x: 200, y: -250 },
    ],
  },
  {
    id: 'de',
    from: 'd',
    to: 'e',
    kind: 'side',
    via: [
      { x: -200, y: 260 },
      { x: 0, y: 290 },
      { x: 200, y: 260 },
    ],
  },
  {
    id: 'ad',
    from: 'a',
    to: 'd',
    kind: 'main',
    via: [
      { x: -420, y: -70 },
      { x: -420, y: 80 },
    ],
  },
  {
    id: 'be',
    from: 'b',
    to: 'e',
    kind: 'split',
    via: [
      { x: 420, y: -70 },
      { x: 420, y: 80 },
    ],
  },
  {
    id: 'cf',
    from: 'c',
    to: 'f',
    kind: 'main',
    via: [
      { x: 110, y: -60 },
      { x: 110, y: 80 },
    ],
  },
  { id: 'cg', from: 'c', to: 'g', kind: 'side', via: [] },
  { id: 'gf', from: 'g', to: 'f', kind: 'side', via: [] },
]

const labelOf = new Map(spots.map((item) => [item.id, item.label]))

const define = (shown: boolean) =>
  defineGraph({
    marks: [
      edges<Link>(links, {
        source: 'from',
        target: 'to',
        waypoints: (link) => (shown ? link.via : null),
        width: 2,
        arrow: (link) => (link.kind === 'side' ? 'none' : 'target'),
        dash: (link) => (link.kind === 'side' && link.via.length > 0 ? 'dashed' : 'solid'),
        flow: (link) => link.kind === 'side' && link.via.length > 0,
        label: (link) => link.label ?? null,
        ends: {
          split: 0.5,
          source: {
            stroke: (link) => (link.kind === 'split' ? 'var(--graph-cat-2)' : 'var(--graph-edge)'),
          },
          target: {
            stroke: (link) => (link.kind === 'split' ? 'var(--graph-cat-4)' : 'var(--graph-edge)'),
          },
        },
      }),
      nodes<Spot>(spots, { x: 'x', y: 'y', size: 34, label: 'label' }),
    ],
  })

export function mount(container: HTMLElement): GraphInstance {
  let shown = true
  const graph = mountGraph(container, {
    definition: define(shown),
    ariaLabel: messages.graphLabel(spots.length, links.length),
  })
  graph.view.fit({ edges: links.map((link) => link.id), padding: 32 })

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-button'
  button.textContent = messages.waypoints(shown)
  button.addEventListener('click', () => {
    shown = !shown
    button.textContent = messages.waypoints(shown)
    graph.update({ definition: define(shown) })
  })
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions)

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)
  graph.on('pointerenter', ({ target }) => {
    status.textContent =
      target.kind === 'edge'
        ? messages.edge(
            labelOf.get(target.datum.from) ?? target.datum.from,
            labelOf.get(target.datum.to) ?? target.datum.to,
            shown ? target.datum.via.length : 0,
          )
        : target.datum.label
  })
  graph.on('pointerleave', () => {
    status.textContent = ''
  })

  return graph
}
