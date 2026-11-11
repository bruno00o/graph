---
name: tanstack-query
description: >
  Use when exploring a large graph one neighborhood at a time with
  @bruno00o/graph and TanStack Query: expanding a node on double-click to fetch
  its neighbors, collapsing it to remove what nothing else holds, keeping
  roots, showing which nodes are expanded or loading, listing failed
  expansions and retrying them, caching neighborhoods with query options, and
  typing the nodes and edges that createExploration returns.
metadata:
  purpose: >
    The @bruno00o/graph/query entry point: createExploration, which turns
    neighborhood queries into two live sources and a store of expanded, loading
    and failed nodes, with the mistakes that lose typing, leave roots empty or
    hide errors.
  type: composition
  library: '@bruno00o/graph'
sources:
  - src/query/index.ts
  - src/host/data-status.ts
  - docs/content/docs/(guide)/tanstack-query.mdx
  - docs/content/docs/api/create-exploration.mdx
requires:
  - core
---

# Explore a graph with TanStack Query

Load the core skill first (`intent load @bruno00o/graph#core`): live sources, keys, states and instance events are as in core. This skill covers `createExploration` from `@bruno00o/graph/query`.

Install `@tanstack/query-core` (an optional peer, `^5`) or the adapter of your framework, which re-exports it. Each expanded node is one `QueryObserver`, so caching, deduplication, `staleTime`, retries and invalidation all come from TanStack Query. The graph core imports nothing from it.

## Setup

`createExploration(client, { roots, neighbors })` returns an exploration: `nodes` and `edges` (live sources for `nodes()` and `edges()`), a `store`, and `expand`, `collapse`, `toggle`, `retry`, `reset` and `destroy`.

- `roots`: keys expanded at once and never removed.
- `neighbors(key)`: the query options for the neighborhood of a node. Its data is `{ nodes, edges }`: the nodes around it and the edges between them and it. It usually contains the node itself, which is how a root gets its data.
- Items are keyed by their `id` field. Pass `nodeKey` and `edgeKey` (a field name or a function) when they have none.

```ts
import { defineGraph, edges, type Key, mountGraph, nodes } from '@bruno00o/graph'
import { createExploration } from '@bruno00o/graph/query'
import { QueryClient } from '@tanstack/query-core'

type Person = { id: string; name: string; group: string }
type Relation = { id: string; from: string; to: string }

declare function fetchNeighbors(key: Key): Promise<{ nodes: Person[]; edges: Relation[] }>

const neighbors = (key: Key) => ({
  queryKey: ['neighbors', key],
  queryFn: () => fetchNeighbors(key),
  staleTime: Number.POSITIVE_INFINITY,
})

const exploration = createExploration<Person, Relation>(new QueryClient(), {
  roots: ['n1'],
  neighbors,
})

const definition = defineGraph({
  marks: [
    edges(exploration.edges, { source: 'from', target: 'to' }),
    nodes(exploration.nodes, { color: 'group', label: 'name' }),
  ],
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Explored graph' })

graph.on('doubleclick', ({ target }) => {
  if (target?.kind === 'node') exploration.toggle(target.key)
})
```

Result: the root's neighborhood appears, a double-click on a node fetches and adds its neighbors (placed next to the neighbors they connect to), and a second double-click removes what only that expansion holds. Nothing is fetched until a mark subscribes to the sources, so creating an exploration has no side effect.

## Core Patterns

### Type the nodes and edges

The data of a plain query-options object is not connected to the node and edge types, so TypeScript cannot infer them: pass them as type arguments, as above (`createExploration<Person, Relation>`). Two ways to infer them instead:

- `queryOptions` from a TanStack Query adapter package (`@tanstack/react-query`, `@tanstack/vue-query`...) types the data from `queryFn`, and the exploration takes its types from it, `select` included.
- Give a function `nodeKey` or `edgeKey` after `neighbors` in the options object, so its parameter reads typed items.

```ts
import { edges, type Key, nodes } from '@bruno00o/graph'
import { createExploration } from '@bruno00o/graph/query'
import { QueryClient, queryOptions } from '@tanstack/react-query'

type Row = { name: string; links: { id: string; to: string }[] }

declare function fetchRows(key: Key): Promise<Row[]>

const neighbors = (key: Key) =>
  queryOptions({
    queryKey: ['rows', key],
    queryFn: () => fetchRows(key),
    select: (rows) => ({
      nodes: rows.map((row) => ({ code: row.name, label: row.name })),
      edges: rows.flatMap((row) => row.links.map((link) => ({ ...link, from: row.name }))),
    }),
  })

const exploration = createExploration(new QueryClient(), {
  roots: ['a'],
  neighbors,
  nodeKey: 'code',
})

export const marks = [
  edges(exploration.edges, { source: 'from', target: 'to' }),
  nodes(exploration.nodes, { label: 'label' }),
]
```

