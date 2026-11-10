---
name: multilayer
description: >
  Use when several kinds of links join the same @bruno00o/graph nodes and each
  kind is a layer: putting marks in layers with the layer option, showing and
  hiding layers from code, a legend or React state, drawing the edges of each
  layer in their own band, declaring which edges carry other edges with
  supportedBy, walking carriers and carried edges with graph.support or
  createSupportFinder, lighting the support of a selection, and drilling down
  from one layer to the next.
metadata:
  purpose: >
    Layers, bands, support and drill down: layer on node and edge marks,
    graph.layers and controlled hidden layers, supportedBy and the support
    walks, the support states of defineGraph, and the hide-state pattern for
    opening edges one level at a time.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/support.ts
  - src/types.ts
  - src/host/graph-instance.ts
  - docs/content/docs/(guide)/multilayer.mdx
  - docs/content/docs/api/support.mdx
requires:
  - core
---

# Layers and support

Load the core skill first (`intent load @bruno00o/graph#core`). A layer is a name shared by any number of marks, node marks included. Marks without a `layer` belong to no layer and always show. Two features sit on layers: hiding and showing them at run time, and `supportedBy`, which says that an edge of one layer is carried by a path of edges of another (a route runs along paths, a path along segments).

## Setup

Give each kind of link its own edge mark and a `layer`. Declare `supportedBy` on the edges that are carried: a field or function that returns the key, or the list of keys, of the edges that carry the edge, in the order of the path they form.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Place = { id: string; name: string }
type Segment = { id: string; from: string; to: string }
type Path = { id: string; from: string; to: string; over: string[] }
type Route = { id: string; from: string; to: string; over: string[]; name: string }

const places: Place[] = []
const segments: Segment[] = []
const paths: Path[] = []
const routes: Route[] = []

const definition = defineGraph({
  marks: [
    edges(segments, { source: 'from', target: 'to', layer: 'segments' }),
    edges(paths, {
      source: 'from',
      target: 'to',
      layer: 'paths',
      supportedBy: 'over',
      stroke: 'var(--graph-cat-1)',
    }),
    edges(routes, {
      source: 'from',
      target: 'to',
      layer: 'routes',
      supportedBy: 'over',
      stroke: 'var(--graph-cat-2)',
      dash: 'dashed',
    }),
    nodes(places, { label: 'name' }),
  ],
})
const graph = mountGraph(document.body, {
  definition,
  ariaLabel: 'Layers',
  initialHiddenLayers: ['routes'],
})
```

Result: three edge layers over the same nodes, `routes` hidden at mount. Layer names come from the marks: with literal names TypeScript knows them, and `graph.layers` refuses a name no mark gives. At most 128 node marks and 128 edge marks can join a layer, and a name must be a non-empty string, or `defineGraph` throws.

## Core Patterns

### Show and hide layers

```ts
import type { GraphInstance } from '@bruno00o/graph'

export function toggleLayers(graph: GraphInstance) {
  console.log(graph.layers.names(), graph.layers.hidden(), graph.layers.isHidden('routes'))
  graph.layers.hide(['routes'])
  graph.layers.toggle('paths')
  graph.layers.show()
  graph.layers.set(['segments'])
  return graph.on('layerchange', ({ hidden }) => console.log(hidden))
}
```

- `names` lists layers in the order of the first mark of each; `hidden` the hidden ones. `hide` and `show` without a list act on every layer. A hidden name that no mark gives yet applies when a mark gives it.
- Each change emits `layerchange` (`{ hidden }`) and updates `hiddenLayers` in the store: `graph.store.get().hiddenLayers`.
- The legend has a `layers` section with one toggle per layer, through `graph.layers` (`layerText` customizes its text; tools skill).
- Toggling costs about one frame however large the layer: the graph keeps one mask of hidden marks and the GPU tests it. No data is read.

### Control the hidden layers from state

Pass `hiddenLayers` at mount to own them: `graph.layers` and the legend then call `onLayerChange`, each request starting from the last one not answered yet, and only `update({ hiddenLayers })` changes what shows. The mode is fixed at mount; initialize the state before the first render. In React, pass `hiddenLayers` and `onLayerChange` to `<Graph>` (react skill).

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Place = { id: string }
type Segment = { id: string; from: string; to: string }
const places: Place[] = []
const segments: Segment[] = []

const definition = defineGraph({
  marks: [
    edges(segments, { source: 'from', target: 'to', layer: 'segments' }),
    nodes(places, { layer: 'places' }),
  ],
})

let hidden: ('segments' | 'places')[] = []
const graph = mountGraph(document.body, {
  definition,
  ariaLabel: 'Layers',
  hiddenLayers: hidden,
  onLayerChange: (event) => {
    hidden = [...event.hidden]
    graph.update({ hiddenLayers: hidden })
  },
})
```

