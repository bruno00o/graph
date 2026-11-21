---
name: layouts
description: >
  Use when placing @bruno00o/graph nodes that have no coordinates: choosing and
  adding a force layout, layers for a hierarchy or flow, a grid, rings, a radial
  tree or a geographic layout, running or stopping a layout from code, following
  its progress, framing the result, keeping dragged or data-given positions,
  saving and restoring positions, giving each group a layout of its own and
  arranging a group as it unfolds, layers fixed by a field, positions computed by
  your own code, writing a custom layout, or finding why nodes do not move or
  pile up.
metadata:
  purpose: >
    Where nodes go: the ready-made layouts and when to pick each, the
    definition and run-time ways to start a layout, a layout for each group,
    which nodes a layout may move, positions from data and from code, saving and
    restoring them, and the mistakes that leave nodes on a spiral or still.
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
  - src/layouts/placed.ts
  - src/types.ts
  - src/host/graph-instance.ts
  - src/host/layout-session.ts
  - src/host/layout-graph.ts
  - src/layouts/scopes.ts
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
| Positions your own code computed                       | `placed` | `@bruno00o/graph/layouts`        |

`force` lives in its own entry point so that a graph without it carries none of its code; the others share `@bruno00o/graph/layouts`. `force` animates while it settles, in a Web Worker, and handles hundreds of thousands of nodes. The others report their result at once, on the main thread, in milliseconds for thousands of nodes, and nodes glide to it.

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

