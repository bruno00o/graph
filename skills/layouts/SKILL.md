---
name: layouts
description: >
  Use when placing @bruno00o/graph nodes that have no coordinates: choosing and
  adding a force layout, layers for a hierarchy or flow, a grid, rings, a radial
  tree or a geographic layout, running or stopping a layout from code, following
  its progress, framing the result, keeping dragged or data-given positions,
  saving and restoring positions, writing a custom layout, or finding why nodes
  do not move or pile up.
metadata:
  purpose: >
    Where nodes go: the five ready-made layouts and when to pick each, the
    definition and run-time ways to start a layout, which nodes a layout may
    move, positions from data and from code, and the mistakes that leave nodes
    on a spiral or still.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/layouts/index.ts
  - src/layouts/force/index.ts
  - src/layouts/layers/index.ts
  - src/layouts/grid.ts
  - src/layouts/rings.ts
  - src/layouts/radial.ts
  - src/layouts/geo.ts
  - src/types.ts
  - src/host/graph-instance.ts
  - src/host/layout-session.ts
  - src/host/data-status.ts
  - docs/content/docs/(guide)/layout.mdx
  - docs/content/docs/(guide)/positions.mdx
  - docs/content/docs/api/force.mdx
  - docs/content/docs/api/layouts.mdx
requires:
  - core
---

# Place nodes with a layout

Load the core skill first (`intent load @bruno00o/graph#core`): data, marks and the instance are the same. Without a layout, nodes with no `x` and `y` start in a compact spiral, or next to their placed neighbors; that is a starting point, not a drawing. A layout gives them a place. It is an object passed as `layout` to `defineGraph`, or to `graph.layout.run` for one run.

## Choose a layout

| Need                                                   | Layout   | Import                           |
| ------------------------------------------------------ | -------- | -------------------------------- |
| General network, clusters from the links               | `force`  | `@bruno00o/graph/layouts/force`  |
| Directed flow, hierarchy, DAG, dependencies            | `layers` | `@bruno00o/graph/layouts`        |
| Rows of equal places, sorted by a field                | `grid`   | `@bruno00o/graph/layouts`        |
| One hub in the middle, the rest in rings by rank       | `rings`  | `@bruno00o/graph/layouts`        |
| Tree or distance from a root, drawn in rings           | `radial` | `@bruno00o/graph/layouts`        |
| Places with longitude and latitude, no basemap         | `geo`    | `@bruno00o/graph/layouts`        |

`force` lives in its own entry point so that a graph without it carries none of its code; the others share `@bruno00o/graph/layouts`. `force` animates while it settles, in a Web Worker, and handles hundreds of thousands of nodes. The other four report their result at once, on the main thread, in milliseconds for thousands of nodes, and nodes glide to it.

## Setup

Pass the layout to `defineGraph`. It runs on the first batch of nodes.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'

type Item = { id: string; label: string; group: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const links: Link[] = []

const definition = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to' }),
    nodes(items, { color: 'group', label: 'label' }),
  ],
  layout: force({ edgeLength: 60 }),
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })
```

Result: nodes settle over about 300 steps, the view keeps the graph framed while it settles (until the user pans or zooms), and the page stays responsive. Options of `force` (defaults): `edgeLength` 40, `repulsion` 80, `gravity` 0.04, `spacing` 6, `cohesion` 0.5, `groupSpacing` 16, `steps` 300, `engine` `'auto'`, `multilevel` `'auto'`. A negative or non-finite value falls back to its default. Full table: [force API](https://bruno00o.github.io/graph/docs/api/force).

## Core Patterns

### Layers for a flow

```ts
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { layers } from '@bruno00o/graph/layouts'

type Step = { id: string; title: string }
type Dependency = { id: string; before: string; after: string }

const steps: Step[] = []
const dependencies: Dependency[] = []

const definition = defineGraph({
  marks: [
    edges(dependencies, { source: 'before', target: 'after', arrow: 'target' }),
    nodes(steps, { label: 'title' }),
  ],
  layout: layers({ direction: 'right', root: 'start', layerSpacing: 80, nodeSpacing: 16 }),
})
```

- Every edge points from one layer to a later one, in `direction` (`'down'` default, `'up'`, `'right'`, `'left'`; `'down'` puts the first layer at the top).
- `root` (a key or an array of keys) forces nodes onto the first layer; edges into them are turned around. Edges that close a cycle are turned around too, as few as possible, and still drawn.
- `layerSpacing` and `nodeSpacing` are gaps between node borders, in world units. Defaults: twice the largest diameter (at least diameter plus 24) between layers, the largest diameter (at least 8) inside a layer.
- Separate components and lone nodes sit side by side, the largest first. The same graph always gives the same result.

### Grid, rings, radial

```ts
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { grid, radial, rings } from '@bruno00o/graph/layouts'