### What a hidden layer is

Hiding a layer hides its nodes, its edges and the edges of other layers that end on its nodes (a hidden node layer hides all its edges, whatever their layer). Hidden elements are absent like elements out of their zoom range: not drawn, labeled, picked (hover, click and lasso pass through, keys skip them), nor exported; the legend counts, the minimap draws and hulls wrap only shown elements; `graph.paths` with `visible: true` walks shown elements only. A hovered or focused element that hides loses hover or focus.

A hidden element stays in the data, the selection and states. Layouts still place it and `view.fit` still frames it, so nothing moves when a layer shows or hides. To leave a layer out of the data, filter its array or leave its mark out.

### Bands between the same nodes

Edges between the same two nodes bend apart (parallel edges). When they come from marks of different layers they gather in one band per layer, in the order of the marks, with a gap between bands, so every pair of nodes shows its layers in the same order. Edges of marks without a layer form a band of their own. A pair whose edges share one layer is drawn as before. A band keeps its place when another layer hides. Merged edges (`merge`, folded groups) never mix layers: an aggregated edge takes the layer of its mark.

### Walk the support

```ts
import type { GraphInstance } from '@bruno00o/graph'

export function trace(graph: GraphInstance) {
  const below = graph.support.carriers('route-7')
  const direct = graph.support.carriers('route-7', { maxDepth: 1 })
  const above = graph.support.carried('segment-12')
  console.log(below.edges, below.depths, below.nodes, direct.edges.length, above.edges.length)
  graph.states.set('trace', below)
}
```

- `carriers(key)` goes down: the edges that carry the edge, then the edges that carry those, down to edges nothing carries. `carried(key)` goes up: the edges the edge carries, then those they carry.
- Each walk returns `{ edges, depths, nodes }`: edge keys by depth then in path order, `depths` an array parallel to `edges` (`depths[i]` is the depth of `edges[i]`, from 1), and the keys of their end nodes, each once. The shape fits `graph.states.set(state, walk)` directly (declare `trace` as a free state).
- `maxDepth: 1` keeps the direct carriers or carried edges; it must be a number of 0 or more or the walk throws a `RangeError`. Breadth first, each edge once at its first depth; a cycle of support stops where it comes back, and the start edge is never listed. Keys that name no edge are skipped; an unknown start key gives an empty walk. Walks read data, not the screen: hidden edges are walked too.
- A key in `supportedBy` that names no edge appears in `graph.issues()` as `missing-carrier`; the edge waits for it. The first `carried` call indexes support upward (8 ms at 100,000 edges), later calls and every `carriers` call cost under 0.01 ms.
- `createSupportFinder({ marks })` (imported from the main entry, `@bruno00o/graph`; `marks` is an array of `nodes()` and `edges()` results, or a definition) runs the same walks on marks alone, without mounting a graph (a server, a worker, tests). It subscribes to live sources at once and applies their changes at the next walk; call `destroy()` when done, after which walks return an empty frozen result.

A helper that takes a graph types it `GraphInstance`, exported from the main entry: it accepts the instance of any definition. To keep layer and state names checked in a helper, type the parameter `ReturnType<typeof mountMyGraph>`.

### Light the support of a selection

