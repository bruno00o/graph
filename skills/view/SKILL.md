---
name: view
description: >
  Use when framing, zooming or moving the @bruno00o/graph view from code: fitting
  the view to chosen nodes or edges, to a selection or a path, animating zoom and
  pan, choosing what the graph frames on its own (first data, layouts or nothing),
  limiting the zoom and the area people can reach, keeping the view in application
  state, converting between screen pixels and world units to place overlays or
  drop nodes, and showing nodes and edges only within a range of zoom (level of
  detail, clusters that give way to members). Gesture options such as the wheel
  belong to the interaction skill; a graph inside a MapLibre map does not use
  this skill's view limits and is covered by the map skill.
metadata:
  purpose: >
    The camera of a @bruno00o/graph graph: the view as a center and a zoom,
    fit and its options, the first view and automatic framing, view limits,
    the controlled view, screen and world coordinates, and the minZoom and
    maxZoom ranges of nodes and edges.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/types.ts
  - src/define-graph.ts
  - src/host/graph-instance.ts
  - src/host/events.ts
  - src/core/zoom-range.ts
  - docs/content/docs/(guide)/view.mdx
  - docs/content/docs/(guide)/zoom.mdx
  - docs/content/docs/api/graph-instance.mdx
  - docs/content/docs/api/define-graph.mdx
requires:
  - core
---

# Frame and move the view

Load the core skill first (`intent load @bruno00o/graph#core`): this skill assumes a mounted graph. The view is a center in world units and a zoom, `{ x, y, zoom }`. Zoom is screen pixels per world unit: at zoom 1, one world unit is one CSS pixel. It is in `graph.store.get().view`, changes emit `viewchange`, and `graph.view` moves it.

## Core Patterns

### Fit the view to what matters

`view.fit(options)` frames the nodes and edges named in the options, or every node when it names neither. An edge counts through its two ends as drawn, and a node hidden in a folded group frames that group.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; label: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const links: Link[] = []
const definition = defineGraph({
  marks: [edges(links, { source: 'from', target: 'to' }), nodes(items, { label: 'label' })],
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })

graph.view.fit()
graph.view.fit({ nodes: ['n1', 'n2'], padding: 64, maxZoom: 2, duration: 400 })
graph.view.fit({ padding: { right: 320 } })

const path = graph.paths.shortest('n1', 'n9')
if (path) graph.view.fit(path)
graph.view.fit({ ...graph.selection.get(), duration: 300 })
graph.on('doubleclick', ({ target }) => {
  if (target?.kind === 'node') graph.view.fit({ nodes: [target.key, ...graph.neighbors(target.key)] })
})
```

- `padding` is in screen pixels: a number for every side, or one margin per side to keep nodes clear of a panel over the graph. A side left out takes the `padding` of the `view` of the definition, 32 by default.
- `maxZoom` caps one fit, so a single node does not fill the screen. The `maxZoom` of the definition still applies.
- A path, the selection and the result of `graph.paths.reach` have the `{ nodes, edges }` shape and pass as they are.
- `fit({ nodes: [] })` frames nothing and does nothing.
- Called before the element has a size, `fit` waits for one, so a `fit` right after mount is fine, and it also steers the framing that follows the first layout run. To frame the result of a later layout run, give `fit` to `graph.layout.run` or set `autoFit: 'layouts'`.

### Zoom and move from code

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
const items: Item[] = []
const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [nodes(items)] }),
  ariaLabel: 'Sample graph',
})

const view = graph.view.get()
graph.view.set({ x: 0, y: 0, zoom: 2 }, { duration: 300 })
graph.view.zoomBy(1.5, { duration: 200 })
graph.view.zoomBy(1 / 1.5)
graph.on('viewchange', ({ view: next, origin }) => console.log(next.zoom, origin, view.zoom))
```

