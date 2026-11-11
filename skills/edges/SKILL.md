---
name: edges
description: >
  Use when shaping how @bruno00o/graph draws edges beyond source and target:
  arrows, dashes, widths and colors, edge labels, moving dashes (flows), a
  different look and label at each end of an edge, edges through waypoints or
  along GeoJSON lines, parallel edges and loops, bundling the edges of a dense
  graph, orthogonal routing around nodes, and bridges over crossings. Also for
  finding why edges stay straight, ignore bundling or routing, or lose their
  labels.
metadata:
  purpose: >
    Everything an edge mark can look like and how its geometry is computed: the
    channel and style options of edges(), per-end looks, waypoints, the
    automatic bend of parallel edges, and the bundling, routing and bridges of
    the definition, with their limits and the mistakes that leave edges
    straight or throw at definition time.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/types.ts
  - src/marks.ts
  - src/waypoints.ts
  - src/bundling/index.ts
  - src/bundling/density.ts
  - src/routing/index.ts
  - docs/content/docs/(guide)/marks.mdx
  - docs/content/docs/(guide)/labels.mdx
  - docs/content/docs/(guide)/bundling.mdx
  - docs/content/docs/(guide)/routing.mdx
  - docs/content/docs/api/edges.mdx
  - docs/content/docs/api/bundling.mdx
  - docs/content/docs/api/routing.mdx
requires:
  - core
---

# Shape how edges are drawn

Load the core skill first (`intent load @bruno00o/graph#core`): keys, channels versus styles, marks and states work the same for edges. This skill covers what an `edges()` mark can do beyond `source`, `target` and a first `arrow`, and the three geometries the definition can apply to edges: bundling, orthogonal routing and bridges.

## Setup

An edge mark takes channels (through a scale) and styles (final values):

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; label: string }
type Link = {
  id: string
  from: string
  to: string
  kind: string
  amount: number
  active: boolean
  name: string
}

const items: Item[] = []
const links: Link[] = []

const definition = defineGraph({
  marks: [
    edges(links, {
      source: 'from',
      target: 'to',
      color: 'kind',
      width: 'amount',
      arrow: 'target',
      dash: (link) => (link.active ? 'solid' : 'dashed'),
      opacity: 0.8,
      label: { text: 'name', size: 10, background: true },
    }),
    nodes(items, { label: 'label' }),
  ],
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })
```

- Channels: `color` (category or number through the color scale), `width` (number through the width scale, screen pixels, default range 1 to 6), `label`. Styles: `stroke` (a CSS color, wins over `color`), `dash` (`'solid'`, `'dashed'`, `'dotted'`), `arrow` (`'none'` default, `'source'`, `'target'`, `'both'`), `opacity`, `flow`, `minZoom`, `maxZoom`. Without options an edge is `--graph-edge` at 1.5 pixels.
- A number literal (`width: 2`) and a function wrapped in `raw()` skip the scale. A constant color goes in `stroke`, never in `color`.
- List edge marks before node marks: marks draw in order, so edges sit under the nodes.
- A helper that takes a graph types it `GraphInstance`, exported from the main entry; it accepts the instance of any definition.
- Every option is in the [edges API](https://bruno00o.github.io/graph/docs/api/edges).

## Core Patterns

### Edge labels

`label` takes a field, a function, or `{ text, size, color, weight, font, maxWidth, background }`. The label sits halfway along the edge, turns with it and stays upright. Without `background` it sits just above the line, with one (a CSS color, or `true` for the theme plate) it is centered on the line. It shows only when it fits between the two nodes, at least 8 pixels tall on screen, so zoom in to read the labels of short edges. Node labels are placed first, then edge labels widest edge first, at most 4,000 labels in all.

### Moving dashes

```ts
import { edges } from '@bruno00o/graph'

type Link = { id: string; from: string; to: string; rate: number }
const links: Link[] = []

edges(links, {
  source: 'from',
  target: 'to',
  flow: (link) => (link.rate > 0 ? link.rate : false),
})
```

`flow` is a style: `true` is 40 screen pixels per second, a number is that speed, negative flows toward the source, `false`, `0` and `null` stop it. A solid edge flows as dashes, a dashed edge moves its own pattern, arrowheads stay still, and `prefers-reduced-motion` freezes it. A state can start flows without touching data: `states: { path: { flow: true } }`. The graph draws frames only while a flowing edge is on screen.

### Two looks for one edge: `ends`

`ends` splits an edge at `split` (a share of the visible length between the node borders, `0.5` by default, clamped to 0..1, a constant or a function) into a source part and a target part, each with its own `color`, `stroke`, `width`, `dash` and `label`. An option an end leaves out keeps the edge's value.

```ts
import { edges } from '@bruno00o/graph'

