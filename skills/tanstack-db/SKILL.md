---
name: tanstack-db
description: >
  Use when drawing a TanStack DB collection or live query with @bruno00o/graph
  and keeping the graph in step as rows are inserted, updated and deleted,
  filtering one large collection with subset instead of a live query, loading
  rows on demand from the server for the visible nodes or the edges around
  chosen nodes, joining collections into nodes with a live query, or writing the
  positions of dragged or laid out nodes back to a collection, with optimistic
  writes, a pending state or a separate positions collection.
metadata:
  purpose: >
    The @bruno00o/graph integration with TanStack DB: collections and live
    queries as live sources, the subset helper, on-demand loading, and
    persistPositions, with the mistakes that rewrite every node, leave edges
    pointing at nothing or load a whole collection.
  type: composition
  library: '@bruno00o/graph'
sources:
  - src/db/index.ts
  - src/db/subset.ts
  - docs/content/docs/(guide)/tanstack-db.mdx
  - docs/content/docs/(guide)/data.mdx
  - docs/content/docs/api/subset.mdx
  - docs/content/docs/api/persist-positions.mdx
requires:
  - core
---

# Draw TanStack DB collections

Load the core skill first (`intent load @bruno00o/graph#core`): marks, channels, keys and `update` are as in core. This skill covers what changes when the data is a TanStack DB collection, and the `@bruno00o/graph/db` entry point (`subset`, `persistPositions`).

Install `@tanstack/db` yourself (an optional peer, `^1.0.0-rc.1.3`). The core imports nothing from it: a collection is accepted because it has a `subscribeChanges` method.

## Setup

A collection or a live query collection goes straight into a mark. The definition never needs to change: inserted rows appear, updated rows restyle, deleted rows leave, in batches once per frame.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'

type Item = { id: string; label: string; group: string; weight: number; x: number; y: number }
type Link = { id: string; from: string; to: string }

const items = createCollection(
  localOnlyCollectionOptions({
    getKey: (item: Item) => item.id,
    initialData: [{ id: 'n1', label: 'Node 1', group: 'A', weight: 4, x: 0, y: 0 }],
  }),
)
const links = createCollection(
  localOnlyCollectionOptions({ getKey: (link: Link) => link.id, initialData: [] }),
)