- Animated calls interrupt each other: the last one wins. `duration` is in milliseconds and is zero with `prefers-reduced-motion`.
- `zoomBy` multiplies the zoom around the center of the view. Every move, gestures and animation frames included, stays within the view limits.
- `x`, `y`, `zoom`, `factor` and `duration` must be finite, or the call throws a `RangeError` and changes nothing. `zoomBy` also needs a factor above 0.
- `viewchange` carries `origin`: `'user'` for gestures, the wheel, the keyboard and edge scrolling, `'api'` for `graph.view`, `update({ view })` and automatic framing. Use it to ignore your own moves.

### Choose what frames on its own

Without `initialView`, the graph fits every node as soon as its first data arrives (an empty graph waits), and keeps the nodes framed while the first layout moves them, until the view is moved. Later data never moves the view. A gesture, the wheel or a key before the first fit cancels it. `autoFit` in the `view` of the definition changes this:

- `'first'`, the default: the first data and the first layout run.
- `'layouts'`: also the end of every layout run, as long as the view has not moved since the last fit. A gesture, `view.set` or `view.zoomBy` stops it; the next `view.fit` starts it again.
- `'never'`: the view stays where it starts.

`initialView` in the options of `mountGraph` starts somewhere else, within the limits.

### Limit the zoom and the area

```ts
import { defineGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
const items: Item[] = []

const margin = defineGraph({
  marks: [nodes(items)],
  view: { minZoom: 0.1, maxZoom: 8, bounds: { margin: 120 }, padding: { left: 280, top: 16 } },
})
const rectangle = defineGraph({
  marks: [nodes(items)],
  view: { bounds: { minX: -1000, minY: -600, maxX: 1000, maxY: 600 } },
})
```

- `minZoom` and `maxZoom` are 0.001 and 64 by default; `minZoom` must not exceed `maxZoom`, or `defineGraph` throws a `RangeError`.
- `bounds` is a rectangle in world units, or `{ margin }`: the box of every node grown by `margin` screen pixels, so the graph cannot be pushed off screen. Where the area is narrower than the view, for instance zoomed out, the area cannot leave the view but floats inside it.
- Bounds apply when the view moves, when the element is resized and when the definition changes, not when data changes.

### Control the view from application state

Pass `view` at mount, with `onViewChange`: the graph then draws only the view you give it. Gestures, keys, `view.set`, `fit`, `zoomBy` and every frame of their animations become requests (within the limits) that reach `onViewChange` at most once per frame. Apply, change or drop each one with `update({ view })`.

```ts
import { defineGraph, mountGraph, nodes, type View } from '@bruno00o/graph'

type Item = { id: string }
const items: Item[] = []
const definition = defineGraph({ marks: [nodes(items)] })

let view: View = { x: 0, y: 0, zoom: 1 }
const graph = mountGraph(document.body, {
  definition,
  ariaLabel: 'Sample graph',
  view,
  onViewChange: (event) => {
    view = { ...event.view, y: 0 }
    graph.update({ view })
  },
})
```

- A view applied inside `onViewChange` is drawn in the same frame, so a controlled view follows the pointer without lag. An application that answers later still gets smooth gestures: each request starts from the last one not answered yet.
- The mode is fixed at mount. A graph mounted without `view` ignores `update({ view })`; one mounted with `view` stays controlled for its whole life. In React, pass the `view` and `onViewChange` props of `<Graph>` from the first render (see the react skill).
- A controlled graph does not run its first automatic fit: give `view` the starting view, and call `view.fit` yourself for a first framing. `viewchange` fires only when an applied view differs from the current one.
- Fits and animations are requests too, frame by frame, so a handler that rewrites part of the view (here `y: 0`) rewrites it for every animation frame and the fit lands with that part forced.
- `graph` is used inside its own `onViewChange`: that is valid, the handler runs after the assignment.
- A request that is never applied freezes the gesture: `onViewChange` must call `update({ view })` with a view, even the unchanged one.

### Convert between screen and world

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
const items: Item[] = []
const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [nodes(items)] }),
  ariaLabel: 'Sample graph',
})
const tooltip = document.createElement('div')

