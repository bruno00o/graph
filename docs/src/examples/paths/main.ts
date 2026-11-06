import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
  type PathOptions,
} from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

const { items, links } = createSample(1_000, 2_000)

const dots = nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' })
const lines = edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' })

const definition = defineGraph({
  marks: [lines, dots],
  states: {
    muted: { opacity: 0.15, label: false },
    path: { flow: true, stroke: 'var(--graph-accent)', strokeWidth: 2.5, label: true },
  },
})

type PathMode = keyof typeof messages.pathModes

const byKey = new Map(items.map((item) => [item.id, item]))

function length(link: Link): number {
  const from = byKey.get(link.from)
  const to = byKey.get(link.to)
  return from && to ? Math.hypot(to.x - from.x, to.y - from.y) : Number.NaN
}

const options: Record<PathMode, PathOptions<typeof lines | typeof dots>> = {
  hops: {},
  distance: { weight: length },
}

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, { definition, ariaLabel: messages.pathsLabel })
  let mode: PathMode = 'hops'

  const status = document.createElement('output')
  status.className = 'example-status'
  status.textContent = messages.pathHint
  container.append(status)

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'example-button'
  toggle.textContent = messages.pathMode(messages.pathModes[mode])
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(toggle)
  container.append(actions)

  function trace(): void {
    const selected = graph.selection.get().nodes
    const [from, to] = selected
    if (selected.length !== 2 || from === undefined || to === undefined) {
      graph.states.clear()
      status.textContent = messages.pathHint
      return
    }
    const start = performance.now()
    const path = graph.paths.shortest(from, to, options[mode])
    const duration = performance.now() - start
    status.textContent = path
      ? messages.pathFound(path.edges.length, duration)
      : messages.noPath(duration)
    const keepNodes = new Set<Key>(path?.nodes ?? selected)
    const keepEdges = new Set<Key>(path?.edges)
    graph.states.set('path', { nodes: keepNodes, edges: keepEdges })
    graph.states.set('muted', {
      nodes: items.filter((item) => !keepNodes.has(item.id)).map((item) => item.id),
      edges: links.filter((link) => !keepEdges.has(link.id)).map((link) => link.id),
    })
  }

  toggle.addEventListener('click', () => {
    mode = mode === 'hops' ? 'distance' : 'hops'
    toggle.textContent = messages.pathMode(messages.pathModes[mode])
    trace()
  })
  graph.on('selectionchange', trace)

  return graph
}