The selected data must be `{ nodes, edges }`. Keys must be strings or finite numbers: an item with another key is skipped and listed as `missing-key` in `graph.issues()`.

### Show what is expanded, loading or failed

`exploration.store` is a read-only TanStack Store of `{ expanded, loading, errors }`: the expanded keys, the keys whose query is fetching, and a `ReadonlyMap` from key to error. Mirror them into free states declared in the definition, from a subscription or an effect, never from inside a render.

```ts
import { defineGraph, edges, type Key, mountGraph, nodes } from '@bruno00o/graph'
import { createExploration, type ExplorationState } from '@bruno00o/graph/query'
import { QueryClient } from '@tanstack/query-core'

type Person = { id: string; name: string }
type Relation = { id: string; from: string; to: string }

declare function fetchNeighbors(key: Key): Promise<{ nodes: Person[]; edges: Relation[] }>

const exploration = createExploration<Person, Relation>(new QueryClient(), {
  roots: ['n1'],
  neighbors: (key) => ({ queryKey: ['neighbors', key], queryFn: () => fetchNeighbors(key), retry: 1 }),
})

const definition = defineGraph({
  marks: [
    edges(exploration.edges, { source: 'from', target: 'to' }),
    nodes(exploration.nodes, { label: 'name' }),
  ],
  states: {
    expanded: { stroke: 'var(--graph-ink)', strokeWidth: 3 },
    loading: { opacity: 0.45 },
    failed: { outline: 'var(--graph-accent)', outlineWidth: 3 },
  },
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Explored graph' })

const mirror = (state: ExplorationState) => {
  graph.states.set('expanded', { nodes: state.expanded })
  graph.states.set('loading', { nodes: state.loading })
  graph.states.set('failed', { nodes: [...state.errors.keys()] })
}

mirror(exploration.store.state)
exploration.store.subscribe(mirror)
```

The store only notifies changes, so apply its current state once yourself, as above: the roots are already expanded when you subscribe.

A failed expansion stays expanded, with its error in `errors`. TanStack Query retries 3 times before a query fails (set `retry` in the options of `neighbors` to change it), so an error shows up after the retries.

### The graph knows when the exploration is loading

The two sources of an exploration have a `status`: loading while a query of an expansion has not answered once (or is fetched again by `retry`), `'error'` when a query failed with no data to show, ready otherwise. The graph reads it like any live source, with no setup:

- `graph.store.get().data.loading`, `loadingchange` and `await graph.loaded()` follow the queries, those of a later expansion too; `data.failed` lists the sources when an expansion failed, and `exploration.store.get().errors` tells which key.
- The first automatic layout and fit wait for the roots to load (`waitForData`, 10,000 ms from the first nodes by default), so the roots are laid out once, together. Later expansions are placed next to their neighbors as before.
- Nothing is tracked until a mark subscribes to the sources, since nothing is fetched before.

```ts
import { defineGraph, edges, type Key, mountGraph, nodes } from '@bruno00o/graph'
import { createExploration } from '@bruno00o/graph/query'
import { QueryClient } from '@tanstack/query-core'

type Person = { id: string; name: string }
type Relation = { id: string; from: string; to: string }

declare function fetchNeighbors(key: Key): Promise<{ nodes: Person[]; edges: Relation[] }>

const exploration = createExploration<Person, Relation>(new QueryClient(), {
  roots: ['n1', 'n2'],
  neighbors: (key) => ({ queryKey: ['neighbors', key], queryFn: () => fetchNeighbors(key) }),
})

const graph = mountGraph(document.body, {
  definition: defineGraph({
    marks: [
      edges(exploration.edges, { source: 'from', target: 'to' }),
      nodes(exploration.nodes, { label: 'name' }),
    ],
  }),
  ariaLabel: 'Explored graph',
})

export async function roots() {
  await graph.loaded()
  return graph.store.get().data.failed.length === 0
}
```

### Retry a failed expansion

`retry(key)` fetches an expanded node's failed query again: its key leaves `errors` and returns to `loading`, then to `errors` only if the new fetch fails too. It does nothing for a key that is not expanded or has not failed, and with no subscriber it waits until a mark subscribes again.

```ts
import type { GraphInstance } from '@bruno00o/graph'
import type { Exploration } from '@bruno00o/graph/query'

type Person = { id: string; name: string }
type Relation = { id: string; from: string; to: string }

export function wire(graph: GraphInstance, exploration: Exploration<Person, Relation>) {
  return graph.on('doubleclick', ({ target }) => {
    if (target?.kind !== 'node') return
    if (exploration.store.state.errors.has(target.key)) exploration.retry(target.key)
    else exploration.toggle(target.key)
  })
}
```

