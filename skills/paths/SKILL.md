---
name: paths
description: >
  Use when finding the shortest path between two @bruno00o/graph nodes,
  weighted by an edge field or a function and following or ignoring edge
  direction, listing every node within a number of hops or a cost budget of one
  node, keeping a search out of some nodes or edges, searching the graph as
  drawn with folded groups, highlighting the result with a state, framing it,
  or running path queries with no mounted graph on a server, in a worker or in
  a test.
metadata:
  purpose: >
    The path queries of @bruno00o/graph: shortest and reach on a mounted graph
    or on marks alone, their options (weight, direction, nodes, edges, visible,
    maxCost), their results, and how to highlight a result, with the mistakes
    that give no path, a thrown error or a wrong cost.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/paths.ts
  - src/types.ts
  - docs/content/docs/(guide)/paths.mdx
  - docs/content/docs/api/paths.mdx
requires:
  - core
---

# Find paths and reachable nodes

Load the core skill first (`intent load @bruno00o/graph#core`): paths read the keys of your data and put their results in states. This skill covers the two queries, `shortest` and `reach`, on `graph.paths` and on `createPathFinder`.

Queries read the adjacency the graph already holds, so they need no copy of your data. They apply pending data changes first, are synchronous, and allocate only their result.

## Setup

`graph.paths` exists on every mounted graph, with no setup. Both queries take node keys (the `id` or `key` values of your items) and return keys.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; label: string }
type Link = { id: string; from: string; to: string; distance: number }

const items: Item[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
]
const links: Link[] = [
  { id: 'ab', from: 'a', to: 'b', distance: 4 },
  { id: 'bc', from: 'b', to: 'c', distance: 1 },
]

const definition = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to', arrow: 'target' }),
    nodes(items, { label: 'label' }),
  ],
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })

const path = graph.paths.shortest('a', 'c', { weight: 'distance', direction: 'forward' })
console.log(path?.nodes, path?.edges, path?.cost)
```

`shortest` returns `{ nodes, edges, costs, cost }` or `null`. `nodes` and `edges` are `readonly Key[]` (`Key` is `string | number`) and `costs` is `readonly number[]`: declare return types as `readonly`, since a mutable array type does not accept them. `nodes` are the keys along the path from the start to the end. `edges` are the keys of the edges between them, one fewer (when two nodes are joined by several edges it tells which one is taken). `costs` is the cost from the start to each node, and `cost` the total. From a node to itself the path is that node alone at cost 0.

## Core Patterns

### Decide the cost and the direction

- Without options every edge costs 1 and edges are crossed both ways: the path has the fewest edges.
- `weight` is a field of the edge items (checked against the item type) or a function of an item. The path has the lowest sum of weights. A function may return `number | null | undefined`: a missing value blocks the edge, so an optional field like `minutes?: number` needs no fallback.
- `direction: 'forward'` crosses edges from source to target only, so a path follows the arrows. `'backward'` crosses from target to source only, so it goes upstream. `'both'` is the default.

```ts
import { createPathFinder, edges, nodes } from '@bruno00o/graph'

type Item = { id: string }
type Link = { id: string; from: string; to: string; delay: number; wait: number }

const items: Item[] = []
const links: Link[] = []

const finder = createPathFinder({
  marks: [nodes(items), edges(links, { source: 'from', target: 'to' })],
})

finder.shortest('a', 'f', { weight: (link) => link.delay + link.wait })
finder.shortest('a', 'f', { weight: 'delay', direction: 'forward' })
finder.destroy()
```

### Keep the search to some nodes and edges

`nodes` and `edges` are predicates over the item and its key. The search enters only nodes that pass `nodes`, and the two ends must pass it too, or there is no path. It crosses only edges that pass `edges`.

```ts
import { createPathFinder, edges, nodes } from '@bruno00o/graph'

