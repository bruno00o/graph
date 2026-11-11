---
name: shapes
description: >
  Use when drawing areas and lines from your own geometry under a
  @bruno00o/graph graph: zones, districts, parcels, rings, rectangles, circles and
  polygons with holes in world units, or GeoJSON polygons and lines in degrees;
  styling them with fill, stroke, dash and opacity; letting people hover, click,
  select and lasso them, or keeping a decorative zone out of the pointer's way;
  dimming, hiding or highlighting them with states; showing them by zoom, time or
  layer; framing, counting and exporting them; and finding unreadable geometry.
  Not for an outline that follows a set of nodes (hulls or groups), nor for
  shapes on a MapLibre map, which are not drawn yet.
metadata:
  purpose: >
    The shapes() mark of @bruno00o/graph: geometry forms and units, style and
    drawing order, picking, selection and events, states, zoom, time and layers,
    fit, count and issues, exports, and the mistakes that leave a zone unclickable,
    mispositioned, untyped or missing.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/shapes/index.ts
  - src/shapes/read.ts
  - src/shapes/pick.ts
  - src/core/shape-store.ts
  - src/core/shape-engine.ts
  - src/types.ts
  - src/host/events.ts
  - src/host/graph-instance.ts
  - docs/content/docs/(guide)/shapes.mdx
  - docs/content/docs/api/shapes.mdx
requires:
  - core
---

# Draw shapes under a graph

Load the core skill first (`intent load @bruno00o/graph#core`). A shape mark draws free areas and lines from your data, under the nodes and the edges: polygons with holes, discs and rings, rectangles, and lines. It is a third kind of mark beside `nodes()` and `edges()`: its items have keys, come from arrays or live sources, appear in `issues()` and `count()`, can be hovered, clicked, selected, styled by states, shown by zoom, time and layer, and exported. `shapes` has its own entry point, `@bruno00o/graph/shapes`, so a graph without shapes never loads its geometry reader or triangulation, and does no work for them.

## When to use shapes

| You need | Use |
| --- | --- |
| An area or a line that exists in your data with its own coordinates: a zone, a parcel, a region, a corridor | `shapes()` |
| An outline that follows a set of nodes and moves with them | a hull (`hull()`, tools skill) |
| Nodes inside a node that people fold and unfold | group containers (groups skill) |
| HTML or text pinned to a node, an edge or a point | anchors (tools skill) |
| An edge that bends through points or along a GeoJSON line | `waypoints` (edges skill) |
| Areas on a MapLibre map | nothing yet: shapes are not drawn on a map |

## Core Patterns

### Draw zones under the graph

```ts
import { defineGraph, edges, mountGraph, nodes, type ShapeGeometry } from '@bruno00o/graph'
import { shapes } from '@bruno00o/graph/shapes'

type Place = { id: string; x: number; y: number }
type Link = { id: string; from: string; to: string }
type Zone = { id: string; title: string; geometry: ShapeGeometry }

const places: Place[] = [
  { id: 'a', x: 80, y: 60 },
  { id: 'b', x: 520, y: 150 },
]
const links: Link[] = [{ id: 'ab', from: 'a', to: 'b' }]
const zones: Zone[] = [
  {
    id: 'north',
    title: 'North',
    geometry: {
      rings: [
        [[0, 0], [400, 0], [400, 300], [0, 300]],
        [[120, 100], [280, 100], [280, 200], [120, 200]],
      ],
    },
  },
  { id: 'pond', title: 'Pond', geometry: { center: { x: 520, y: 150 }, radius: 100, inner: 50 } },
]

const definition = defineGraph({
  marks: [
    shapes(zones, { name: 'zone' }),
    edges(links, { source: 'from', target: 'to' }),
    nodes(places, { x: 'x', y: 'y', label: 'id' }),
  ],
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Zones and places' })
```

Result: two zones drawn with the theme fill and outline, under the edge and the nodes. Shapes always draw right after the background grid, before containers, hulls, edges and nodes, wherever the mark sits in `marks`. The first automatic fit frames the shapes with the nodes, and a graph made of shapes alone frames its shapes. Keys work as for nodes: the `id` field, or the `key` option, and a key is unique across shape marks (node and edge keys are separate). A live source (a TanStack DB collection) works too, and takes no `key` option.

