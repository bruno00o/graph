---
name: cypher
description: >
  Use when drawing the result of a Cypher query from a graph database driver, or
  its JSON copy sent by a backend, with @bruno00o/graph: turning records, nodes,
  relationships and paths into nodes and edges, typing node and relationship
  properties, keeping 64-bit integers, dates, durations and spatial points
  usable, handling relationships whose end node was not returned, merging
  several queries, and exploring a database one neighborhood at a time with a
  query per expanded node.
metadata:
  purpose: >
    The @bruno00o/graph/cypher entry point: cypherGraph, which reads the values
    of a Cypher result into deduplicated nodes and edges for the marks, and how
    to combine it with createExploration, with the mistakes that lose digits,
    leave edges waiting or break typing.
  type: composition
  library: '@bruno00o/graph'
sources:
  - src/cypher/index.ts
  - src/cypher/values.ts
  - docs/content/docs/(guide)/cypher.mdx
  - docs/content/docs/api/cypher-graph.mdx
requires:
  - core
---

# Draw Cypher results

Load the core skill first (`intent load @bruno00o/graph#core`): the result becomes two arrays that feed `nodes()` and `edges()`, with keys and updates as in core. This skill covers `cypherGraph` from `@bruno00o/graph/cypher`.

`cypherGraph` runs no query, imports no driver and has no dependency. Your code queries the database (the official JavaScript driver, or your own backend) and passes the result in. It reads values by shape, so it accepts the objects of the official `neo4j-driver` (`QueryResult`, `EagerResult`, `Record`, `Node`, `Relationship`, `Path`) and the same data parsed from JSON.

## Setup

```ts no-check
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { cypherGraph } from '@bruno00o/graph/cypher'
import neo4j from 'neo4j-driver'

const driver = neo4j.driver(url, neo4j.auth.basic(user, password))
const result = await driver.executeQuery('MATCH (a)-[r:KNOWS]->(b) RETURN a, r, b LIMIT 200')
const { nodes: items, edges: links } = cypherGraph(result)
```

That fragment is `no-check` because `neo4j-driver` is not a dependency of this package; everything below compiles against a structural result. Once you hold `items` and `links`:

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { cypherGraph, type CypherInput } from '@bruno00o/graph/cypher'

declare const result: CypherInput

const { nodes: items, edges: links } = cypherGraph<{ name: string }, { since: number }>(result)

