import { defineGraph, type EdgeMark, edges, type Key, type NodeMark, nodes } from '@bruno00o/graph'
import { createExploration, type Exploration } from '@bruno00o/graph/query'
import {
  Graph,
  type GraphInstance,
  type GraphState,
  useGraph,
  useGraphState,
} from '@bruno00o/graph/react'
import {
  QueryClient,
  QueryClientProvider,
  queryOptions,
  useQueryClient,
} from '@tanstack/react-query'
import { useSelector } from '@tanstack/react-store'
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'

const world = createSample(2_000, 8_000, 8, 3)
const items = new Map(world.items.map((item) => [item.id, item]))
const incident = new Map<string, Link[]>()
for (const link of world.links) {
  for (const end of [link.from, link.to]) {
    const list = incident.get(end) ?? []
    list.push(link)
    incident.set(end, list)
  }
}

async function fetchNeighbors(key: string): Promise<{ nodes: Item[]; edges: Link[] }> {
  await new Promise((resolve) => setTimeout(resolve, 250 + Math.random() * 300))
  const links = incident.get(key) ?? []
  const around = new Set([key, ...links.flatMap((link) => [link.from, link.to])])
  return {
    nodes: [...around].flatMap((id) => items.get(id) ?? []),
    edges: links,
  }
}

const neighbors = (key: Key) =>
  queryOptions({
    queryKey: ['neighbors', key],
    queryFn: () => fetchNeighbors(String(key)),
    staleTime: Number.POSITIVE_INFINITY,
  })

type Explorer = Exploration<Item, Link>
type Marks = NodeMark<Item> | EdgeMark<Link>

function ExplorationStates({ exploration }: { readonly exploration: Explorer }) {
  const graph = useGraph()
  const expanded = useSelector(exploration.store, (state) => state.expanded)
  const loading = useSelector(exploration.store, (state) => state.loading)
  useEffect(() => graph.states.set('expanded', { nodes: expanded }), [graph, expanded])
  useEffect(() => graph.states.set('loading', { nodes: loading }), [graph, loading])
  return null
}

function Hovered() {
  const hovered = useGraphState((state: GraphState<string, Marks>) => state.hovered)
  const label = hovered?.kind === 'node' ? hovered.datum.label : ''
  return (
    <output className="hovered" aria-live="polite">
      {label}
    </output>
  )
}

function Status({ exploration }: { readonly exploration: Explorer }) {
  const expanded = useSelector(exploration.store, (state) => state.expanded.length)
  const loading = useSelector(exploration.store, (state) => state.loading.length > 0)
  return (
    <output className="hint" aria-live="polite">
      {loading ? messages.loading : messages.explored(expanded)}
    </output>
  )
}

function Explorer() {
  const queryClient = useQueryClient()
  const [exploration] = useState(() =>
    createExploration(queryClient, { roots: [world.items[0]?.id ?? 'n0'], neighbors }),
  )
  const graph = useRef<GraphInstance | null>(null)
  useEffect(() => {
    Object.defineProperty(window, 'graph', { configurable: true, get: () => graph.current })
  }, [])
  const definition = useMemo(
    () =>
      defineGraph({
        marks: [
          edges(exploration.edges, { source: 'from', target: 'to' }),
          nodes(exploration.nodes, { color: 'group', size: 'weight', label: 'label' }),
        ],
        scales: { size: { range: [10, 28] } },
        interaction: { select: false },
        states: {
          expanded: { stroke: 'var(--graph-ink)', strokeWidth: 3 },
          loading: { opacity: 0.45 },
        },
      }),
    [exploration],
  )
  return (
    <>
      <header>
        <h1>{messages.explore}</h1>
        <span className="hint">{messages.exploreHint}</span>
        <Status exploration={exploration} />
        <button type="button" onClick={() => exploration.reset()}>
          {messages.restart}
        </button>
        <button type="button" onClick={() => graph.current?.view.fit({ duration: 400 })}>
          {messages.fit}
        </button>
      </header>
      <main>
        <Graph
          ref={graph}
          className="graph"
          definition={definition}
          ariaLabel={messages.exploreLabel}
          initialView={{ x: 0, y: 0, zoom: 1.4 }}
          onDoubleClick={({ target }) => {
            if (target?.kind === 'node') exploration.toggle(target.key)
          }}
        >
          <ExplorationStates exploration={exploration} />
          <Hovered />
        </Graph>
      </main>
    </>
  )
}

const queryClient = new QueryClient()

document.title = messages.explore
const container = document.getElementById('root')
if (container) {
  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <Explorer />
      </QueryClientProvider>
    </StrictMode>,
  )
}