type Exchange = { id: string; from: string; to: string; sent: number; received: number }
const exchanges: Exchange[] = []

edges(exchanges, {
  source: 'from',
  target: 'to',
  arrow: 'both',
  ends: {
    split: (exchange) => exchange.sent / (exchange.sent + exchange.received),
    source: { color: 'sent', width: 'sent', label: (exchange) => String(exchange.sent) },
    target: {
      color: 'received',
      width: 'received',
      label: { text: (exchange) => String(exchange.received), background: true },
    },
  },
})
```

- End `color` and `width` go through the edge mark's scales, shared with the edge's own `color` and `width` (an end value and an edge value of the same field map alike): they widen the extent, take categories in order and appear in the legend. An end that sets `color` or `stroke` replaces the edge's color on its part only; the other part, and any option an end leaves out, keep the edge's value. A number literal and `raw()` work as on the edge; `stroke` sets a color directly.
- Arrow heads take the color and width of their end; dash patterns and flows run on across the split.
- End labels sit near their node, past the arrow head, only when they fit, after the middle label. With a `background` they read as badges.
- Hover and selection that set `stroke` or `strokeWidth` apply to both ends. Selection and states hold whole edges, never one end: read `target.end` (`'source'` or `'target'`) in a `pointerenter` handler to know which end is under the pointer.
- Every geometry splits the same way: straight edges, parallel curves, loops, bundled and routed paths, waypoints, great circles, and the PNG and SVG exports.

### Waypoints

`waypoints` draws an edge through points of your own, in order from source to target. The ends stay on the nodes (they follow drags and layouts), only the points in between are fixed, and corners are sharp.

```ts
import { edges, lineWaypoints } from '@bruno00o/graph'
import type { LineGeometry } from '@bruno00o/graph'

type Road = { id: string; from: string; to: string; via: { x: number; y: number }[]; geometry: LineGeometry }
const roads: Road[] = []

const byHand = edges(roads, { source: 'from', target: 'to', waypoints: 'via' })
const byLine = edges(roads, {
  source: 'from',
  target: 'to',
  waypoints: (road) => lineWaypoints(road.geometry),
})
```

- A point is `{ x, y }` or `[x, y]` in world units (the units of node positions, `x` and `y` channels and layouts alike), or `{ longitude, latitude }` in degrees (Web Mercator, with or without a map). The channel takes any iterable.
- `lineWaypoints(geometry, { keepEnds })` reads a GeoJSON `LineString` or `MultiLineString` and drops the first and last positions unless `keepEnds` is `true`, since they usually sit on the end nodes.
- `null`, `undefined` or an empty list draw a plain edge. Points that are not finite, or equal to the previous one, are skipped. At most 8,190 points per edge; beyond, they are thinned with a warning in development.
- An edge with waypoints is never bundled, routed, bridged or bent beside parallel edges; loops ignore it, and it wins over `geodesic`. Width, color, dashes, flows, arrows, `ends`, labels (halfway along the path), picking and exports follow the path.

### Parallel edges and loops

Nothing to configure. Edges between the same two nodes, in either direction, bend apart in symmetric arcs (the bend is relative to the length, at most 0.2); an edge alone on its pair stays straight; a loop (source equals target) is drawn at the top right of the node and several loops nest. Curves keep their shape at every zoom and picking follows them. Edges of different layers between two nodes form one band per layer, in mark order (multilayer skill).

To draw several parallel edges as one, use `merge` (groups skill); with `merge: { directed: false, halves: true }` the two halves of a two-way line each select, hover and show the states of their own direction. Under `routing`, parallel edges run side by side apart by `spacing` instead of curving. An edge with waypoints, a geodesic edge or a bundled path does not bend beside others.

### Bundle a dense graph

`densityBundling` is its own entry point, so a graph without it carries none of its code. Pass it as `bundling`.

```ts
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { densityBundling } from '@bruno00o/graph/bundling'
import { force } from '@bruno00o/graph/layouts/force'

type Item = { id: string; group: string }
type Link = { id: string; from: string; to: string; kind: string }

const items: Item[] = []
const links: Link[] = []