const definition = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to' }),
    nodes(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Collection graph' })

items.insert({ id: 'n2', label: 'Node 2', group: 'B', weight: 2, x: 40, y: 20 })
links.insert({ id: 'e1', from: 'n1', to: 'n2' })
items.update('n2', (draft) => {
  draft.weight = 9
})
items.delete('n1')
console.log(graph.count())
```

Rules of a live source:

- The key of a node or edge is the key of its row as the collection reports it. A mark of a live source takes no `key` option (passing one does not compile), so `getKey` of the collection decides. Edge `source` and `target` must hold those keys.
- An edge whose end is not loaded yet waits and appears when the node arrives, and waits again if the node leaves. `graph.count().pending` counts waiting edges.
- With `x` and `y` channels, a row whose coordinates change moves its node, animated over `transitions.positions`. Positions that come from rows are never moved by a layout. Without `x` and `y`, nodes are placed by the layout or a spiral.
- A change whose key is not a string or a finite number is skipped and listed as `missing-key` in `graph.issues()`.
- Do not call `graph.update` for row changes: there is nothing to update. Call it only to change the definition (a different filter, a different mark).

## Core Patterns

### Filter one collection with `subset`

`subset(collection, where)` returns a live source of the rows that match `where`, built from `subscribeChanges({ where })`, with no intermediate collection. The rows are the collection's own objects, so a new subset touches only the difference.

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'
import { subset } from '@bruno00o/graph/db'
import { createCollection, gte, localOnlyCollectionOptions } from '@tanstack/db'

type Item = { id: string; group: string; weight: number; x: number; y: number }

const items = createCollection(
  localOnlyCollectionOptions({ getKey: (item: Item) => item.id, initialData: [] }),
)

const heavy = (minimum: number) => subset(items, (item) => gte(item.weight, minimum))
const define = (minimum: number) =>
  defineGraph({
    marks: [nodes(heavy(minimum), { x: 'x', y: 'y', color: 'group', size: 'weight' })],
  })

const graph = mountGraph(document.body, { definition: define(40), ariaLabel: 'Heavy items' })

graph.update({ definition: define(60) })
```

When the filter changes, build a new source and pass it in a new definition. The graph subscribes to the new source before releasing the old one and compares their rows by key: nodes that leave are removed, nodes that enter are added, nodes in both stay untouched when their row is the same object. `where` is checked against the row type, and its operators (`eq`, `gte`, `inArray`, `and`, `or`, ...) come from `@tanstack/db`.

In React, build the source in a `useMemo` that depends on the filter, so a render that keeps the filter keeps its subscription (see the react skill).

Measured on 500,000 rows (Chrome, production): a new `subset` where a handful of nodes change costs 40 to 60 ms in the graph, against 280 ms for a new live query collection and 2.3 s on the TanStack DB side. Index the field you filter on (`items.createIndex((item) => item.weight, { indexType: BTreeIndex })`) to let TanStack DB read the matching rows from the index.

### Use a live query for joins, select and ordering

A live query collection is a live source too. Its rows are new objects every time, so a new live query restyles every node that stays: keep it for what `subset` cannot do (joins, `select`, ordering).

A join keys its rows by the pair of joined keys, which edges cannot point to. Always give a join a `getKey` that returns the node key.

```ts
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import {
  createCollection,
  createLiveQueryCollection,
  eq,
  gte,
  localOnlyCollectionOptions,
} from '@tanstack/db'

type Item = { id: string; label: string; x: number; y: number }
type Score = { node: string; score: number }
type Link = { id: string; from: string; to: string }

const items = createCollection(
  localOnlyCollectionOptions({ getKey: (item: Item) => item.id, initialData: [] }),
)
const scores = createCollection(
  localOnlyCollectionOptions({ getKey: (row: Score) => row.node, initialData: [] }),
)
const links: Link[] = []

const matching = createLiveQueryCollection({
  getKey: (row) => row.id,
  query: (q) =>
    q
      .from({ item: items })
      .innerJoin({ score: scores }, ({ item, score }) => eq(item.id, score.node))
      .where(({ score }) => gte(score.score, 50))
      .select(({ item, score }) => ({
        id: item.id,
        label: item.label,
        x: item.x,
        y: item.y,
        score: score.score,
      })),
})

export const definition = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to' }),
    nodes(matching, { x: 'x', y: 'y', size: 'score', label: 'label' }),
  ],
})
```

Without `getKey`, the node keys are `JSON.stringify([itemId, scoreId])` strings and no edge matches them.

Typing limit: `graph.update` accepts a definition of the same mark types or a subset of them. A `subset` of a collection and a live query with `select` have different row types, so a graph mounted with one does not accept the other in `update`: it does not compile. Different filters of the same collection share one row type and update freely. To switch between a collection view and a join view, mount a second graph (destroy the first), or give both definitions one explicit union type. Edges for a joined node set on an on-demand collection need a `subset` keyed by those node keys (`around(keys)` above); a `where` cannot read the live query result, so pass the keys you already know.

### Load rows on demand

A collection with `syncMode: 'on-demand'` loads only what its subscribers ask for. Through `subset` (or a live query over it) the `where` reaches the `loadSubset` function of its sync, and the rows appear as they arrive. When the graph lets go of the source (a new filter, a removed mark, `destroy`), TanStack DB calls `unloadSubset` with the same options, and the sync can delete rows no other subscription holds.

Load the edges around chosen nodes only:

```ts
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { subset } from '@bruno00o/graph/db'
import { type Collection, inArray, or } from '@tanstack/db'

type Item = { id: string; label: string }
type Link = { id: string; from: string; to: string }

declare const items: Collection<Item, string>
declare const links: Collection<Link, string>

const around = (keys: string[]) =>
  subset(links, (link) => or(inArray(link.from, keys), inArray(link.to, keys)))

export const define = (keys: string[]) =>
  defineGraph({
    marks: [edges(around(keys), { source: 'from', target: 'to' }), nodes(items, { label: 'label' })],
  })
```

- Pass a `subset`, never the on-demand collection itself: a subscription without `where` asks the collection for every row.
- The next source is subscribed before the previous one is released. A sync that counts, row by row, the requests that hold a row keeps the rows both sources need: do not delete a row on `unloadSubset` when another request still holds it.
- A live source has no "ready" signal: a live query over an on-demand collection that loads asynchronously can remove then re-add nodes while it loads.
- An edge whose other end is not loaded or is filtered out waits without being drawn.

### Write positions back with `persistPositions`

`persistPositions(graph, { collection })` listens to `positionchange` and writes `x` and `y` into the collection. It returns a function that stops listening and writes the last pending move at once.

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'
import { persistPositions } from '@bruno00o/graph/db'
import { createCollection, localOnlyCollectionOptions, throttleStrategy } from '@tanstack/db'

type Item = { id: string; label: string; x: number; y: number }

const items = createCollection(
  localOnlyCollectionOptions({ getKey: (item: Item) => item.id, initialData: [] }),
)

const definition = defineGraph({
  marks: [nodes(items, { x: 'x', y: 'y', label: 'label' })],
  states: { saving: { outline: 'var(--graph-accent)', outlineWidth: 3 } },
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Saved positions' })

const stop = persistPositions(graph, {
  collection: items,
  mutationFn: async ({ transaction }) => {
    await fetch('/positions', { method: 'POST', body: JSON.stringify(transaction.mutations) })
  },
  strategy: throttleStrategy({ wait: 250, leading: true, trailing: true }),
  pendingState: 'saving',
})

stop()
```

- What is written: drags, `positions.set` and the result of each layout run that ends. Moves that come from the collection itself do not emit `positionchange`, so nothing echoes back.
- Without `mutationFn`, rows are updated with `collection.update` at most every 100 ms (first and last move included), and the collection persists them through its own handlers (Electric, Query, local storage...).
- With `mutationFn`, the writes go through `createPacedMutations`: `x` and `y` are written optimistically and the strategy paces your function (`throttleStrategy` of 100 ms by default). A failed mutation rolls the optimistic write back and the node follows its data again.
- `pendingState` names a free state declared in the definition. It holds each node whose write is pending, from the move until the write is done or has failed. It throws when the state is not declared, and with a typed graph it only accepts the free state names.
- `mutationFn` receives `{ transaction }` of TanStack DB: `transaction.mutations` is `PendingMutation<Item>[]` (type exported by `@tanstack/db`). Annotate the parameter when you share one options object between graphs, and write `pendingState: 'saving' as const` for a shared constant.
- `collection` is the collection that holds the rows, whatever the graph draws from: a graph drawn from a join whose `getKey` returns the item key can still persist into the items collection, because node keys equal row keys.
- Only rows that exist are updated: a node with no row is skipped unless `create(nodeKey, point)` builds one.
- `x` and `y` name other fields of the row; `key` maps a node key to a row key when they differ.
- A layout result that is written becomes data: later layout runs leave those nodes in place, because positions read from rows win over layouts.

Positions that live in their own collection:

```ts
import type { GraphInstance } from '@bruno00o/graph'
import { persistPositions } from '@bruno00o/graph/db'
import type { Collection } from '@tanstack/db'

type Place = { id: string; node: string; x: number; y: number }

declare const graph: GraphInstance
declare const places: Collection<Place, string>

export const stop = persistPositions(graph, {
  collection: places,
  key: (nodeKey) => `place:${nodeKey}`,
  create: (nodeKey, point) => ({ id: `place:${nodeKey}`, node: String(nodeKey), ...point }),
})
```

Read them back with a live query that joins nodes and places, keyed by the node key (`getKey`).

In React, call it from an effect in a component under `<Graph>` (with `useGraph()`), and return the stop function:

```tsx
import { persistPositions } from '@bruno00o/graph/db'
import { useGraph } from '@bruno00o/graph/react'
import type { Collection } from '@tanstack/db'
import { useEffect } from 'react'

type Item = { id: string; x: number; y: number }

export function SharedPositions({ items }: { items: Collection<Item, string> }) {
  const graph = useGraph()
  useEffect(() => persistPositions(graph, { collection: items }), [graph, items])
  return null
}
```

## Common Mistakes

### HIGH A join without `getKey`

A live query with a join keys its rows by the pair of joined keys. Nodes then have keys like `["n1","n1"]`, and edges whose `source` is `'n1'` wait forever (`graph.count().pending` stays high, `issues()` stays empty). Give the live query `getKey: (row) => row.id`, and select the node key as `id`.

### HIGH Passing an on-demand collection as is

A collection with `syncMode: 'on-demand'` passed straight to `nodes()` or `edges()` subscribes without `where` and asks for every row, defeating the purpose. Pass `subset(collection, where)` so the filter reaches `loadSubset`.

### MEDIUM A new live query where a `subset` would do

Every change of a filter built as a live query collection hands out new row objects, so every node that stays is restyled (280 ms in the graph and 2.3 s in the collection at 500,000 rows, against 40 to 60 ms with `subset`). Use `subset` for one collection with a filter. Keep live queries for joins, `select` and ordering.

### MEDIUM Mutating a source or its definition in place

Changing the filter means building a new `subset` and passing a new definition to `graph.update`. Calling `subset` once and expecting the `where` to change does nothing. Row changes need no `update`; filter changes do.

### MEDIUM A `key` option or a wrong field on a live mark

A mark of a live source takes no `key`: the key is the one of the row's change. A field that is not on the row does not compile in `where` or in the mark options.

```ts expect-error=TS2769
import { nodes } from '@bruno00o/graph'
import { createCollection, localOnlyCollectionOptions } from '@tanstack/db'

type Item = { id: string; label: string }

const items = createCollection(
  localOnlyCollectionOptions({ getKey: (item: Item) => item.id, initialData: [] }),
)

nodes(items, { key: 'label', label: 'label' })
```

```ts expect-error=TS2551
import { subset } from '@bruno00o/graph/db'
import { createCollection, gte, localOnlyCollectionOptions } from '@tanstack/db'

type Item = { id: string; weight: number }

const items = createCollection(
  localOnlyCollectionOptions({ getKey: (item: Item) => item.id, initialData: [] }),
)

subset(items, (item) => gte(item.wieght, 3))
```

### MEDIUM `pendingState` that the definition does not declare

`persistPositions` throws at run time when `pendingState` is not a free state of the graph, and a typed graph refuses the name at compile time. Declare it under `states` in `defineGraph`; `selected`, `hovered` and `focused` are built in and not free.

### MEDIUM Expecting positions from rows to follow a layout

Rows with `x` and `y` that the marks read are data positions, so a layout never moves them. Persisting a layout result makes the nodes fixed from then on. To lay out again, clear the coordinates in the collection or leave `x` and `y` out of the mark.

### MEDIUM Forgetting to stop `persistPositions`

It returns a function that removes its listener and flushes the last write. Call it when the graph or its component goes away; in React, return it from the effect.

## Completion

The task is done when:

- collections go into marks as is, with no `key` option, and edge ends hold the collection keys;
- filters use `subset` and are replaced through `graph.update` with a new definition; on-demand collections are only reached through `subset`;
- every join has a `getKey` that returns the node key;
- `graph.count().pending` is 0 once the edges' nodes are loaded, and `graph.issues()` is empty or expected;
- positions persisted by `persistPositions` have their stop function called on cleanup, and `pendingState` is a declared free state;
- `tsc` accepts the code.

## References

Every page has a Markdown version: add `.md` to its URL.

- [TanStack DB guide](https://bruno00o.github.io/graph/docs/tanstack-db), [Data and live sources](https://bruno00o.github.io/graph/docs/data), [subset](https://bruno00o.github.io/graph/docs/api/subset), [persistPositions](https://bruno00o.github.io/graph/docs/api/persist-positions)
- Examples: [a collection as the source](https://bruno00o.github.io/graph/examples/collection-source), [live query with a join](https://bruno00o.github.io/graph/examples/live-query), [filter at scale](https://bruno00o.github.io/graph/examples/filter-at-scale), [collaboration](https://bruno00o.github.io/graph/examples/collaboration), [optimistic position writes](https://bruno00o.github.io/graph/examples/optimistic-positions), [a live source of your own](https://bruno00o.github.io/graph/examples/live-source)