`support` in `defineGraph` names two free states. When the selection holds edges, the graph gives the first to everything that carries them and the second to everything they carry, ends included, and keeps them current as the selection and the data change.

```ts
import { defineGraph, edges, nodes } from '@bruno00o/graph'

type Place = { id: string }
type Hop = { id: string; from: string; to: string; over: string[] }
const places: Place[] = []
const hops: Hop[] = []

const definition = defineGraph({
  marks: [
    edges(hops, { source: 'from', target: 'to', supportedBy: 'over' }),
    nodes(places),
  ],
  states: {
    carrier: { stroke: 'var(--graph-accent)', strokeWidth: 3, raise: true },
    carried: { stroke: 'var(--graph-cat-4)', strokeWidth: 3, raise: true },
  },
  support: { carriers: 'carrier', carried: 'carried' },
})
```

The two names must be free states declared in `states` (`defineGraph` throws otherwise). The graph owns them: it replaces their members at each selection change, so never fill them yourself. Leave one out, or pass `null`, to light one direction only. With `raise: true` the lit edges draw above the other marks.

### Drill down

An edge of the top layer often has data of its own (a name, a capacity). It is not computed from the edges below: it declares them with `supportedBy`. Show the top layer alone and open one edge at a time. Keep every edge in the graph and close the lower ones with a `hide: true` state: a hidden edge stays in the data, so `graph.support` still walks it.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import type { Key } from '@bruno00o/graph'

type Place = { id: string; x: number; y: number }
type Segment = { id: string; from: string; to: string }
type Path = { id: string; from: string; to: string; over: string[] }
type Route = { id: string; from: string; to: string; over: string[]; name: string }

const places: Place[] = []
const segments: Segment[] = []
const paths: Path[] = []
const routes: Route[] = []