const point = graph.positions.get('n1')
if (point) {
  const { x, y } = graph.view.toScreen(point)
  tooltip.style.transform = `translate(${x}px, ${y}px)`
}
graph.on('click', ({ point: screen, world }) => console.log(screen, world, graph.view.toWorld(screen)))
```

`toScreen` and `toWorld` are relative to the graph element, in CSS pixels, and `positions.get` returns a position even for a node hidden by zoom, time or state. To type a function parameter as the instance, use `typeof graph`, or `GraphInstance` from the package for an untyped instance. Pointer events already carry `point` (screen) and `world`. To keep an element on a node without any per-frame code, use `graph.anchors.set` (or `<Anchor>` in React) instead of converting by hand.

### Show elements only within a zoom range

`minZoom` and `maxZoom` on `nodes()` and `edges()` are styles (a constant or a function of the item) in the same unit as the view zoom. An element is hidden at and below `minZoom` and at and above `maxZoom`; `null`, `0` or no option means no limit. So a limit of 1.3 shows the element above 1.3, fading in until about 1.55 (`1.3 * 2 ** 0.25`), not from exactly 1.3. Inside its range it fades in and out over a quarter of a zoom doubling (about 19 percent of zoom).

```ts
import { defineGraph, edges, nodes, raw } from '@bruno00o/graph'

type Item = { id: string; label: string; tier: 'root' | 'branch' | 'leaf'; diameter: number }
type Link = { id: string; from: string; to: string }
type Cluster = { id: string; diameter: number }

const items: Item[] = []
const links: Link[] = []
const overview: Link[] = []
const clusters: Cluster[] = []

const detail = defineGraph({
  marks: [
    edges(overview, { source: 'from', target: 'to', dash: 'dashed', maxZoom: 0.9 }),
    edges(links, { source: 'from', target: 'to' }),
    nodes(items, {
      size: 'diameter',
      label: 'label',
      minZoom: (item) => (item.tier === 'leaf' ? 1.3 : item.tier === 'branch' ? 0.55 : null),
    }),
  ],
})

const handover = 0.9
const fade = 2 ** 0.25
const swap = defineGraph({
  marks: [
    nodes(clusters, { size: raw((cluster) => cluster.diameter), maxZoom: handover * fade }),
    nodes(items, { size: 12, minZoom: handover / fade }),
  ],
})
```

- Hidden means gone, not transparent: an edge is hidden while one of its ends is; a hidden node hides its label, badges and anchors; nothing hidden is picked, lassoed, focused from the keyboard, counted by the legend, drawn by the minimap or wrapped by a hull; exports draw what is shown at their zoom.
- A hidden element stays in the data, the selection and the states. Layouts still place it and `view.fit` still frames it, so the graph does not jump when elements appear.
- To hand one mark over to another at zoom `t`, move each limit by the fade: the outgoing mark stops at `t * 2 ** 0.25`, the incoming one starts at `t / 2 ** 0.25`. With `t` on both, neither shows at `t`.
- Inside a group, each node follows its own range: a hidden container does not hide its children. A merged edge between folded groups takes its range from the `aggregate` options of its mark, or else from its first merged edge.
- Groups do not fold on their own with the zoom. Fold and unfold them on `viewchange` with two thresholds, so a zoom near one threshold does not flip back and forth:

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; parent?: string }
const items: Item[] = []
const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [nodes(items, { parent: 'parent' })] }),
  ariaLabel: 'Sample graph',
})

let folded = graph.groups.folded().length > 0
graph.on('viewchange', ({ view }) => {
  if (!folded && view.zoom < 0.4) graph.groups.fold()
  else if (folded && view.zoom > 0.6) graph.groups.unfold()
  else return
  folded = !folded
})
```

- A size in screen pixels as a floor: to show a node once it is at least 6 pixels wide, set `minZoom: (item) => 6 / item.diameter` and draw its diameter as given with `size: raw((item) => item.diameter)`.