type Item = { id: string; status: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const links: Link[] = []
const blocked = new Set<string | number>()

const finder = createPathFinder({
  marks: [nodes(items), edges(links, { source: 'from', target: 'to' })],
})

finder.shortest('a', 'f', {
  nodes: (item) => item.status !== 'closed',
  edges: (link, key) => !blocked.has(key),
})
finder.destroy()
```

### List what is within reach

`reach(from, options)` returns `{ nodes, costs, edges }`: the nodes the start leads to, the start first, by increasing cost, the cost of each, and the edges between two reached nodes that the search may cross. It takes the options of `shortest` plus `maxCost`.

- Without `weight`, `maxCost` counts edges: `{ maxCost: 1 }` is the start and its neighbors.
- Without `maxCost`, the result is the whole connected component. With `direction: 'forward'` it is every node the start leads to, with `'backward'` every node that leads to it.
- An unknown key gives an empty result, never `null`.
- Bound interactive code with `maxCost`: a full `reach` takes 0.1 to 0.8 seconds on 500,000 nodes and 1,000,000 edges, while a `shortest` takes about 1 to 3 milliseconds.

### Highlight a result

A result is a set of node and edge keys, the shape `states.set` takes. Declare a state, set its members, clear it. `flow` shows the direction, `raise` draws the path above other edges, `others` fades the rest. `graph.view.fit` takes the same result and frames it.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; label: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const links: Link[] = []

const definition = defineGraph({
  marks: [edges(links, { source: 'from', target: 'to' }), nodes(items, { label: 'label' })],
  states: {
    path: {
      flow: true,
      stroke: 'var(--graph-accent)',
      strokeWidth: 2.5,
      label: true,
      raise: true,
      others: { opacity: 0.15, label: false },
    },
  },
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })

graph.on('selectionchange', ({ selection }) => {
  const [from, to] = selection.nodes
  const path = from !== undefined && to !== undefined ? graph.paths.shortest(from, to) : null
  if (!path) return graph.states.clear('path')
  graph.states.set('path', path)
  graph.view.fit(path)
})
```

With the default `'multiple'` selection, a user selects two nodes by clicking the first and Shift-clicking the second, and the path lights up. Selection keys come in the order they joined the selection, so the first is the start. With `direction: 'forward'` the order matters: swapped ends give another path, or `null`. To step along the path, walk `path.nodes` with `graph.focus.set(key)` or `graph.view.fit({ nodes: [key] })`.

### Search the graph as drawn

By default queries run on the data: every node and edge, inside a folded group or not, inside the time window or not. `visible: true` runs them on the graph as drawn:

- nodes and edges outside the time window or their zoom range are left out;
- a folded group stands for the nodes it hides, an end hidden in a folded group is replaced by the group, and the edges inside a folded group are left out;
- an edge between two groups, drawn as one merged edge, is reported by the key of one of its members: put that key in a state and the merged edge takes the state.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const links: Link[] = []
const definition = defineGraph({
  marks: [edges(links, { source: 'from', target: 'to' }), nodes(items)],
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })

const shown = graph.paths.shortest('a', 'f', { visible: true })
const everything = graph.paths.shortest('a', 'f')
console.log(shown?.cost, everything?.cost)
```

### Search without a graph

`createPathFinder({ marks })` runs the same queries on marks, with no element and no browser: on a server, in a worker, in a test. It reads arrays and subscribes to live sources (a TanStack DB collection) as soon as it is created, and applies their changes at the next query. `visible` has no effect there, since nothing is drawn. After `destroy()`, `shortest` returns `null` and `reach` returns the empty result. Call `destroy()` when you are done, to stop listening to live sources.

## Common Mistakes

### HIGH Weights that are missing or negative

A weight that is missing, not a number or infinite makes the edge impossible to cross: the search routes around it, and with no other route returns `null`. A negative weight throws a `RangeError`, because shortest paths need weights of 0 or more. When a path is unexpectedly `null` or long, check the weight of the edges on the way: `undefined`, `null`, `NaN` and a number stored as a string all block the edge. Convert in the data, or in a function that returns a finite number of 0 or more.

### HIGH Reading `null` or an empty result as a bug

`shortest` returns `null` when no path joins the two nodes, when a key is unknown, and when an end fails the `nodes` predicate. A value that is not a key (`undefined`, `null`, an object, `NaN`) counts as an unknown key, and keys are compared as given: `1` and `'1'` differ. Handle `null` before reading `path.nodes`. `reach` gives an empty result instead of `null`.

### HIGH Expecting a directed search by default

Edges are crossed both ways unless `direction` is set. An arrow on an edge does not make the search directed. Pass `direction: 'forward'` to follow arrows and `'backward'` to go upstream. Only the three literal values compile.

```ts expect-error=TS2322
import { createPathFinder, edges, nodes } from '@bruno00o/graph'

type Item = { id: string }
type Link = { id: string; from: string; to: string }
const items: Item[] = []
const links: Link[] = []
const finder = createPathFinder({
  marks: [nodes(items), edges(links, { source: 'from', target: 'to' })],
})

finder.shortest('a', 'b', { direction: 'downstream' })
```

### MEDIUM A weight field that does not exist

`weight` is checked against the edge items of the marks, so a misspelled field does not compile, provided the marks are typed by inference. Writing the item type on the call (`edges<Link>(...)`) also types the weight, but it stops the inference of mark names elsewhere (see the core skill).

```ts expect-error=TS2820
import { createPathFinder, edges, nodes } from '@bruno00o/graph'

type Item = { id: string }
type Link = { id: string; from: string; to: string; distance: number }
const items: Item[] = []
const links: Link[] = []
const finder = createPathFinder({
  marks: [nodes(items), edges(links, { source: 'from', target: 'to' })],
})

finder.shortest('a', 'b', { weight: 'distnace' })
```

### MEDIUM A negative or NaN `maxCost`

`maxCost` must be a number of 0 or more, or `reach` throws a `RangeError`. Omit it for no limit rather than passing `-1`. An unknown `direction` string that got past the types (from untyped input) throws a `TypeError`.

### MEDIUM Searching the data and expecting what is drawn

Without `visible: true` a path may run through nodes hidden in a folded group or outside the time window, and highlighting its keys puts states on elements that are not on screen. Use `visible: true` when the path must exist on screen.

### MEDIUM Forgetting `destroy()` on a path finder

A finder subscribes to live sources when created. Without `destroy()` it keeps listening and holding its memory.

## Completion

The task is done when:

- every `shortest` call handles `null`, and every `reach` call its possibly empty result;
- weights are finite numbers of 0 or more, or deliberately absent to block an edge, and `direction` is set whenever arrows matter;
- `reach` in interactive code has a `maxCost`;
- a highlighted result goes through a declared state with `graph.states.set`, and is cleared when it no longer applies;
- `visible: true` is used when the path must follow folds, time and zoom;
- a finder without a graph is destroyed when finished;
- `tsc` accepts the code.

## References

Every page has a Markdown version: add `.md` to its URL.

- [Paths guide](https://bruno00o.github.io/graph/docs/paths), [Paths API](https://bruno00o.github.io/graph/docs/api/paths)
- Examples: [path costs](https://bruno00o.github.io/graph/examples/weighted-path), [upstream and downstream](https://bruno00o.github.io/graph/examples/upstream-downstream), [detour around blocked nodes](https://bruno00o.github.io/graph/examples/detour), [neighborhood by hops](https://bruno00o.github.io/graph/examples/k-hop-neighborhood), [within a cost budget](https://bruno00o.github.io/graph/examples/cost-budget), [connected components](https://bruno00o.github.io/graph/examples/connected-components), [path through waypoints](https://bruno00o.github.io/graph/examples/waypoints)
