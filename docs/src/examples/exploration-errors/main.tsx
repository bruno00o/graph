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
import { shallow, useSelector } from '@tanstack/react-store'
import { type Ref, useEffect, useMemo, useState } from 'react'
import type { Item, Link } from '../shared/data'
import { createServer, roots } from './api'
import { messages } from './messages'
import '../shared/overlays.css'

type Explored = Exploration<Item, Link>
type Marks = NodeMark<Item> | EdgeMark<Link>

function failedKeys(exploration: Explored): Key[] {
  return [...exploration.store.state.errors.keys()]
}

function MirrorStates({ exploration }: { readonly exploration: Explored }) {
  const graph = useGraph()
  const expanded = useSelector(exploration.store, (state) => state.expanded)
  const loading = useSelector(exploration.store, (state) => state.loading)
  const failed = useSelector(exploration.store, (state) => [...state.errors.keys()], {
    compare: shallow,
  })
  useEffect(() => graph.states.set('expanded', { nodes: expanded }), [graph, expanded])
  useEffect(() => graph.states.set('loading', { nodes: loading }), [graph, loading])
  useEffect(() => graph.states.set('failed', { nodes: failed }), [graph, failed])
  return null
}

function Status({ exploration }: { readonly exploration: Explored }) {
  const loading = useSelector(exploration.store, (state) => state.loading.length)
  const failed = useSelector(exploration.store, (state) => state.errors.size)
  const expanded = useSelector(exploration.store, (state) => state.expanded.length)
  const hovered = useGraphState((state: GraphState<string, Marks>) => state.hovered)
  const errors = useSelector(exploration.store, (state) => state.errors)
  let text = messages.explored(expanded)
  if (loading > 0) text = messages.loading(loading)
  else if (failed > 0) text = messages.failed(failed)
  if (hovered?.kind === 'node' && errors.has(hovered.key)) {
    text = messages.hoveredFailure(hovered.datum.label)
  }
  return (
    <output className="example-status" aria-live="polite">
      {text}
    </output>
  )
}

function Explorer({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const queryClient = useQueryClient()
  const [exploration] = useState(() => {
    const fetchNeighbors = createServer()
    return createExploration(queryClient, {
      roots,
      neighbors: (key: Key) =>
        queryOptions({
          queryKey: ['neighbors', key],
          queryFn: () => fetchNeighbors(String(key)),
          retry: false,
          staleTime: Number.POSITIVE_INFINITY,
        }),
    })
  })
  const retry = (keys: readonly Key[]) => {
    for (const key of keys) void queryClient.refetchQueries({ queryKey: ['neighbors', key] })
  }
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
          loading: { opacity: 0.4 },
          failed: { outline: 'var(--graph-accent)', outlineWidth: 4, label: true },
        },
      }),
    [exploration],
  )
  return (
    <Graph
      ref={ref}
      className="example-graph"
      definition={definition}
      ariaLabel={messages.graphLabel}
      initialView={{ x: 0, y: 0, zoom: 1.8 }}
      onDoubleClick={({ target }) => {
        if (target?.kind !== 'node') return
        if (exploration.store.state.errors.has(target.key)) retry([target.key])
        else exploration.toggle(target.key)
      }}
    >
      <MirrorStates exploration={exploration} />
      <Status exploration={exploration} />
      <div className="example-actions">
        <button
          className="example-button"
          type="button"
          onClick={() => retry(failedKeys(exploration))}
        >
          {messages.retryAll}
        </button>
        <button className="example-button" type="button" onClick={() => exploration.reset()}>
          {messages.reset}
        </button>
      </div>
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