### Methods

- `expand(key)` starts a query observer for the node and adds its result. Expanding an expanded key does nothing.
- `collapse(key)` stops the query and removes the nodes and edges that no other expansion holds. Roots stay. A neighbor shared by two expansions stays until both are collapsed: the graph deduplicates by key.
- `toggle(key)` expands or collapses. `reset()` collapses everything but the roots, then expands the roots again.
- `destroy()` stops every observer for good. Call it when the page goes away. Creation and StrictMode double mounts have no side effect: queries run only while a source has a subscriber, and a remount resumes from the cache.
- Invalidate `['neighbors', key]` in the QueryClient and the graph updates by difference.

### Seed with a first query, and clean up

A root is only a key that is expanded at once: it does not have to be a node. To show a first query result (a start page, a search) and explore from it, use a sentinel root such as `'overview'` and let `neighbors` branch on the key: the overview query for the sentinel, the neighborhood query for any node.

Cleanup order: abort the `signal` given to `mountGraph` (or call `graph.destroy()`), unsubscribe from the store, then call `exploration.destroy()`. `exploration.store.subscribe(listener)` returns an object with `unsubscribe()`, while `graph.on(...)` returns a plain function.

```ts
import { defineGraph, edges, type Key, mountGraph, nodes } from '@bruno00o/graph'
import { createExploration } from '@bruno00o/graph/query'
import { QueryClient } from '@tanstack/query-core'

type Person = { id: string; name: string }
type Relation = { id: string; from: string; to: string }

declare function fetchStart(): Promise<{ nodes: Person[]; edges: Relation[] }>
declare function fetchNeighbors(key: Key): Promise<{ nodes: Person[]; edges: Relation[] }>

const exploration = createExploration<Person, Relation>(new QueryClient(), {
  roots: ['overview'],
  neighbors: (key) => ({
    queryKey: ['neighbors', key],
    queryFn: () => (key === 'overview' ? fetchStart() : fetchNeighbors(key)),
  }),
})

const definition = defineGraph({
  marks: [
    edges(exploration.edges, { source: 'from', target: 'to' }),
    nodes(exploration.nodes, { label: 'name' }),
  ],
})
const controller = new AbortController()
const graph = mountGraph(document.body, {
  definition,
  ariaLabel: 'Explored graph',
  signal: controller.signal,
})
const subscription = exploration.store.subscribe(() => {})

graph.on('doubleclick', ({ target }) => {
  if (target?.kind === 'node') exploration.toggle(target.key)
})

window.addEventListener(
  'pagehide',
  () => {
    subscription.unsubscribe()
    controller.abort()
    exploration.destroy()
  },
  { once: true },
)
```

### Retry on click and expand on double-click together

A double-click fires two `click` events before `doubleclick`. If a click retries a failed node and a double-click toggles it, a double-click on a failed node retries it twice and then collapses it. Decide per node: in the `doubleclick` handler, skip `toggle` for a key that is in `errors`, and retry in `click` only for those keys.

### Use it in React

Create the exploration once with `useState(() => createExploration(...))` and build the definition from its sources in a `useMemo` keyed on the exploration. Read the store with `useSelector` from `@tanstack/react-store` and mirror it into states in effects, with the graph from `useGraph()`. Load the react skill for `<Graph>`.

```tsx
import { defineGraph, edges, type Key, nodes } from '@bruno00o/graph'
import { createExploration, type Exploration } from '@bruno00o/graph/query'
import { Graph, useGraph } from '@bruno00o/graph/react'
import { useQueryClient } from '@tanstack/react-query'
import { useSelector } from '@tanstack/react-store'
import { useEffect, useMemo, useState } from 'react'

type Person = { id: string; name: string }
type Relation = { id: string; from: string; to: string }

declare function fetchNeighbors(key: Key): Promise<{ nodes: Person[]; edges: Relation[] }>

const neighbors = (key: Key) => ({
  queryKey: ['neighbors', key],
  queryFn: () => fetchNeighbors(key),
})

function ExplorationStates({ exploration }: { exploration: Exploration<Person, Relation> }) {
  const graph = useGraph()
  const expanded = useSelector(exploration.store, (state) => state.expanded)
  const loading = useSelector(exploration.store, (state) => state.loading)
  useEffect(() => graph.states.set('expanded', { nodes: expanded }), [graph, expanded])
  useEffect(() => graph.states.set('loading', { nodes: loading }), [graph, loading])
  return null
}

export function Explorer() {
  const client = useQueryClient()
  const [exploration] = useState(() =>
    createExploration<Person, Relation>(client, { roots: ['n1'], neighbors }),
  )
  const definition = useMemo(
    () =>
      defineGraph({
        marks: [
          edges(exploration.edges, { source: 'from', target: 'to' }),
          nodes(exploration.nodes, { label: 'name' }),
        ],
        states: { expanded: { strokeWidth: 3 }, loading: { opacity: 0.45 } },
      }),
    [exploration],
  )
  return (
    <Graph
      definition={definition}
      ariaLabel="Explored graph"
      onDoubleClick={({ target }) => {
        if (target?.kind === 'node') exploration.toggle(target.key)
      }}
    >
      <ExplorationStates exploration={exploration} />
    </Graph>
  )
}
```

