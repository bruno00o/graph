import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { createMesh, type Link, type Spot } from './mesh'
import { messages } from './messages'
import '../shared/overlays.css'

const columns = 22
const rows = 13
const { spots, links } = createMesh(columns, rows, 5)
const at = (row: number, column: number) => spots[row * columns + column]?.id ?? ''
const start = at(6, 0)
const end = at(6, columns - 1)
const wall = Array.from({ length: rows - 3 }, (_, row) => at(row + 1, 11))

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', opacity: 0.6 }),
    nodes<Spot>(spots, { x: 'x', y: 'y', size: () => 16 }),
  ],
  states: {
    ends: { fill: 'var(--graph-accent)', outline: 'var(--graph-accent)' },
    path: { stroke: 'var(--graph-accent)', strokeWidth: 3, flow: true, raise: true },
    blocked: { fill: 'var(--graph-ink)', outline: 'var(--graph-ink)', outlineWidth: 4 },
  },
  interaction: { select: false },
})

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(spots.length, links.length),
  })
  const blocked = new Set<Key>(wall)

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)

  function route(): void {
    graph.states.set('blocked', { nodes: blocked })
    const path = graph.paths.shortest(start, end, {
      weight: 'cost',
      nodes: (_, key) => !blocked.has(key),
    })
    graph.states.set('path', path ?? {})
    status.textContent = path
      ? messages.found(path.cost, blocked.size)
      : messages.cutOff(blocked.size)
  }

  graph.on('click', ({ target }) => {
    if (target?.kind !== 'node' || target.key === start || target.key === end) return
    if (!blocked.delete(target.key)) blocked.add(target.key)
    route()
  })

  graph.states.set('ends', { nodes: [start, end] })
  route()

  return graph
}