### Pick the geometry form

`geometry` (the `geometry` field by default) is a channel: a field name or a function. It takes one of these forms. Points are `{ x, y }` or `[x, y]` in world units, the units of the `x` and `y` of nodes, or `{ longitude, latitude }` in degrees.

| Form | Draws |
| --- | --- |
| `{ rings }` | A polygon: the first ring is the outline, the others are holes. A ring closes on its own, in either direction |
| `{ points, closed }` | A line through the points, open unless `closed`. A line is never filled |
| `{ center, radius, inner }` | A disc, or a ring with `inner` |
| `{ x, y, width, height, cornerRadius }` | A rectangle, `x` and `y` being its left and top sides |
| GeoJSON `Polygon`, `MultiPolygon` | Polygons from `[longitude, latitude]` positions |
| GeoJSON `LineString`, `MultiLineString` | Lines from `[longitude, latitude]` positions |

- Degrees go through Web Mercator, where the world is 512 units wide, exactly like the `longitude` and `latitude` channels of nodes. GeoJSON zones line up with nodes placed by `longitude` and `latitude`, not with nodes placed by `x` and `y`. A circle whose center is in degrees takes its radii in meters.
- `null` draws nothing and is no problem. A non-finite point or a point equal to the one before it is skipped. A ring needs three points and a line two, or the shape is reported as `'empty'`.
- Type the data as `ShapeGeometry` (exported by the main entry) or with `[number, number]` tuples. Coordinates typed `number[][]` do not compile when you name the field (see Common Mistakes).

### Style and order

`fill`, `stroke`, `strokeWidth`, `dash` and `opacity` are styles: a constant or a function of the item, never a field name. `fill` and `stroke` default to the theme tokens `--graph-shape-fill` and `--graph-shape-stroke`, and `null` draws none. `fill` colors the inside of polygons, discs, rings and rectangles, `stroke` their outline and the lines. `strokeWidth` is in screen pixels (1 by default) and keeps its size at every zoom, `dash` is `'solid'`, `'dashed'` or `'dotted'`, and `opacity` fades fill and outline together.

```ts
import { defineGraph, mountGraph, type ShapeGeometry } from '@bruno00o/graph'
import { shapes } from '@bruno00o/graph/shapes'

type Zone = { id: string; kind: 'park' | 'road'; rank: number; geometry: ShapeGeometry }
const zones: Zone[] = []

const graph = mountGraph(document.body, {
  definition: defineGraph({
    marks: [
      shapes(zones, {
        fill: (zone) => (zone.kind === 'park' ? 'color-mix(in srgb, var(--graph-cat-3) 25%, transparent)' : null),
        stroke: 'var(--graph-ink-muted)',
        strokeWidth: (zone) => (zone.kind === 'road' ? 3 : 1),
        dash: (zone) => (zone.kind === 'road' ? 'dashed' : 'solid'),
        opacity: 0.8,
        order: 'rank',
      }),
    ],
  }),
  ariaLabel: 'Parks and roads',
})
```

Between shapes, marks draw in the order of `marks`, and inside a mark `order` (a field or a function) sorts them: a lower value draws first, under the others; equal or missing values keep their arrival order. Colors are CSS strings like everywhere: prefer `var(--graph-…)` so they follow the theme.

### Hover, click and select

Shapes take the pointer like nodes and edges. `click`, `doubleclick`, `contextmenu`, `pointermove`, `pointerenter` and `pointerleave` carry a target with `kind: 'shape'`, its `key`, its `datum` (typed by its mark) and the `name` of its mark. The cursor turns into a pointer over a shape that can be picked.

```ts
import { defineGraph, mountGraph, nodes, type ShapeGeometry } from '@bruno00o/graph'
import { shapes } from '@bruno00o/graph/shapes'

type Place = { id: string; x: number; y: number }
type Zone = { id: string; title: string; geometry: ShapeGeometry }
const places: Place[] = []
const zones: Zone[] = []

const graph = mountGraph(document.body, {
  definition: defineGraph({
    marks: [shapes(zones, { name: 'zone' }), nodes(places, { x: 'x', y: 'y' })],
  }),
  ariaLabel: 'Zones and places',
})

graph.on('click', ({ target }) => {
  if (target?.kind === 'shape') console.log(target.key, target.datum.title, target.mark)
})
graph.on('selectionchange', ({ selection }) => console.log(selection.shapes))

graph.selection.set({ shapes: ['north'] })
const picked = graph.selection.get().shapes
const zone = graph.datumOf({ kind: 'shape', key: 'north' })
console.log(picked, zone?.title)
```