To explore a graph database, `neighbors` runs a Cypher query and returns `cypherGraph(result)`: see the cypher skill.

## Common Mistakes

### HIGH Expecting the types to be inferred from a plain query object

With `{ queryKey, queryFn }` and no type arguments, TypeScript gives the nodes the type `{ readonly id: Key }`, and every option that reads another field fails to compile.

```ts expect-error=TS2769
import { edges, type Key, nodes } from '@bruno00o/graph'
import { createExploration } from '@bruno00o/graph/query'
import { QueryClient } from '@tanstack/query-core'

type Person = { id: string; name: string }
type Relation = { id: string; from: string; to: string }

declare function fetchNeighbors(key: Key): Promise<{ nodes: Person[]; edges: Relation[] }>

const exploration = createExploration(new QueryClient(), {
  roots: ['n1'],
  neighbors: (key: Key) => ({ queryKey: ['neighbors', key], queryFn: () => fetchNeighbors(key) }),
})

nodes(exploration.nodes, { label: 'name' })
edges(exploration.edges, { source: 'from', target: 'to' })
```

Write `createExploration<Person, Relation>(...)`, or build the options with the `queryOptions` of an adapter.

### HIGH Items without an `id` field and no key option

Without `nodeKey`, the node type must have an `id` field, and without `edgeKey` the edge type too. Add `nodeKey` or `edgeKey` (a field name or a function), and put `neighbors` before them in the options object so their parameters are typed.

### HIGH A neighborhood that does not contain the expanded node

An expanded node holds itself, but only the data of the response gives it a position, a label and a color. If `neighbors(key)` returns only the neighbors, the root has no data: it is not drawn and its edges wait. Return the node with its neighbors, and use an `OPTIONAL MATCH` or a left join so that a node with no neighbor is still returned.

### MEDIUM Creating the exploration in render

`createExploration` must be created once. In React, `useState(() => createExploration(...))` (never in the body of the component) and a `useMemo` for the definition keyed on it. A new exploration on each render starts every expansion again and replaces both sources.

### MEDIUM Writing states from the render

Mirror `exploration.store` into states in a subscription or an effect. Calling `graph.states.set` during a render makes React warn about updating a component while rendering.

### MEDIUM Not handling errors

A failed expansion stays expanded and nothing marks it on screen. Show `errors` (a state, a message) and give the user `retry(key)`. Remember that TanStack Query retries 3 times first, so an error is late unless `retry` is lowered.

### MEDIUM A `queryKey` that does not contain the node key

`queryKey: ['neighbors']` for every node makes TanStack Query return the same cached neighborhood for all of them. Put the key in it, and invalidate `['neighbors', key]` to refresh one node.

### MEDIUM Forgetting to `destroy`

Observers keep running while a source has a subscriber. Call `exploration.destroy()` when the page or component goes away, after unmounting the graph.

## Completion

The task is done when:

- `createExploration` is created once, with type arguments or typed `queryOptions`, roots set, and `neighbors` returning `{ nodes, edges }` that includes the expanded node;
- the marks read `exploration.nodes` and `exploration.edges`, with `source`/`target` matching the node keys;
- expansion is wired to an event (`toggle` on double-click, for example), and failures can be seen and retried;
- a wait for the first data awaits `graph.loaded()` or reads `data`, and does not rely on `drawn()`;
- `expanded`, `loading` (and failed) states are declared and written from the store, outside render;
- the exploration is destroyed with the page;
- `tsc` accepts the code with no casts.

## References

Every page has a Markdown version: add `.md` to its URL.

- [TanStack Query guide](https://bruno00o.github.io/graph/docs/tanstack-query), [createExploration](https://bruno00o.github.io/graph/docs/api/create-exploration), [Cypher](https://bruno00o.github.io/graph/docs/cypher#explore-with-a-query)
- Examples: [neighborhood exploration](https://bruno00o.github.io/graph/examples/neighborhood-exploration), [loading and errors while exploring](https://bruno00o.github.io/graph/examples/exploration-errors), [expand on double-click](https://bruno00o.github.io/graph/examples/expand-on-double-click)