## Common Mistakes

### HIGH Passing a list of keys to `view.fit`

`fit` takes options, not keys. A list does not compile, and untyped code throws a `TypeError` (`graph: view.fit takes options, such as { nodes }`).

```ts expect-error=TS2559
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
const items: Item[] = []
const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [nodes(items)] }),
  ariaLabel: 'Sample graph',
})

graph.view.fit(['n1', 'n2'])
```

Write `graph.view.fit({ nodes: ['n1', 'n2'] })`. A `Set` of keys goes in `nodes` too.

### HIGH Updating the view of a graph that is not controlled

`update({ view })` only moves a graph mounted with `view`. On any other graph it does nothing and raises no error. Move an uncontrolled graph with `graph.view.set`; make it controlled by passing `view` and `onViewChange` at mount, before the first render in React, because the mode never changes afterwards.

### HIGH Ignoring a request of a controlled view

In controlled mode a gesture changes nothing until `onViewChange` answers with `update({ view })`. A handler that only logs, or that sets state without reaching `update` (a React parent that does not render the new `view` prop), leaves the graph frozen: no pan, no zoom, no fit.

### MEDIUM Reading the zoom of a mark as the zoom limits of the view

The `minZoom` and `maxZoom` of `nodes()` and `edges()` decide when an element shows. The ones in the `view` of `defineGraph` limit where people can zoom. They share a unit, not a meaning: setting a mark's `maxZoom` does not stop anyone zooming in, and `view.maxZoom` hides nothing.

### MEDIUM The same zoom on both sides of a handover

An outgoing mark with `maxZoom: t` and an incoming one with `minZoom: t` leave a gap: both are faded out at `t`. Offset the limits by the fade (`2 ** 0.25`), as shown above, so one of them is always fully drawn.

### MEDIUM Fitting while a layout run is still moving nodes

`graph.layout.run()` resolves when the run ends, but a `view.fit()` called right after launching it frames the positions of that moment, and the nodes end up elsewhere. Pass `fit: true` or fit options to `layout.run` (it frames the result), or set `autoFit: 'layouts'` in the `view` of the definition and let the graph follow every run until the view is moved.

### MEDIUM Setting `view` limits or `padding` on a map

On a graph drawn by `mountMapGraph`, the map owns the camera and its limits: `minZoom`, `maxZoom`, `bounds`, `padding` and `autoFit` of the definition change nothing, `update({ view })` is ignored, and each `fit` takes its own `padding`. See the map skill.

## Completion

The task is done when:

- every `fit` call passes an options object (`{ nodes }`, `{ edges }`, a path or a selection), never a list;
- limits, `padding` and `autoFit` live in the `view` of `defineGraph`, and none of them is set for a map graph;
- a controlled view is mounted with both `view` and `onViewChange`, and the handler always calls `update({ view })`;
- elements that show by zoom use `minZoom` and `maxZoom` on the marks, with handovers offset by `2 ** 0.25`;
- `tsc` accepts the code with no cast on `View`, targets or options.

## References

Every page has a Markdown version: add `.md` to its URL.

- [View and camera](https://bruno00o.github.io/graph/docs/view), [Zoom and level of detail](https://bruno00o.github.io/graph/docs/zoom), [GraphInstance](https://bruno00o.github.io/graph/docs/api/graph-instance), [defineGraph](https://bruno00o.github.io/graph/docs/api/define-graph)
- Examples: [view controls](https://bruno00o.github.io/graph/examples/view-controls), [click to zoom](https://bruno00o.github.io/graph/examples/click-to-zoom), [controlled view](https://bruno00o.github.io/graph/examples/controlled-view), [edges by zoom](https://bruno00o.github.io/graph/examples/edges-by-zoom), [groups that open with the zoom](https://bruno00o.github.io/graph/examples/zoom-clusters)
- Wheel, pinch and keyboard zoom are options of the interaction skill.