- A click selects a shape; with `select: 'multiple'` (the default), Shift, Cmd or Ctrl adds it or removes it. A click on the background and Escape clear the selection, shapes included. `selection`, `selectionchange` and the members of a state have a `shapes` list next to `nodes` and `edges`, only when the definition has a shape mark. In controlled mode, pass `shapes` with the other keys (interaction skill).
- Nodes, edges and containers drawn over a shape always take the pointer first. Between shapes the one drawn last wins, and a raised one comes before the others.
- Dragging a shape moves the view, like the background. A double click on a shape does nothing. Keyboard focus stays on nodes: shapes are neither focused nor announced.
- The lasso (`lasso: true` with `select: 'multiple'`, interaction skill) may start on a shape. It takes the nodes inside it and the shapes whose every point is inside; a shape that contains the lasso is not taken.
- Holes are not part of a shape: a pointer in a hole goes through to what lies under it.

### Choose what takes the pointer

`pick` is an option of the mark, not of each item:

| `pick` | Takes the pointer |
| --- | --- |
| `'painted'` (default) | The inside of a filled shape and the outline of a stroked one |
| `'stroke'` | The outline only, filled or not |
| `false` | Nothing: hover, clicks and the lasso go through |

An outline takes the pointer within half its width plus 4 pixels, at every zoom. A shape with `fill: null` and `stroke: null` is not picked either. A large zone under everything is easy to click by mistake: give it `pick: 'stroke'` to select it by its border, or use `pick: false` on a mark that only decorates. To mix both in one graph, use two marks:

```ts
import { defineGraph, mountGraph, type ShapeGeometry } from '@bruno00o/graph'
import { shapes } from '@bruno00o/graph/shapes'

type Zone = { id: string; geometry: ShapeGeometry }
const backdrop: Zone[] = [{ id: 'sea', geometry: { x: -800, y: -600, width: 1600, height: 1200 } }]
const zones: Zone[] = []

const graph = mountGraph(document.body, {
  definition: defineGraph({
    marks: [
      shapes(backdrop, { pick: false, stroke: null }),
      shapes(zones, { name: 'zone' }),
    ],
  }),
  ariaLabel: 'Zones on a backdrop',
})
console.log(graph.count().shapes)
```

The decorative mark is listed first so it draws under the selectable one, and its keys differ from the other mark's.

### Style shapes with states

States style shapes as they style nodes and edges. `selected` draws the outline of a shape in the accent color, 2 pixels wide, and `hovered` in the ink color; both are raised. Free states take a `shapes` list, and a style by kind takes `shapes` beside `nodes` and `edges`:

```ts
import { defineGraph, mountGraph, nodes, type ShapeGeometry } from '@bruno00o/graph'
import { shapes } from '@bruno00o/graph/shapes'

type Place = { id: string; x: number; y: number }
type Zone = { id: string; geometry: ShapeGeometry }
const places: Place[] = []
const zones: Zone[] = []

const graph = mountGraph(document.body, {
  definition: defineGraph({
    marks: [shapes(zones), nodes(places, { x: 'x', y: 'y' })],
    states: {
      selected: { others: { opacity: 0.2 } },
      flagged: {
        nodes: { stroke: 'var(--graph-cat-4)' },
        shapes: { fill: 'color-mix(in srgb, var(--graph-cat-4) 40%, transparent)', strokeWidth: 3 },
      },
      muted: { shapes: { others: { opacity: 0.3 } } },
      gone: { hide: true },
    },
  }),
  ariaLabel: 'Zones and places',
})

graph.states.set('flagged', { nodes: ['a'], shapes: ['north'] })
graph.states.add('gone', { shapes: ['pond'] })
console.log(graph.states.has('flagged', { kind: 'shape', key: 'north' }))
```