type Item = { id: string; label: string; group: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const links: Link[] = []

const marks = [
  edges(links, { source: 'from', target: 'to' }),
  nodes(items, { label: 'label' }),
]

const sorted = defineGraph({
  marks,
  layout: grid<Item>({ columns: 6, order: (a, b) => a.group.localeCompare(b.group) }),
})
const ranked = defineGraph({ marks, layout: rings({ center: 'hub', order: 'degree' }) })
const tree = defineGraph({ marks, layout: radial({ root: 'hub', spacing: 32 }) })
```

- `grid`: rows from the top left, as many columns as rows unless `columns` says otherwise. `order` is `'degree'` or a comparator of two items.
- `rings`: the first node of `order` in the middle (default `'degree'`, busiest first, or `center`), then rings outward.
- `radial`: a breadth-first walk from `root` (a key, an array, or the busiest node), each node on the ring of its distance, each branch with a slice of the circle in proportion to its size. Unreachable nodes go on an outer ring.
- `spacing` is a gap between the borders of the largest nodes. Default: the largest diameter, at least 24. `0` is allowed.
- `order` takes items typed by the node marks. Inside `defineGraph` the types of `marks` do not reach the layout: write `grid<Item>(...)`. `graph.layout.run` infers them.

### Geography without a basemap

```ts
import { defineGraph, nodes } from '@bruno00o/graph'
import { geo } from '@bruno00o/graph/layouts'

type Place = { id: string; name: string; lng: number; lat: number }
const places: Place[] = []

const definition = defineGraph({
  marks: [nodes(places, { label: 'name' })],
  layout: geo<Place>({ longitude: 'lng', latitude: 'lat', center: { longitude: 2.35, latitude: 48.86 }, scale: 4096 }),
})
```

`geo` places nodes with the Web Mercator world of a map (512 units wide), then moves apart the ones that would overlap, so each is readable and clickable: a node whose spot is free stays exactly there. `longitude` and `latitude` default to the fields of those names. Without `scale` and `center`, both follow the data, so new nodes can move the others: give both to keep positions steady. The `longitude` and `latitude` channels of `nodes()` pin nodes to their place and never separate them; use `geo` when overlap matters. A node without coordinates goes next to its placed neighbors.

### Run a layout from code

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { grid, rings } from '@bruno00o/graph/layouts'

type Item = { id: string; label: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const links: Link[] = []

const definition = defineGraph({
  marks: [edges(links, { source: 'from', target: 'to' }), nodes(items, { label: 'label' })],
  layout: force(),
  view: { autoFit: 'layouts' },
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })

const completed = await graph.layout.run()
await graph.layout.run(undefined, { keys: graph.selection.get().nodes })
await graph.layout.run(force({ edgeLength: 100 }), { fit: true })
await graph.layout.run(grid(), { fit: { padding: 48 }, duration: 600 })
await graph.layout.run(rings(), { duration: 0 })
graph.layout.stop()
console.log(completed)
```

- `run()` lays out every free node with the layout of the definition, from where nodes are, after applying pending data changes. A layout passed to `run` serves that run only.
- `keys` limits the run to those nodes; the others stay still and act as anchors. The run starts with less energy and without the pull to the center, so moved nodes stay near the rest.
- `fit` frames the result: `true`, or fit options (`nodes`, `edges`, `padding`, `maxZoom`, `duration`). It aims at the final positions, so the view moves with the nodes.
- `duration` is the glide of a result reported at once, in milliseconds; default `transitions.layout` (400); `0` places nodes at once. It does not affect `force`, which animates by itself.
- The promise resolves `true` when the run ends, `false` when it is stopped, replaced or the graph is destroyed. It rejects when there is no layout, on a map, or when an option is not finite.
- `stop()` ends the run and leaves every node where it is.

### Follow the progress

```ts
import type { GraphInstance } from '@bruno00o/graph'

export function watchLayout(graph: GraphInstance, bar: HTMLProgressElement) {
  const stop = graph.store.subscribe(() => {
    const { running, progress } = graph.store.get().layout
    bar.hidden = !running
    bar.value = progress
  })
  const off = graph.on('layoutend', ({ name, completed }) => {
    console.log(name, completed ? 'done' : 'stopped')
  })
  return () => {
    off()
    stop.unsubscribe()
  }
}
```

`layoutstart` carries `{ name }`, `layoutend` `{ name, completed }`. Nodes that arrive during a run join it without a new `layoutstart`. In React, read `useGraphState((state) => state.layout)` (react skill).

### Decide when layouts run again

- First batch of nodes: the whole layout runs. Nodes added later: with `force` only the new nodes run, starting next to their placed neighbors while the rest stays still; with `layers`, `grid`, `rings`, `radial` and `geo` (`incremental: false`) every free node is laid out again.
- A graph that arrives in batches therefore looks different from one that arrives at once. When the data is complete, call `graph.layout.run()` to lay out the whole graph.
- Live sources that report their loading (a TanStack DB collection, a live query, `subset`, `createExploration`) are the exception: the first automatic layout over every node, and the one that follows a new layout or `relayout`, wait until they have loaded or failed, so a collection that syncs in batches is laid out once, on all its rows. The wait is `waitForData` in `defineGraph`: 10,000 ms from the first nodes by default (then the layout runs on what is there), `true` for no limit, `false` or `0` to lay out the first batch at once. Array data never waits, and neither does `graph.layout.run()`. Know when the data is in with `await graph.loaded()` (core skill).
- A definition with another layout, or the same layout with other options, lays out every free node again on the next frame. Options are compared one by one, so calling `force({ edgeLength: 60 })` again in a render restarts nothing.
- `layout: null` (the default) stops an automatic run and leaves nodes where they are.
- The view follows only the first run. Set `view: { autoFit: 'layouts' }` to frame every run, until the user pans or zooms.
- After a fold, an unfold or a change of `groups()` or `merge`, only the new nodes are placed; `relayout: true` in the definition runs the whole layout again.

### Which nodes move

- Positions from data win, always. A mark with `x` and `y` channels pins every node whose values are finite: layouts never move it. It still pushes and pulls the others, so free nodes settle around it. A node whose `x` or `y` is `null` is free.
- A node dragged during a run, or set with `graph.positions.set`, stays pinned until the run ends.
- Fixed nodes are left out of the places of `grid`, `rings` and `radial`: they keep their place, so free nodes fill the grid around them and holes can remain where fixed nodes sit.
- A node moves with its data only when its own `x` or `y` changes; a node the user dragged does not jump back when another field changes.
- Layouts do not run on a map. Positions there come from `longitude` and `latitude` (the `map` skill).

### Move, save and restore positions

```ts
import type { GraphInstance, Key, Point } from '@bruno00o/graph'

export function savePositions(graph: GraphInstance) {
  const saved = graph.positions.snapshot()
  localStorage.setItem('positions', JSON.stringify([...saved]))
}

export function restorePositions(graph: GraphInstance) {
  const stored = localStorage.getItem('positions')
  if (!stored) return
  const entries: [Key, Point][] = JSON.parse(stored)
  graph.positions.set(new Map(entries), { duration: 400 })
}

export function arrange(graph: GraphInstance) {
  graph.positions.set([
    ['n1', { x: 0, y: 0 }],
    ['n2', { x: 80, y: 0 }],
  ])
  return graph.positions.get('n1')
}
```

Helpers that take a bare `GraphInstance` accept the instance of any definition. `positions.set` moves a node even when its position comes from data channels (it stays there until its own `x` or `y` changes in the data). `snapshot()` reads every node of the data in a new `Map` that `set` takes back as is. A node still gliding is read where it is going; `snapshot({ settled: false })` reads where it is drawn now. A pair whose `x` or `y` is not finite is skipped, with a warning in development.

`positionchange` fires after a drag, `positions.set` or a finished layout run, with `origin` `'drag'`, `'api'` or `'layout'`; moves that come from the data never emit it, so writing positions back to the data does not loop. It fires on every pointer move during a drag: save on `dragend`, or pace the writes. A stopped run emits nothing.

To keep a layout as data, write the result into the items and read it back with the `x` and `y` channels: those nodes then keep their place for every later run. With TanStack DB, `persistPositions` does this (tanstack-db skill).

### Write a custom layout

```ts
import type { Layout } from '@bruno00o/graph'

export function circle(radius = 300): Layout {
  return {
    name: 'circle',
    options: { radius },
    start(graph, listener) {
      const xy = graph.xy.slice()
      const free: number[] = []
      for (let index = 0; index < graph.capacity; index++) {
        if (graph.alive[index] === 1 && graph.movable[index] === 1) free.push(index)
      }
      free.forEach((index, at) => {
        const angle = (at / free.length) * Math.PI * 2
        xy[index * 2] = Math.cos(angle) * radius
        xy[index * 2 + 1] = Math.sin(angle) * radius
      })
      listener.end(xy)
      return { pin: () => {}, stop: () => {} }
    },
  }
}
```

- `start(graph, listener)` receives a `LayoutGraph`: typed arrays indexed by the internal node index (`capacity`, `alive`, `movable`, `xy`, `radius`, `extents` when some node is a box, `edges` as pairs of indices with loops left out, `keys`, `groups`) and `datum(index)` for the item.
- Report with `listener.progress(xy, progress)` as often as you like, then `listener.end(xy)` once. Each array holds `capacity × 2` numbers, every node, and non-movable nodes must stay where they are. Ending without `progress` makes nodes glide to the result.
- Return `pin(index, x, y)` (a node was dragged or set during the run) and `stop()` (never call the listener after it). A layout that ends at once can leave `pin` empty, as above.
- `name` and `options` decide whether a new definition lays out again, compared one by one; keep options a flat object.
- `incremental: false` lays out every free node again when nodes arrive.
- Unfolded groups arrive in `graph.groups`. A layout that ignores it still works, but does not keep containers apart.

## Common Mistakes

### HIGH Importing `force` from the layouts entry point

`force` is only in `@bruno00o/graph/layouts/force`. The other layouts are in `@bruno00o/graph/layouts`, which does not export it.

```ts expect-error=TS2305
import { force } from '@bruno00o/graph/layouts'

force()
```

### HIGH Expecting a layout to move nodes that have `x` and `y`

Channels `x` and `y` on the node mark pin every node with finite values: the layout leaves them and uses them as fixed points. A graph whose every node has coordinates never moves, and a layout in its definition does nothing. Leave the channels out, or return `null` for the nodes that should be free. To turn a layout into data, write the result into the items and read it with `x` and `y`.

### HIGH Running a layout on a map

Layouts do not run in map mode: positions come from `longitude` and `latitude`, nodes without them stay near their neighbors, a layout in the definition logs a warning in development and `graph.layout.run` rejects. Use `geo` on a graph without a map to get the same projection.

### MEDIUM `grid` or `rings` with `order` inside `defineGraph`

TypeScript does not pass the item type of `marks` to a layout in the same object, so a comparator's parameters are `unknown`. Give the type argument: `grid<Item>({ order })`.

```ts expect-error=TS18046
import { defineGraph, nodes } from '@bruno00o/graph'
import { grid } from '@bruno00o/graph/layouts'

type Item = { id: string; label: string }
const items: Item[] = []

defineGraph({
  marks: [nodes(items, { label: 'label' })],
  layout: grid({ order: (a, b) => a.label.localeCompare(b.label) }),
})
```

### MEDIUM Expecting an instant layout to be incremental

`layers`, `grid`, `rings`, `radial` and `geo` lay out every free node again when nodes arrive, so a streaming graph rearranges whole. `force` places only the new nodes next to their neighbors. For a streaming graph that must not rearrange, use `force`, or give nodes coordinates.

### MEDIUM Expecting `layers` to draw an undirected graph well

`layers` needs a direction: it turns around the edges that close cycles and puts the nodes without incoming edges first. Use `root` to choose the first layer; for an undirected network use `force`.

### MEDIUM Awaiting `layout.run()` with nothing to run

`run()` without a layout in the definition or an argument rejects ("no layout to run"). Pass the layout to `run`, or set `layout` in the definition.

### MEDIUM Writing positions back on every drag move

`positionchange` fires on every pointer move during a drag. Saving each one floods the store. Listen to `dragend`, or pace the writes.

## Completion

The task is done when:

- the layout comes from the right entry point and nodes with data coordinates are the only fixed ones;
- the graph is framed after the run (first run is automatic; `autoFit: 'layouts'` or `fit` for later ones);
- code that waits for the result awaits `graph.layout.run()` and handles `false`;
- `grid` and `rings` with `order` inside `defineGraph` carry their type argument;
- `tsc` passes with no cast on layouts or positions.

## References

Every page has a Markdown version: add `.md` to its URL. The site documents the latest release.

- Guides: [Layouts](https://bruno00o.github.io/graph/docs/layout), [Positions](https://bruno00o.github.io/graph/docs/positions)
- API: [force](https://bruno00o.github.io/graph/docs/api/force), [layers, grid, rings, radial, geo](https://bruno00o.github.io/graph/docs/api/layouts)
- Examples: [force layout](https://bruno00o.github.io/graph/examples/force-layout), [force parameters](https://bruno00o.github.io/graph/examples/force-parameters), [layer direction and spacing](https://bruno00o.github.io/graph/examples/layer-spacing), [sorted grid](https://bruno00o.github.io/graph/examples/sorted-grid), [rings](https://bruno00o.github.io/graph/examples/ranked-rings), [radial tree](https://bruno00o.github.io/graph/examples/radial-tree), [geo layout](https://bruno00o.github.io/graph/examples/geo-layout), [fixed and free nodes](https://bruno00o.github.io/graph/examples/fixed-and-free-nodes), [save positions](https://bruno00o.github.io/graph/examples/save-positions), [custom layout](https://bruno00o.github.io/graph/examples/custom-layout)
- Groups in layouts: [how each layout keeps unfolded groups whole](https://bruno00o.github.io/graph/docs/layout#groups)