Result: nodes settle over about 300 steps, the view keeps the graph framed while it settles (until the user pans or zooms), and the page stays responsive. Options of `force` (defaults): `edgeLength` 40, `repulsion` 80, `gravity` 0.04, `spacing` 6, `cohesion` 0.5, `groupSpacing` 16, `steps` 300, `engine` `'auto'`, `multilevel` `'auto'` (levels from 100 moving nodes, on runs that move at least half of them). A negative or non-finite value falls back to its default. Full table: [force API](https://bruno00o.github.io/graph/docs/api/force).

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
- `root` (a key, or a list of keys such as an array or a `Set`) forces nodes onto the first layer; edges into them are turned around. Edges that close a cycle are turned around too, as few as possible, and still drawn.
- `layerSpacing` and `nodeSpacing` are gaps between node borders, in world units. Defaults: twice the largest diameter (at least diameter plus 24) between layers, the largest diameter (at least 8) inside a layer.
- Separate components and lone nodes sit side by side, the largest first. The same graph always gives the same result.
- With unfolded groups, `layers` keeps room on the left and right of a container for its label at the width it is drawn with, measured in the font of the label, with its `maxWidth` cut and its background plate; a label above or below takes its height only. Without a page (headless skill), the width comes from `measureText`.
- `rank` (a field name or a function of the item) takes the layers from the data instead of the edges: the smallest value goes on the first layer, the next distinct one on the second, and only the order counts, so gaps leave no empty layer. Nodes without a finite value share one more layer after the last. An edge against the order is laid out turned around and still drawn to its target; an edge inside one layer is left out of the layout and drawn straight. Components share the layers instead of sitting side by side, and `root` is ignored. The cost grows with the layers an edge crosses, so give it few distinct values: bin continuous values into tens or hundreds of ranks first (2,000 nodes with all-distinct ranks took 3 s, 4,000 took 13 s; 100 ranks, 0.05 to 0.3 s). A development build warns once per run when the virtual nodes pass a limit. Inside `defineGraph`, write `layers<Step>({ rank })`.

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

- `grid`: rows from the top left, as many columns as rows unless `columns` says otherwise. `order` is `'degree'` or a comparator of two items. `spacing: { rows, columns }` sets one gap for each direction, for room under the nodes for labels.
- `rings`: the first node of `order` in the middle (default `'degree'`, busiest first, or `center`), then rings outward.
- `radial`: a breadth-first walk from `root` (a key, a list of keys, or the busiest node), each node on the ring of its distance, each branch with a slice of the circle in proportion to its size. Unreachable nodes go on an outer ring.
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
await graph.layout.run(force(), { keys: graph.shown().nodes, others: 'ignored', fit: true })
await graph.layout.run(force(), { signal: AbortSignal.timeout(2000) })
graph.layout.stop()
console.log(completed)
```

- `run()` lays out every free node with the layout of the definition, from where nodes are, after applying pending data changes. A layout passed to `run` serves that run only.
- `keys` limits the run to those nodes; the others stay still and act as anchors. The run starts with less energy and without the pull to the center, so moved nodes stay near the rest.
- `others` says what the nodes left out of `keys` are: `'anchors'` (default) keeps them in the graph the layout reads, still; `'ignored'` leaves them out with their edges, so the keys are laid out as a whole graph of their own, with the full energy and the pull to the center of a `force` run on everything. Use `'ignored'` for what a filter leaves on screen (`graph.shown().nodes`, core skill). Any other value rejects with a `TypeError`.
- `fit` frames the result: `true`, or fit options (`nodes`, `edges`, `padding`, `maxZoom`, `duration`). It aims at the final positions, so the view moves with the nodes.
- `duration` is the glide of a result reported at once, in milliseconds; default `transitions.layout` (400); `0` places nodes at once. It does not affect `force`, which animates by itself.
- `signal` stops the run when it aborts, as `stop()` does; already aborted, nothing starts.
- The promise resolves `true` when the run ends, `false` when it is stopped, aborted, replaced, the graph is destroyed or the layout throws (in `start` or while it computes, also inside `container.layout`): the error goes to `reportError` and to the `error` of `layoutend`, the nodes stay where they were, and `run()` does not reject. It rejects when there is no layout (in the definition, or in a group), on a map, or when an option is not finite.
- `stop()` ends the run and leaves every node where it is.

### Positions computed by your code

When the app computes its own arrangement (by kind, along a chain, from a place), run it with `placed`: it behaves like any layout, with the promise, `layoutstart`, `layoutend`, `positionchange` (origin `'layout'`), the glide, `fit`, `layout.stop` and `persistPositions`. `graph.layout.compute` gives the result of a layout by key without moving anything, to combine with your own placement.

```ts
import type { GraphInstance, Key, Point } from '@bruno00o/graph'
import { layers, placed } from '@bruno00o/graph/layouts'

export async function sideBySide(graph: GraphInstance, parts: readonly (readonly Key[])[]) {
  const positions = new Map<Key, Point>()
  let offset = 0
  for (const keys of parts) {
    const part = await graph.layout.compute(layers(), { keys, others: 'ignored' })
    const xs = [...part.values()].map((point) => point.x)
    const shift = offset - Math.min(...xs)
    for (const [key, point] of part) positions.set(key, { x: point.x + shift, y: point.y })
    offset += Math.max(...xs) - Math.min(...xs) + 120
  }
  return graph.layout.run(placed(positions), { fit: true, duration: 500 })
}
```

- `placed(positions)` takes entries of key and point (a `Map`, `positions.snapshot()`, a `compute` result; a `Map` is used as it is, so leave it alone after the call), or a function of the item that returns a point, `null` or `undefined` (`placed<Item>((item) => item.home ?? null)`). Positions are in world units. A free node without a position, or with a non-finite one, stays; nodes with `x` and `y` in the data, dragged nodes and nodes outside `keys` never move.
- `compute(layout?, { keys, others, signal })` resolves to a `Map` of the nodes it lays out. It applies pending data first, starts from where nodes are (or glide to), emits nothing and leaves a run in progress going. It resolves to an empty map when no node is free, and rejects without a layout, on a map, when `signal` aborts (with its reason), when the layout throws (with its error) and when the graph is destroyed.

### Follow the progress

```ts
import type { GraphInstance } from '@bruno00o/graph'

export function watchLayout(graph: GraphInstance, bar: HTMLProgressElement) {
  const stop = graph.store.subscribe(() => {
    const { running, progress } = graph.store.get().layout
    bar.hidden = !running
    bar.value = progress
  })
  const off = graph.on('layoutend', ({ name, completed, error }) => {
    if (error !== undefined) console.error(name, error)
    else console.log(name, completed ? 'done' : 'stopped')
  })
  return () => {
    off()
    stop.unsubscribe()
  }
}
```

`layoutstart` carries `{ name }`, `layoutend` `{ name, completed, error }`, `error` only when the layout threw. Nodes that arrive during a run join it without a new `layoutstart`. In React, read `useGraphState((state) => state.layout)` (react skill).

### Decide when layouts run again

Without a page (`createGraph`, headless skill), layouts run on the calling thread in slices of 50 ms, never in a Web Worker, so the GPU engine of `force` does not run, and `await graph.settled()` waits for the end of the run.

- First batch of nodes: the whole layout runs. Nodes added later: with `force` only the new nodes run, starting next to their placed neighbors while the rest stays still; with `layers`, `grid`, `rings`, `radial` and `geo` (`incremental: false`) every free node is laid out again.
- A graph that arrives in batches therefore looks different from one that arrives at once. When the data is complete, call `graph.layout.run()` to lay out the whole graph.
- Live sources that report their loading (a TanStack DB collection, a live query, `subset`, `createExploration`) are the exception: the first automatic layout over every node, and the one that follows a new layout or `relayout`, wait until they have loaded or failed, so a collection that syncs in batches is laid out once, on all its rows. The wait is `waitForData` in `defineGraph`: 10,000 ms from the first nodes by default (then the layout runs on what is there), `true` for no limit, `false` or `0` to lay out the first batch at once. Array data never waits, and neither does `graph.layout.run()`. Know when the data is in with `await graph.loaded()` (core skill).
- Nodes placed by `initialPositions` count as laid out: no run starts for them. A node without an entry is an arrival: with `force` it is placed next to its placed neighbors; with the non-incremental layouts every free node is laid out again, the restored ones included.
- A definition with another layout, or the same layout with other options, lays out every free node again on the next frame. Options are compared one by one, so calling `force({ edgeLength: 60 })` again in a render restarts nothing.
- `layout: null` (the default) stops an automatic run and leaves nodes where they are.
- The view follows only the first run. Set `view: { autoFit: 'layouts' }` to frame every run, until the user pans or zooms.
- After a fold, an unfold or a change of `groups()` or `merge`, only the new nodes are placed; `relayout: true` in the definition runs the whole layout again. A group with a layout of its own (next section) arranges its members as it unfolds.

### Which nodes move

- Positions from data win, always. A mark with `x` and `y` channels pins every node whose values are finite: layouts never move it. It still pushes and pulls the others, so free nodes settle around it. A node whose `x` or `y` is `null` is free.
- A node dragged during a run, or set with `graph.positions.set`, stays pinned until the run ends.
- Fixed nodes are left out of the places of `grid`, `rings` and `radial`: they keep their place, so free nodes fill the grid around them and holes can remain where fixed nodes sit.
- A node moves with its data only when its own `x` or `y` changes; a node the user dragged does not jump back when another field changes.
- `graph.positions.reset(keys?, { duration })` puts nodes back where their data places them (`x` and `y`, or `longitude` and `latitude`) after a drag or a `set`. A node whose data gives no position, or that is already there, stays.
- Layouts do not run while the graph is on a map. Positions there come from `longitude` and `latitude`, and the layout runs again when the graph moves back to its canvas (the `map` skill).

### Give a group a layout of its own

`container.layout` on `nodes()` or `groups()` (a layout, `null`, or a function of the group item) lays the members of an unfolded group out together; the layout of the definition then places the group as one block, as large as its container, and turns it to face its neighbors as the group layout's `turns` allows. Groups run deepest first, side by side where they do not depend on each other (`force` groups under 2,000 nodes share a pool of workers), in one run named after the layout of the definition, or of the outermost group when the definition has none. `graph.layout.run()` works with group layouts only.

- A group that unfolds arranges its members as it unfolds: they come out of the folded node and glide to their places, the nodes around make room, even with no layout in the definition. An incremental layout puts back the members it arranged before (dragged ones too) and places only the new ones. `relayout: true` lays out the whole graph instead.
- New members run their group alone; a group whose members, edges, sizes and layout did not change keeps its arrangement when the graph lays out again, while `layout.run()` always runs every group it moves. Members placed by `x` and `y` stay, and members arranged by a group layout are not spread.
- A layout of your own works alone in a container. Layouts compare by name and options: `grid()` called again with the same values reruns nothing, a new function option does. `container.layout` is ignored on a map. Typed example and limits: [references/group-layouts.md](references/group-layouts.md).

### Move, save and restore positions

```ts
import { type GraphDefinition, type GraphInstance, type Key, mountGraph, type Point } from '@bruno00o/graph'

export function savePositions(graph: GraphInstance) {
  const saved = graph.positions.snapshot()
  localStorage.setItem('positions', JSON.stringify([...saved]))
}

export function mountRestored(container: HTMLElement, definition: GraphDefinition) {
  const stored = localStorage.getItem('positions')
  const entries: [Key, Point][] = stored ? JSON.parse(stored) : []
  return mountGraph(container, { definition, ariaLabel: 'Sample graph', initialPositions: entries })
}

export function arrange(graph: GraphInstance) {
  graph.positions.set([
    ['n1', { x: 0, y: 0 }],
    ['n2', { x: 80, y: 0 }],
  ])
  return graph.positions.get('n1')
}
```

Helpers that take a bare `GraphInstance` accept the instance of any definition. To bring nodes back when a graph mounts again (a route change, a remount), pass the snapshot as `initialPositions` to `mountGraph`, `mountMapGraph`, `<Graph>` or `<MapGraph>`: nodes with an entry are drawn there and count as laid out, with no layout run, no `positionchange` and nothing for `persistPositions` to write, and they are not pinned. Nodes without an entry are arrivals. Positions from the data win, entries that are not finite are skipped, and the entries serve only the first data (the nodes that arrive while a live source loads, or in the first batch). `autoFit: 'first'` frames the restored nodes on the first frame, and `initialView` still wins. A snapshot belongs to one surface: positions read on a map are in map world units, so give them back to a map graph. A graph moved between its canvas and a map with `surface` keeps each side's positions by itself (map skill). To let the user save a whole arrangement as one record, replay it, tell user moves from replayed ones, or save degrees across surfaces, see [references/saving-arrangements.md](references/saving-arrangements.md).

`positions.set` moves a node even when its position comes from data channels (it stays there until its own `x` or `y` changes in the data). `snapshot()` reads every node of the data in a new `Map` that `set` takes back as is. A node still gliding is read where it is going; `snapshot({ settled: false })` reads where it is drawn now. A pair whose `x` or `y` is not finite is skipped, with a warning in development.

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

- `start(graph, listener)` receives a `LayoutGraph`: typed arrays indexed by the internal node index (`capacity`, `alive`, `movable`, `xy`, `radius`, `extents` when some node is a box, `edges` as pairs of indices with loops left out, `keys`, `groups`, and `work`: `{ slice, workers }`, the longest stretch in ms before giving the event loop back and whether a Web Worker may start, 8 ms with workers on a page and 50 ms without on a graph from `createGraph`; read it instead of hard-coding a budget or a `Worker`) and `datum(index)` for the item.
- Report with `listener.progress(xy, progress)` as often as you like, then `listener.end(xy)` once. Each array holds `capacity × 2` numbers, every node, and non-movable nodes must stay where they are. Ending without `progress` makes nodes glide to the result. A run that fails later (in a worker, a timer) calls `listener.fail?.(error)` instead of `end`: `completed: false`, the `error` on `layoutend`, nodes left in place. A throw from `start` itself ends the run the same way.
- Return `pin(index, x, y)` (a node was dragged or set during the run) and `stop()` (never call the listener after it). A layout that ends at once can leave `pin` empty, as above.
- `name` and `options` decide whether a new definition lays out again, compared one by one; keep options a flat object.
- `incremental: false` lays out every free node again when nodes arrive.
- Unfolded groups arrive in `graph.groups`. A layout that ignores it still works, but does not keep containers apart.
- `turns` (`'free'`, `'flip'` or `'none'`, the default) says how the result may be turned to face its neighbors when the layout places the members of a group. `blocks` (nodes that stand for a whole group laid out on its own: `size` per index, `items(index)`, `keys(index)`) and `container` (the group a layout runs inside) are optional fields of `LayoutGraph` that the graph sets when the layout serves a `container.layout`: a block is a node as large as its group, and a layout that ignores them still works.

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

Layouts do not run while the graph is on a map: positions come from `longitude` and `latitude`, nodes without them stay near their neighbors, a layout in the definition or in a group logs a warning in development and `graph.layout.run` rejects. They run again once the graph is back on its canvas. Use `geo` on a graph without a map to get the same projection.

### MEDIUM Restoring positions with `positions.set` after mount

`positions.set` right after mounting applies the pending data first, which starts the first layout run on every node, then pins the nodes and emits `positionchange` (so `persistPositions` writes the positions back). Pass the snapshot as `initialPositions` instead: the nodes are placed while the data arrives, with no run, no event and no pin.

```ts no-check
const again = mountGraph(container, { definition, ariaLabel: 'Sample graph' })
again.positions.set(saved)
```

```ts no-check
const again = mountGraph(container, { definition, ariaLabel: 'Sample graph', initialPositions: saved })
```

### MEDIUM `rank` inside `defineGraph` without the item type

Like `order`, `rank` reads items that TypeScript does not pass to a layout in the same object: a function gets `unknown`, and a field name has no field to match. Give the type argument.

```ts expect-error=TS2322
import { defineGraph, nodes } from '@bruno00o/graph'
import { layers } from '@bruno00o/graph/layouts'

type Step = { id: string; level: number }
const steps: Step[] = []

defineGraph({
  marks: [nodes(steps)],
  layout: layers({ rank: 'level' }),
})
```

### MEDIUM Laying out a subset next to nodes that stay as anchors

`run({ keys })` keeps the other nodes in the graph the layout reads, still, and a `force` run starts with less energy and without the pull to the center: a subset laid out beside hidden or filtered nodes stays loose around them. When the keys are what should be laid out, ignore the others.

```ts
import type { GraphInstance } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'

export function layOutShown(graph: GraphInstance) {
  return graph.layout.run(force(), { keys: graph.shown().nodes, others: 'ignored', fit: true })
}
```

### MEDIUM Expecting `layout.compute` to move nodes

`compute` resolves to the positions by key and moves nothing, emits nothing and changes no store. Give the result to `placed` to run it, or to `positions.set`.

```ts
import type { GraphInstance } from '@bruno00o/graph'
import { grid, placed } from '@bruno00o/graph/layouts'

export async function arrange(graph: GraphInstance) {
  const result = await graph.layout.compute(grid())
  return graph.layout.run(placed(result), { fit: true })
}
```

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

### MEDIUM A group layout with a new function option on every render

Layouts are compared by name and options, one by one, so a layout made again with the same values (`grid()` returned by a declared function) reruns nothing. But `grid({ order: (a, b) => a.rank - b.rank })` in a definition rebuilt in render has a new function each time: every update runs the layout of every group again. Declare the function once (`const byRank = …`) and pass `grid<Item>({ order: byRank })`.

### MEDIUM Writing positions back on every drag move

`positionchange` fires on every pointer move during a drag. Saving each one floods the store. Listen to `dragend`, or pace the writes.

## Completion

The task is done when:

- the layout comes from the right entry point and nodes with data coordinates are the only fixed ones;
- the graph is framed after the run (first run is automatic; `autoFit: 'layouts'` or `fit` for later ones);
- code that waits for the result awaits `graph.layout.run()` and handles `false`;
- `grid` and `rings` with `order`, and `layers` with `rank`, inside `defineGraph` carry their type argument;
- positions saved by a previous mount come back through `initialPositions`, not `positions.set`;
- a group that needs its own arrangement has `container.layout`, with function options declared once;
- `tsc` passes with no cast on layouts or positions.

## References

Every page has a Markdown version: add `.md` to its URL. The site documents the latest release.

- Guides: [Layouts](https://bruno00o.github.io/graph/docs/layout), [Positions](https://bruno00o.github.io/graph/docs/positions), [Restore at mount](https://bruno00o.github.io/graph/docs/positions#restore-at-mount)
- API: [force](https://bruno00o.github.io/graph/docs/api/force), [layers, grid, rings, radial, geo, placed](https://bruno00o.github.io/graph/docs/api/layouts)
- Examples: [force layout](https://bruno00o.github.io/graph/examples/force-layout), [force parameters](https://bruno00o.github.io/graph/examples/force-parameters), [layer direction and spacing](https://bruno00o.github.io/graph/examples/layer-spacing), [sorted grid](https://bruno00o.github.io/graph/examples/sorted-grid), [rings](https://bruno00o.github.io/graph/examples/ranked-rings), [radial tree](https://bruno00o.github.io/graph/examples/radial-tree), [geo layout](https://bruno00o.github.io/graph/examples/geo-layout), [fixed and free nodes](https://bruno00o.github.io/graph/examples/fixed-and-free-nodes), [save positions](https://bruno00o.github.io/graph/examples/save-positions), [custom layout](https://bruno00o.github.io/graph/examples/custom-layout), [layers fixed by the data](https://bruno00o.github.io/graph/examples/ranked-layers), [positions computed by the app](https://bruno00o.github.io/graph/examples/computed-positions)
- Groups in layouts: [how each layout keeps unfolded groups whole](https://bruno00o.github.io/graph/docs/layout#groups), [a layout per group](https://bruno00o.github.io/graph/docs/layout#a-layout-per-group), example [layouts per group](https://bruno00o.github.io/graph/examples/group-layouts)
- Saving: [Save a whole arrangement](https://bruno00o.github.io/graph/docs/positions#save-a-whole-arrangement)