const definition = defineGraph({
  marks: [
    edges(links, {
      source: 'from',
      target: 'to',
      opacity: 0.5,
      bundle: (link) => link.kind !== 'direct',
    }),
    nodes(items, { color: 'group' }),
  ],
  layout: force(),
  bundling: densityBundling({ strength: 0.85, radius: 0.06, iterations: 12, maxEdges: 200_000 }),
})
```

- `strength` (0..1, default 0.85): share of the bundled shape drawn; a new strength alone eases the edges, without computing again. `radius` (0..1, default 0.06): reach at the first pass as a share of the larger side of the graph; larger merges edges from further into fewer, thicker bundles. `iterations` (default 12, at most 64): more passes, tighter bundles. `maxEdges` (default 200,000): above it every edge stays straight and development builds warn; `Infinity` lifts the limit.
- Bundles are computed in a Web Worker once nodes stand still: after a layout run and its glide, 150 ms after a drag or a `positions.set`, after edges are added or removed, after a definition changes the bundling (except `strength` alone). While nodes move, bundled edges follow their ends; new edges stay straight until the next computation. When a layout moves most nodes, edges ease back to straight and bundle again at its end. Shape changes glide over `transitions.layout`.
- `await graph.bundling.run()` computes now, from the current positions (call it after `layoutend`, or nodes may still be moving), and resolves `true` once drawn; `graph.store.get().bundling.running` is `true` during a computation.
- Every edge bundles except loops and edges with waypoints; `bundle: false` (a style, constant or function) leaves an edge straight and pulling no other. Bundled edges keep width, color, arrows, dashes, flows, states and `ends`; they are picked along their path and labeled at its middle. Bundles read best with thin, light edges.
- Cost (laptop, communities): 10,000 edges 60 ms, 100,000 edges 0.2 s, one million 1.7 s; at random about four times longer. Frames: 2.3 ms bundled versus 2.1 ms straight at 10,000 edges.

### Route edges around nodes, with bridges

`orthogonalRouting` is its own entry point (`@bruno00o/graph/routing`). Each edge leaves its source through one side and enters its target through another, in horizontal and vertical segments that go around nodes and group containers.

```ts
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { layers } from '@bruno00o/graph/layouts'
import { orthogonalRouting } from '@bruno00o/graph/routing'

type Item = { id: string; label: string }
type Link = { id: string; from: string; to: string; kind: string }

const items: Item[] = []
const links: Link[] = []

const definition = defineGraph({
  marks: [
    edges(links, {
      source: 'from',
      target: 'to',
      arrow: 'target',
      route: (link) => link.kind !== 'direct',
    }),
    nodes(items, { shape: 'square', label: 'label' }),
  ],
  layout: layers({ direction: 'down' }),
  routing: orthogonalRouting({ axis: 'vertical', gap: 8, spacing: 6, radius: 6 }),
  bridges: { shape: 'gap', size: 10 },
})
```

- `gap` (default 8): room kept free around each node and container. `spacing` (default 6): distance between routes sharing a channel. `radius` (default 6, `0` sharp): corner rounding; a new radius alone redraws without computing again. `axis`: `'vertical'` leaves and enters through top and bottom, `'horizontal'` through left and right, `'auto'` (default) follows the larger distance of each edge. Match it to a layered layout: `'vertical'` for `'down'` and `'up'`, `'horizontal'` for `'left'` and `'right'`. `maxEdges` default 50,000, above which edges stay straight with a development warning.
- Routes are computed in a Web Worker once nodes stand still (after a layout run, 150 ms after a drag or position change, after nodes or edges change, after a fold or unfold, and when a layer, `hide` state, zoom range or time window shows or hides elements). `await graph.routing.run()` computes now; `graph.store.get().routing.running` is the status. Nodes in `units: 'screen'` route again when the zoom changes by a factor of 1.5.
- Every edge routes except loops, geodesic edges and edges with waypoints; `route: false` keeps an edge straight. An edge whose two nodes touch or overlap stays a straight center-to-center line. Parallel edges run side by side. Merged edges route once.
- `bridges` (`true` or `{ shape, size, maxEdges }`) makes one edge jump over another where they cross: `shape` is `'arc'` (half circle, default) or `'gap'` (a break in the line), `size` is the jump width in screen pixels (default 8, must be positive), `maxEdges` default 100,000. On routes the horizontal segment jumps; otherwise the edge drawn later (later mark, then later item). Bridges work on straight edges and on routes, with or without `routing`. `bridge: false` leaves an edge out. Parallel curves, loops, bundled paths, great circles, waypoints and rounded corners cross plainly; zoomed out below 1 jumps shrink, and under 2 pixels edges cross plainly. A segment jumps at most 8 times, an edge at most 64.
- Cost: 10,000 edges route in 0.27 s, 50,000 in 3.3 s; bridges 50 ms and 0.5 s.

### Not on a map

On a map (`mountMapGraph`) there is no bundling, routing or bridges: edges stay straight, or follow great circles with `geodesic` (a style, between nodes placed by `longitude` and `latitude`; the map skill). Do not set them in a map definition.

## Common Mistakes

### HIGH Setting `bundling` and `routing` together

A definition takes one or the other. `defineGraph` throws `TypeError: use bundling or routing, not both` at run time; the compiler does not see it.

Wrong:

```ts
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { densityBundling } from '@bruno00o/graph/bundling'
import { orthogonalRouting } from '@bruno00o/graph/routing'