- A shape state restyles `fill`, `stroke`, `strokeWidth` and `opacity`. `label`, `halo`, `outline` and the other node and edge properties do not apply. `raise` draws a shape after the other shapes and picks it first among them, still under containers, hulls, edges and nodes. `hide` takes a shape out of drawing, picking, the lasso, `count().shown` and the exports.
- `others` crosses kinds, in both directions. A state is active as soon as it has one member of any kind, and a style for both kinds with `others` styles everything outside it: nodes, edges and the other shapes. `selected: { others: { opacity: 0.2 } }` therefore dims everything outside the selected zone, and also dims the zones when a node is selected.
- To dim everything only while a zone is selected (not when a node is), declare a free state with `others` and fill it from the selection: `graph.on('selectionchange', ({ selection }) => selection.shapes.length === 0 ? graph.states.clear('focus') : graph.states.set('focus', { shapes: selection.shapes }))`. Its `others` also dims a `pick: false` backdrop, since it is not a member.
- To dim some kinds and not others, give `others` by kind. A kind left out is not styled: `{ nodes: { others: { opacity: 0.2 } } }` dims the nodes outside the state and leaves every zone as it is. A built-in state keeps its default style for a kind left out, so the selected zone still draws its outline.
- Everything else about states (priority, `others`, `raise`, `hide`, the limit of 29 free states) is in the interaction skill.

### Show shapes by zoom, time and layer

`minZoom`, `maxZoom`, `time` and `layer` work on shapes as on nodes:

```ts
import { defineGraph, mountGraph, type ShapeGeometry } from '@bruno00o/graph'
import { shapes } from '@bruno00o/graph/shapes'

type Zone = { id: string; detail: boolean; from: number; until: number; geometry: ShapeGeometry }
const zones: Zone[] = []

const graph = mountGraph(document.body, {
  definition: defineGraph({
    marks: [
      shapes(zones, {
        minZoom: (zone) => (zone.detail ? 1.5 : null),
        time: (zone) => ({ start: zone.from, end: zone.until }),
        layer: 'zones',
      }),
    ],
  }),
  ariaLabel: 'Zones',
})

graph.layers.hide(['zones'])
graph.time.set({ start: 0, end: 1000 })
```

A shape is visible above its `minZoom` and below its `maxZoom` (zoom is screen pixels per world unit, the unit of the view), and fades in over a quarter of a zoom doubling: with `minZoom: 1.5` it is hidden at 1.5 and below, and fully drawn from about 1.78. A shape out of its zoom range, out of the time window or in a hidden layer is absent: not drawn, not picked, not taken by the lasso, not counted in `count().shown` and not exported. It stays in the data, the selection, the states and `view.fit`. A layer may hold nodes, edges and shapes; hiding a layer of nodes hides their edges, not the shapes of other layers. See the view, time and multilayer skills for the options themselves.

### Frame, count and check

- `graph.view.fit()` frames every node and every shape. `fit({ nodes })` or `fit({ edges })` frames only what they name. `fit({ shapes: ['north'] })` frames the box of those shapes, alone or with `nodes` and `edges`. Keys of unknown or unreadable shapes are ignored.
- With a shape mark, `graph.count()` has `shapes` (one per key) and `shown.shapes` (drawn: readable geometry, not hidden by zoom, time, layer or state).
- Geometry that cannot be drawn is listed by `graph.issues()`, never thrown: `{ type: 'invalid-shape', kind: 'shapes', key, reason }`, with `reason` `'empty'` (unreadable, or no area nor length) or `'self-intersecting'` (rings that cross: drawn as well as it can). An item without a usable key or with a duplicate key is a `missing-key` or `duplicate-key` issue with `kind: 'shapes'`. A typed graph has these issue types only when it has a shape mark.

```ts
import { defineGraph, mountGraph, type ShapeGeometry } from '@bruno00o/graph'
import { shapes } from '@bruno00o/graph/shapes'

type Zone = { id: string; geometry: ShapeGeometry }
const zones: Zone[] = [{ id: 'flat', geometry: { rings: [[[0, 0], [10, 10]]] } }]

const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [shapes(zones)] }),
  ariaLabel: 'Zones',
})

const broken = graph.issues().flatMap((issue) => (issue.type === 'invalid-shape' ? [issue.key] : []))
console.log(broken, graph.count().shapes, graph.count().shown.shapes)
graph.view.fit({ shapes: ['flat'], duration: 300 })
```