const definition = defineGraph({
  marks: [
    edges(links, { source: 'source', target: 'target', color: 'type' }),
    nodes(items, {
      color: (node) => node.labels[0],
      label: (node) => node.properties.name,
    }),
  ],
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Query result' })
console.log(graph.count())
```

- Nodes: `{ id, labels, properties }`, where `id` is the `elementId`. Nodes need no `key` option: `id` is the default key.
- Edges: `{ id, type, source, target, properties }`, where `source` and `target` are the `elementId` of the start and end nodes. The edge mark needs `source: 'source'` and `target: 'target'`.
- Node `id` and edge `id` are the database's `elementId` strings, never a property you stored called `id`.

## Core Patterns

### What the adapter reads

`cypherGraph(input, options?)` takes a driver result, a row, a list of results or rows, or one node, relationship or path, and walks the values: a node, relationship or path is found wherever it sits, in a column, a list or a map, at any depth. Anything else (numbers, text, dates, points) is ignored unless it holds one of those.

- Elements are deduplicated by `elementId`, the first occurrence wins. A node returned in every row appears once. Pass an array of results to merge several queries: `cypherGraph([first, second])`.
- Nodes and edges keep the order they first appear in. A path contributes its nodes and relationships in path order.
- `elementId` is read from `elementId` or, on old servers, from `identity` (and `start` / `end` stand in for `startNodeElementId` / `endNodeElementId`).
- Type the properties with the type arguments: `cypherGraph<{ name: string }, { since: number }>(result)`. It is an assertion, like the type of `JSON.parse`: the database does not check it. Without them, `properties` is `Readonly<Record<string, unknown>>` and a channel that needs a string must convert (`String(node.properties.name)`).

### Send results from a backend

Credentials stay on the server. Either send the driver's values as JSON and give the parsed body to `cypherGraph` in the browser, or convert on the server and send `{ nodes, edges }`, which is plain JSON already.

```ts
import { cypherGraph } from '@bruno00o/graph/cypher'

export async function load(id: string) {
  const response = await fetch('/api/graph', { method: 'POST', body: JSON.stringify({ id }) })
  return cypherGraph<{ name: string }>(await response.json())
}
```

`JSON.stringify(result.records)` is enough on the server: integers serialize as `{ low, high }` pairs and the adapter reads them back. `JSON.stringify` cannot write a `bigint`, so leave the driver's `useBigInt` off in that case.

### Integers, dates, durations and points

Property values are converted once, in nodes and relationships alike, inside lists and maps too.

- **Integers.** Cypher integers have 64 bits, and the driver returns `Integer` objects (or `bigint` with `useBigInt`). By default (`integers: 'safe'`) a value becomes a `number` when that is exact, and a decimal string beyond `Number.MAX_SAFE_INTEGER`, so no id or count loses digits. Choose with `integers`: `'number'` (always a number, large values lose precision), `'string'`, `'bigint'`, `'keep'` (leave the driver value), or a function `(value: bigint) => unknown`. Values that already are JavaScript numbers (Cypher floats) never change.
- **Dates and times.** `date`, `time`, `localtime`, `localdatetime` and `datetime` become ISO 8601 strings, such as `'2024-03-09'` or `'2024-03-09T07:05:03+01:00[Europe/Paris]'`, the same text the driver prints. Use `new Date(text)` where you need one: a `Date` object is not produced.
- **Durations.** A duration has no single text, so it becomes `{ months, days, seconds, nanoseconds }`, all numbers.
- **Points.** A spatial point becomes `{ srid, x, y }`, with `z` for 3D. For SRID 4326 (WGS 84), `x` is the longitude and `y` the latitude.

```ts
import { cypherGraph, type CypherInput } from '@bruno00o/graph/cypher'
import { nodes } from '@bruno00o/graph'

type Place = {
  name: string
  founded: string
  population: number | string
  location: { srid: number; x: number; y: number }
}

declare const result: CypherInput

const { nodes: items } = cypherGraph<Place>(result, { integers: 'safe' })

export const places = nodes(items, {
  label: (node) => node.properties.name,
  longitude: (node) => node.properties.location.x,
  latitude: (node) => node.properties.location.y,
})
```

Under `'safe'` every integer property is typed `number | string` (a number when exact, a decimal string beyond 2^53). A numeric channel such as `size` needs a conversion (`Number(node.properties.population)`), or `integers: 'number'` when you know the values are small. To get a `Date`, convert in your own step: `new Date(node.properties.founded)` inside the `queryFn` or when mapping the nodes, since the adapter only produces ISO strings. Passing `{ integers: 'safe' }` is redundant: it is the default.

`longitude` and `latitude` place nodes on a map (see the map skill); they are ignored by the plain graph view. A map that has exactly the fields of a date, a duration, a point or a 64-bit integer (a plain JSON copy of a driver value, or a map of your own) is read as that value: this is the one case where a map of your own can be mistaken for a value. `integers: 'keep'` leaves integer pairs alone.

### Relationships whose end node is missing

A relationship stays in `edges` even when an end node is not in the result, as with `RETURN r` alone. The graph keeps it pending until the node arrives (`graph.count().pending`), then draws it. Query the nodes with their relationships, or merge a later result into the next `update`.

### Explore a database one neighborhood at a time

A node and its relationships make a neighborhood, which is what `createExploration` needs (load the tanstack-query skill for its details). `cypherGraph` already returns `{ nodes, edges }`, so a neighborhood query is a Cypher query converted. The key of an expanded node is its `elementId`, the same as the `id` the exploration reads by default.

```ts
import { defineGraph, edges, type Key, nodes } from '@bruno00o/graph'
import {
  type CypherEdge,
  type CypherInput,
  type CypherNode,
  cypherGraph,
} from '@bruno00o/graph/cypher'
import { createExploration } from '@bruno00o/graph/query'
import { QueryClient } from '@tanstack/query-core'

type Person = { name: string; rank: number }
type Link = { weight: number }

declare function run(statement: string, parameters: Record<string, unknown>): Promise<CypherInput>

const neighbors = (key: Key) => ({
  queryKey: ['neighbors', key],
  queryFn: async () => {
    const result = await run(
      'MATCH (n) WHERE elementId(n) = $id OPTIONAL MATCH (n)-[r]-(m) RETURN n, r, m',
      { id: key },
    )
    return cypherGraph<Person, Link>(result)
  },
})

const exploration = createExploration<CypherNode<Person>, CypherEdge<Link>>(new QueryClient(), {
  roots: ['4:db:0'],
  neighbors,
})

export const definition = defineGraph({
  marks: [
    edges(exploration.edges, { source: 'source', target: 'target', color: 'type' }),
    nodes(exploration.nodes, { label: (node) => node.properties.name }),
  ],
})
```

- To show a first query (`MATCH ... LIMIT 300`) and explore from it, use a sentinel root key such as `'overview'`, which does not have to be a node: `neighbors` runs the overview query for it and the neighborhood query for any other key. Its nodes and edges join the same sources, deduplicated by key.
- `OPTIONAL MATCH` makes the query return the node even with no relationship, so a root gets its data.
- Pass the node and edge types as type arguments (as above): a plain query-options object does not let TypeScript infer them.
- Expanding a node twice, or two nodes with a neighbor in common, never duplicates it: the graph deduplicates by key.
- From a page, `run` should call your backend, which keeps credentials out of the browser (the previous section).

## Databases

The adapter reads values of the official `neo4j-driver` (checked with 6.3.0). Other databases that speak Bolt work through the same driver. Checked against running servers: Neo4j 5.26 (rows, paths, nested values, integers beyond 2^53, dates, times, durations, points, and the JSON copy of the same result) and Memgraph 3.14 (the same, without `time()`, which it lacks; its `elementId` is the numeric id as text). Neptune with openCypher over HTTPS, Apache AGE and FalkorDB return other formats and have not been checked: do not promise they work.

## Common Mistakes

### HIGH Using a stored `id` property as the key

Nodes are keyed by the `elementId` the database assigns, in `node.id`. A property called `id` sits in `node.properties.id` and is not the key. Edges point at `elementId`s, so mapping the node key to a property makes every edge wait for a node that never comes.

### HIGH Losing digits with `integers: 'number'`

64-bit ids and counts above `Number.MAX_SAFE_INTEGER` lose precision silently with `'number'`. Keep the default `'safe'` (number when exact, decimal string otherwise) and treat such properties as `number | string`, or choose `'string'` or `'bigint'` on purpose. With `'bigint'` the values cannot go through `JSON.stringify`.

### MEDIUM Reading `properties` without a type

Properties are `unknown` by default, so a channel that needs a string or a number does not compile. Pass the property types to `cypherGraph<N, E>` or convert (`String(...)`, `Number(...)`).

```ts expect-error=TS2769
import { nodes } from '@bruno00o/graph'
import { cypherGraph, type CypherInput } from '@bruno00o/graph/cypher'

declare const result: CypherInput

const { nodes: items } = cypherGraph(result)

nodes(items, { label: (node) => node.properties.name })
```

### MEDIUM Forgetting `source` and `target` on the edge mark

The edges need `source: 'source'` and `target: 'target'`, even though the fields are named that way. The type refuses an edge mark without them.

```ts expect-error=TS2769
import { edges } from '@bruno00o/graph'
import { cypherGraph, type CypherInput } from '@bruno00o/graph/cypher'

declare const result: CypherInput

const { edges: links } = cypherGraph(result)

edges(links, { color: 'type' })
```

### MEDIUM Edges that wait because the query returned only relationships

`RETURN r` gives relationships without their end nodes: the edges are kept but wait (`graph.count().pending`). Return the end nodes too (`RETURN a, r, b`).

### MEDIUM Not expecting a map of your own to be read as a value

A property map with exactly the fields of a date, duration, point or integer pair is converted. Rename the fields of such a map, or pass `integers: 'keep'` for integer pairs.

### MEDIUM Running the query in the browser with credentials

Database credentials in a page are public. Query on a backend and send the result as JSON, or `{ nodes, edges }` after converting on the server.

### MEDIUM Letting TypeScript infer the types of an exploration

With a plain `{ queryKey, queryFn }`, `createExploration` gives nodes the type `{ readonly id: Key }`. Write `createExploration<CypherNode<Person>, CypherEdge<Link>>(...)`.

## Completion

The task is done when:

- the query returns the nodes with their relationships (`RETURN a, r, b`, or `OPTIONAL MATCH` for neighborhoods);
- `cypherGraph` receives the result (or its parsed JSON) with property types, and the marks read `id`, `source` and `target`;
- integers use the default `'safe'` unless you chose another mode on purpose;
- `graph.count().pending` is 0, or the waiting edges are expected;
- queries run on a backend when they need credentials;
- `tsc` accepts the code.

## References

Every page has a Markdown version: add `.md` to its URL.

- [Cypher guide](https://bruno00o.github.io/graph/docs/cypher), [cypherGraph](https://bruno00o.github.io/graph/docs/api/cypher-graph), [TanStack Query](https://bruno00o.github.io/graph/docs/tanstack-query)
- Example: [Cypher results](https://bruno00o.github.io/graph/examples/cypher-results)
