import { defineGraph, edges, type Key, nodes } from '@bruno00o/graph'
import { createExploration, type Exploration } from '@bruno00o/graph/query'
import { Graph, type GraphInstance, useGraph, useGraphState } from '@bruno00o/graph/react'
import {
  QueryClient,
  QueryClientProvider,
  queryOptions,
  useQueryClient,
} from '@tanstack/react-query'
import { useSelector } from '@tanstack/react-store'
import { type Ref, useEffect, useMemo, useState } from 'react'
import type { Item, Link } from '../shared/data'
import { messages } from '../shared/messages'
import { fetchNeighbors, firstNode } from './api'
import '../shared/overlays.css'

const neighbors = (key: Key) =>
  queryOptions({
    queryKey: ['neighbors', key],
    queryFn: () => fetchNeighbors(String(key)),
    staleTime: Number.POSITIVE_INFINITY,
  })

type Explored = Exploration<Item, Link>

function ExplorationStates({ exploration }: { readonly exploration: Explored }) {
  const graph = useGraph()
  const expanded = useSelector(exploration.store, (state) => state.expanded)
  const loading = useSelector(exploration.store, (state) => state.loading)
  useEffect(() => graph.states.set('expanded', { nodes: expanded }), [graph, expanded])
  useEffect(() => graph.states.set('loading', { nodes: loading }), [graph, loading])
  return null
}

function Status({ exploration }: { readonly exploration: Explored }) {
  const expanded = useSelector(exploration.store, (state) => state.expanded.length)
  const loading = useSelector(exploration.store, (state) => state.loading.length > 0)
  const hovered = useGraphState((state) => state.hovered)
  const label = hovered?.kind === 'node' ? (hovered.datum as Item).label : null
  return (
    <output className="example-status" aria-live="polite">
      {label ?? (loading ? messages.loading : messages.explored(expanded))}
    </output>
  )
}

function Explorer({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const queryClient = useQueryClient()
  const [exploration] = useState(() =>
    createExploration(queryClient, { roots: [firstNode], neighbors }),
  )
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
    <Graph
      ref={ref}
      className="example-graph"
      definition={definition}
      ariaLabel={messages.exploreLabel}
      initialView={{ x: 0, y: 0, zoom: 1.4 }}
      onDoubleClick={({ target }) => {
        if (target?.kind === 'node') exploration.toggle(target.key)
      }}
    >
      <ExplorationStates exploration={exploration} />
      <Status exploration={exploration} />
    </Graph>
  )
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <Explorer ref={ref} />
    </QueryClientProvider>
  )
}