Here `broken` is `['flat']`: a ring of two points is `'empty'`, `count().shapes` is 1 and `shown.shapes` is 0.

### Update and export

- Update shapes as any data (core skill): new arrays, new item objects, `graph.update({ definition })`. The geometry is read again only when the item is a new object and the geometry it returns is a new object, so change a zone by replacing the item with a new geometry. A `geometry` function that builds a new object on every call re-reads every shape of its mark on every update: return the stored object.
- `exportPng` and `exportSvg` draw shapes after the grid and under containers, hulls, edges and nodes, with the states, raised shapes, hidden shapes, zoom, time window and layers of the moment. `region: 'graph'` frames the shapes too (export skill).

### What is not there yet

Shapes have no labels, no `node` link (a shape that follows or wraps a node: use a hull), no dragging or editing, no keyboard focus, no anchor target, and they are not in the legend or the minimap. On a graph inside a MapLibre map they are counted but not drawn nor picked, with a warning once in development (`graph: shapes are not drawn on a map yet`): `count().shown.shapes` stays 0.

## Common Mistakes

### HIGH Importing `shapes` from the main entry

`shapes` lives in `@bruno00o/graph/shapes`. The main entry exports the types (`ShapeGeometry`, `ShapeMark`, `ShapeOptions`) and no function for it.

```ts expect-error=TS2305
import { shapes } from '@bruno00o/graph'

shapes([], {})
```

Import it from the sub-path, from the same copy of the package as `defineGraph`: a shape mark from another copy is refused by `defineGraph`.

### HIGH A decorative zone that swallows the pointer

By default every filled or stroked shape takes the pointer. A large backdrop under the graph then takes the clicks meant for the background: a click selects it instead of clearing the selection, its hover shows a pointer cursor, and a lasso can start on it. Give a mark that only decorates `pick: false`, and a large selectable zone `pick: 'stroke'`. The option belongs to a mark, so decoration and zones that people click are two marks (see Choose what takes the pointer).

Wrong:

```ts no-check
shapes([{ id: 'sea', geometry: { x: -800, y: -600, width: 1600, height: 1200 } }])
```

Correct:

```ts no-check
shapes([{ id: 'sea', geometry: { x: -800, y: -600, width: 1600, height: 1200 } }], { pick: false })
```

### HIGH Expecting labels on shapes

Shapes have no labels yet, and the option does not exist.

```ts expect-error=TS2769
import { type ShapeGeometry } from '@bruno00o/graph'
import { shapes } from '@bruno00o/graph/shapes'

type Zone = { id: string; title: string; geometry: ShapeGeometry }
const zones: Zone[] = []

shapes(zones, { label: 'title' })
```

Show the name from the item another way: an HTML tooltip from `pointerenter` and `target.datum.title`, or an anchor on a node placed in the zone (tools skill).

### HIGH Mixing degrees and world units

GeoJSON and `{ longitude, latitude }` points are projected to a world 512 units wide. Nodes placed with `x` and `y` live in your own world units, so a GeoJSON zone does not land around them: it sits in a 512-unit box near the origin. Place nodes with `longitude` and `latitude` too, or give the zones points in world units. On a graph without a map, both place and zone then use the same projection.

### MEDIUM Reading shape counts or keys on a graph without a shape mark

`count().shapes`, `count().shown.shapes` and `selection.get().shapes` exist only when the marks of the definition include a shape mark. Without one, a typed graph has neither and the shape keys you pass are ignored.

```ts expect-error=TS2339
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'

type Place = { id: string }
const places: Place[] = []
const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [nodes(places)] }),
  ariaLabel: 'Places',
})

console.log(graph.count().shapes)
```

### MEDIUM Treating every target that is not a node as an edge

With a shape mark, a typed target is a node, an edge or a shape. An untyped `GraphInstance` (a helper that takes the instance, `pick` on an untyped graph) says it may be any of the three, so an `else` after the node case holds shapes too. Narrow on `kind`, and give a `switch` a `case 'shape'`. The same goes for an exhaustive `switch (issue.type)`: add `'invalid-shape'`, or type the instance with its marks.

```ts expect-error=TS2339
import type { GraphInstance } from '@bruno00o/graph'

export function watch(graph: GraphInstance) {
  graph.on('click', ({ target }) => {
    if (target === null || target.kind === 'node') return
    console.log(target.endpoints)
  })
}
```

