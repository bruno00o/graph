import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { type CypherEdge, type CypherNode, cypherGraph } from '@bruno00o/graph/cypher'
import { force } from '@bruno00o/graph/layouts/force'
import { createExploration } from '@bruno00o/graph/query'
import { QueryClient } from '@tanstack/query-core'
import { neighborsQuery, rootId, run } from './database'
import { messages } from './messages'
import '../shared/overlays.css'

interface Person {
  readonly name: string
  readonly rank: number
}

interface Link {
  readonly weight: number
}

const neighbors = (key: Key) => ({
  queryKey: ['neighbors', key],
  queryFn: async () => cypherGraph<Person, Link>(await run(neighborsQuery, { id: String(key) })),
  staleTime: Number.POSITIVE_INFINITY,
})

export function mount(container: HTMLElement): GraphInstance {
  const exploration = createExploration<CypherNode<Person>, CypherEdge<Link>>(new QueryClient(), {
    roots: [rootId],
    neighbors,
  })

  const definition = defineGraph({
    marks: [
      edges(exploration.edges, {
        source: 'source',
        target: 'target',
        color: 'type',
        width: (link) => link.properties.weight,
      }),
      nodes(exploration.nodes, {
        color: (item) => item.labels[0],
        size: (item) => item.properties.rank,
        label: (item) => item.properties.name,
      }),
    ],
    scales: { size: { range: [12, 30] }, width: { range: [1, 3] } },
    layout: force(),
    view: { autoFit: 'layouts' },
    states: {
      expanded: { stroke: 'var(--graph-ink)', strokeWidth: 3 },
      loading: { opacity: 0.45 },
    },
    interaction: { select: false },
  })
  const graph = mountGraph(container, { definition, ariaLabel: messages.graphLabel })

  const status = document.createElement('output')
  status.className = 'example-status'
  status.setAttribute('aria-live', 'polite')
  container.append(status)

  const watch = exploration.store.subscribe((state) => {
    graph.states.set('expanded', { nodes: state.expanded })
    graph.states.set('loading', { nodes: state.loading })
    status.textContent =
      state.loading.length > 0 ? messages.loading : messages.explored(state.expanded.length)
  })
  graph.signal.addEventListener('abort', () => watch.unsubscribe(), { once: true })

  graph.on('doubleclick', ({ target }) => {
    if (target?.kind === 'node') exploration.toggle(target.key)
  })

  return graph
}