type Item = { id: string }
type Link = { id: string; from: string; to: string }
const items: Item[] = []
const links: Link[] = []

defineGraph({
  marks: [edges(links, { source: 'from', target: 'to' }), nodes(items)],
  bundling: densityBundling(),
  routing: orthogonalRouting(),
})
```

Pick one. `bridges` combines with either.

### HIGH Importing bundling or routing from the main entry

`densityBundling` lives in `@bruno00o/graph/bundling` and `orthogonalRouting` in `@bruno00o/graph/routing`, so graphs without them ship none of their code. The main entry exports neither.

```ts expect-error=TS2305
import { densityBundling } from '@bruno00o/graph'

densityBundling()
```

### HIGH Expecting waypoints, geodesic edges or loops to bundle or route

Loops, geodesic edges and edges with waypoints are never bundled or routed, and waypoints and loops are never bridged. They draw where their own geometry puts them, so a graph full of waypoint edges shows no bundling. Waypoints win over `geodesic`.

### MEDIUM Passing a constant color to `color`

`color` is a channel: a field name or a function whose value goes through the color scale. A CSS color there does not compile. Use `stroke` for a constant or per-item color, or `raw()` to keep `color` without a scale.

```ts expect-error=TS2769
import { edges } from '@bruno00o/graph'

type Link = { id: string; from: string; to: string; kind: string }
const links: Link[] = []

edges(links, { source: 'from', target: 'to', color: 'tomato' })
```

### MEDIUM Expecting a state to style one end of an edge

States and selection hold whole edges: an end has no key of its own. A state with `stroke` or `strokeWidth` recolors both ends; opacity and halo keep the end colors. To highlight an end, read `target.end` from the `pointerenter` payload and style that end from your data. The exception is the two halves of a merged two-way line (`halves`, groups skill): each half takes the states of the edges of its direction, and a click selects that direction.

### MEDIUM Routing with the wrong `axis`, or without the layout it expects

With a layered layout, `axis` should follow its direction. `'auto'` mixes sides for each edge, which reads badly in a strict hierarchy. Routes also go around the nodes where they stand: routing without a layout (nodes on a spiral) is legal but rarely what you want.

### MEDIUM Expecting bundles or routes immediately

They are computed after nodes stand still, in a worker. Before that, and for edges that arrive later, edges are straight. After changing data programmatically, `await graph.bundling.run()` or `await graph.routing.run()` forces the computation. Above `maxEdges` nothing is computed: edges stay straight and development builds log a warning.

### MEDIUM Edge labels that never show

An edge label shows only when it fits in the visible length between its nodes and is at least 8 pixels tall on screen (its size times the smaller of the zoom and 1). Zoom in, shorten the text or lower `size`; do not assume the option is ignored.

### MEDIUM Writing bridges for a map or for bundled paths

`bridges` apply to straight edges and routes only. In map mode, with bundling, on parallel curves, on waypoints and on great circles they do nothing.

## Completion

The task is done when:

- edge options use channels for data fields and styles for constants, and `tsc` passes with no cast;
- the definition has `bundling` or `routing`, not both, imported from their entry points;
- a dense or layered graph is checked in the browser after nodes settle: bundles or routes are drawn, not straight lines;
- axis and layout direction agree when routing a layered graph;
- nothing in a map definition sets bundling, routing or bridges.

## References

Every page has a Markdown version: add `.md` to its URL. The site documents the latest release.

- Guides: [Marks and channels](https://bruno00o.github.io/graph/docs/marks), [Labels](https://bruno00o.github.io/graph/docs/labels#edge-labels), [Edge bundling](https://bruno00o.github.io/graph/docs/bundling), [Edge routing](https://bruno00o.github.io/graph/docs/routing)
- API: [edges](https://bruno00o.github.io/graph/docs/api/edges), [densityBundling](https://bruno00o.github.io/graph/docs/api/bundling), [orthogonalRouting](https://bruno00o.github.io/graph/docs/api/routing)
- Examples: [arrows and dashes](https://bruno00o.github.io/graph/examples/arrows-and-dashes), [edge styles](https://bruno00o.github.io/graph/examples/edge-styles), [flow speed](https://bruno00o.github.io/graph/examples/flow-speed), [parallel edges](https://bruno00o.github.io/graph/examples/parallel-edges), [edge ends](https://bruno00o.github.io/graph/examples/edge-ends), [waypoints](https://bruno00o.github.io/graph/examples/waypoints), [edge bundling](https://bruno00o.github.io/graph/examples/edge-bundling), [bundling strength](https://bruno00o.github.io/graph/examples/bundling-strength), [edge routing](https://bruno00o.github.io/graph/examples/edge-routing), [bridges](https://bruno00o.github.io/graph/examples/bridges)