### MEDIUM Coordinates typed as `number[][]`

A point is `{ x, y }`, `{ longitude, latitude }` or an `[x, y]` tuple. Data typed `number[][][]` (typical of parsed JSON, or of points written in a `const` with no type) does not satisfy the tuple, so `shapes()` fails to compile, whether the field is named in `geometry` or is the default `geometry` field. Type the items (`const zones: Zone[]`), the rings with tuples, or the field with `ShapeGeometry`.

```ts expect-error=TS2769
import { shapes } from '@bruno00o/graph/shapes'

type Zone = { id: string; outline: { rings: number[][][] } }
const zones: Zone[] = []

shapes(zones, { geometry: 'outline' })
```

A GeoJSON `Polygon` typed with `coordinates: number[][][]` is accepted as it is.

### MEDIUM A state for nodes that also dims the zones

`others` crosses kinds: `focus: { others: { opacity: 0.2 } }` filled with a node dims the nodes, the edges and every zone outside it. When the zones must stay as they are, give `others` to the kinds that should fade: `{ nodes: { others: { opacity: 0.2 } }, edges: { others: { opacity: 0.2 } } }`. Likewise a state filled with a zone activates `others` for nodes and edges.

### MEDIUM Changing a shape in place

The graph reads a mark object once, and an item that is the same object as before is unchanged. Pushing a point into a ring, or assigning `zone.geometry = …`, changes nothing on screen.

Wrong:

```ts no-check
zones[0].geometry.rings[0].push([450, 0])
```

Correct:

```ts no-check
zones = [{ ...zones[0], geometry: { rings: [[...ring, [450, 0]]] } }, ...zones.slice(1)]
graph.update({ definition: defineGraph({ marks: [shapes(zones)] }) })
```

### MEDIUM Using a field name as a color

`fill`, `stroke`, `strokeWidth`, `dash` and `opacity` are styles, not channels: a string for `fill` or `stroke` is the CSS color itself, never a field of the item. Use a function: `fill: (zone) => zone.tone`.

### MEDIUM Expecting shapes on a map

`mountMapGraph` and `<MapGraph>` do not draw shapes yet, and the pointer does not see them. They are still counted: `count().shapes` is the number of items and `shown.shapes` is 0. Draw regions on a map with the map's own layers until shapes support it.

## Completion

The task is done when:

- `shapes` is imported from `@bruno00o/graph/shapes`, its marks are in `marks`, and keys are unique across shape marks;
- geometry uses one form of the table, in world units (or degrees with nodes placed by `longitude` and `latitude`), and is typed as `ShapeGeometry` or with tuples;
- a decorative mark has `pick: false`, and a zone that people select takes the pointer by its inside or by `pick: 'stroke'`;
- handlers narrow `target.kind` to `'shape'` before reading `datum`, and a `switch` over kinds or issue types has its `shape` and `invalid-shape` cases when the instance is untyped;
- dimming or hiding uses states with `others` by kind where only some kinds must change, and zoom, time and layer options are on the marks that need them;
- `graph.issues()` has no `invalid-shape` you did not expect, and `graph.count()` shows the shapes you drew;
- `tsc` accepts the code with no cast on targets, keys or geometry.

## References

Every page has a Markdown version: add `.md` to its URL.

- [Shapes](https://bruno00o.github.io/graph/docs/shapes), [shapes API](https://bruno00o.github.io/graph/docs/api/shapes), [Interaction](https://bruno00o.github.io/graph/docs/interaction), [States](https://bruno00o.github.io/graph/docs/states), [Zoom ranges](https://bruno00o.github.io/graph/docs/zoom), [Time](https://bruno00o.github.io/graph/docs/time), [Multilayer](https://bruno00o.github.io/graph/docs/multilayer), [TypeScript](https://bruno00o.github.io/graph/docs/typescript#shapes-in-targets-and-keys), [Upgrading](https://bruno00o.github.io/graph/docs/upgrading)
- Example: [shape zones](https://bruno00o.github.io/graph/examples/shape-zones)
- Related skills: tools (hulls and anchors), groups (containers), edges (waypoints), view, interaction, time, multilayer, export, map.