const definition = defineGraph({
  marks: [
    edges(segments, { source: 'from', target: 'to', layer: 'segments' }),
    edges(paths, { source: 'from', target: 'to', layer: 'paths', supportedBy: 'over' }),
    edges(routes, { source: 'from', target: 'to', layer: 'routes', supportedBy: 'over', label: 'name' }),
    nodes(places, { x: 'x', y: 'y' }),
  ],
  states: {
    closed: { hide: true },
    open: { stroke: 'var(--graph-accent)', raise: true },
  },
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Drill down' })

const lower = [...paths, ...segments].map((edge) => edge.id)
const opened = new Set<Key>()

function reveal() {
  const revealed = new Set<Key>()
  for (const key of opened) {
    for (const carrier of graph.support.carriers(key, { maxDepth: 1 }).edges) revealed.add(carrier)
  }
  graph.states.set('closed', { edges: lower.filter((key) => !revealed.has(key)) })
  graph.states.set('open', { edges: [...opened] })
}

reveal()
graph.on('doubleclick', ({ target }) => {
  if (target?.kind !== 'edge') return
  if (opened.delete(target.key)) {
    for (const deeper of graph.support.carriers(target.key).edges) opened.delete(deeper)
  } else {
    opened.add(target.key)
  }
  reveal()
})
```

- A `hide` state works whatever the layers do: layers and states combine, an element shows only when neither hides it. A drill down usually shows every layer and lets states do the opening.
- Open with `carriers(key, { maxDepth: 1 })` (direct carriers only); close with `carriers(key)` without `maxDepth` (everything below), so closing an edge also closes what was opened under it.
- Write the states only on open, close and reset; show a hover status through your own UI, not through these states.
- A double-click on an edge has no default effect and the view does not zoom: `doubleclick` arrives after the two clicks that select the edge, and only a double-click on a group folds it.
- The alternative, giving the graph only the visible edges and finding carriers with `createSupportFinder` on the full data, sends new marks at every step and a hidden edge leaves the selection, the states and the counts.

## Common Mistakes

### HIGH Hiding a layer by filtering data you still want to walk

`graph.support` reads the data in the graph. If you remove the lower edges from the marks to hide them, the walks cannot find them (and `missing-carrier` is reported). Keep every edge in the graph and hide with a `layer` toggle or a `hide: true` state.

### HIGH Filling the support states yourself

The two states named by `support` are owned by the graph: it replaces their members at each selection change. A `graph.states.set('carrier', ...)` of your own is overwritten at the next change. Use another free state for your own highlights, such as `trace`.

### HIGH Declaring the support states in `support` but not in `states`

`support: { carriers: 'carrier' }` needs `carrier` declared in `states`, and it must not be `selected`, `hovered` or `focused`. Otherwise `defineGraph` throws a `TypeError` (and TypeScript refuses an unknown name).

```ts expect-error=TS2322
import { defineGraph, edges, nodes } from '@bruno00o/graph'

type Place = { id: string }
type Hop = { id: string; from: string; to: string; over: string[] }
const places: Place[] = []
const hops: Hop[] = []

defineGraph({
  marks: [edges(hops, { source: 'from', target: 'to', supportedBy: 'over' }), nodes(places)],
  states: { lit: { stroke: 'var(--graph-accent)' } },
  support: { carriers: 'carrier' },
})
```

### MEDIUM Hiding a node layer and expecting its edges to stay

A hidden node layer hides the edges that end on its nodes, from every layer. To keep an edge layer visible, keep the layers of the nodes it ends on visible too, or give the nodes no layer.

### MEDIUM A layer name no mark gives

With literal layer names, `graph.layers` refuses a name no mark gives:

```ts expect-error=TS2345
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Place = { id: string }
type Segment = { id: string; from: string; to: string }
const places: Place[] = []
const segments: Segment[] = []

const definition = defineGraph({
  marks: [edges(segments, { source: 'from', target: 'to', layer: 'segments' }), nodes(places)],
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Layers' })

graph.layers.hide(['nope'])
```

With the item type written on the call (`edges<Segment>(segments, { layer: 'segments' })`) the inference of `layer` and `name` is lost: names become `string`, every string passes, and a typo hides nothing. Type the arrays and let the call infer.

### MEDIUM Expecting toggling a layer to move the drawing

Layouts place hidden elements and `view.fit` frames them, and a band keeps its place when another layer hides. If the drawing should close the gap, filter the data. A hidden layer is also not counted in `graph.count().shown`.

### MEDIUM Walking support on a key typed differently

`supportedBy` takes edge keys. `1` and `'1'` are different keys: a carrier that does not match is reported as `missing-carrier` and skipped, so a walk looks shorter than expected. Check `graph.issues()`.

### MEDIUM Switching to a controlled `hiddenLayers` after mount

Whether layers are controlled is decided at mount by `hiddenLayers`. A prop that starts `undefined` and is set later does not take control. Pass the initial array, or `initialHiddenLayers` for an uncontrolled start.

### MEDIUM Forgetting `destroy` on a support finder

`createSupportFinder` subscribes to live sources as soon as it is created. Call `destroy()` when the page or request ends.

## Completion

The task is done when:

- every layered mark has a non-empty literal `layer`, and layer names type-check against `graph.layers`;
- layers toggle from code, the legend or controlled state, with the hidden set initialized before the first render when controlled;
- `graph.issues()` has no `missing-carrier` and support walks return the expected edges;
- support states named in `support` are declared free states that your code never fills;
- a drill down closes lower edges with a `hide` state and opens them with `maxDepth: 1`;
- `tsc` passes with no cast on layer names or walks.

## References

Every page has a Markdown version: add `.md` to its URL. The site documents the latest release.

- Guides: [Multilayer graphs](https://bruno00o.github.io/graph/docs/multilayer), [Transformations](https://bruno00o.github.io/graph/docs/transformations#hide-without-losing-state), [Paths](https://bruno00o.github.io/graph/docs/paths)
- API: [support](https://bruno00o.github.io/graph/docs/api/support), [edges](https://bruno00o.github.io/graph/docs/api/edges#layers-and-support), [GraphInstance](https://bruno00o.github.io/graph/docs/api/graph-instance)
- Examples: [multilayer](https://bruno00o.github.io/graph/examples/multilayer), [layers from React state](https://bruno00o.github.io/graph/examples/layer-toggles)
