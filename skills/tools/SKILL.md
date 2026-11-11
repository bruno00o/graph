---
name: tools
description: >
  Use when adding companions to a @bruno00o/graph graph, such as a minimap, a
  legend that filters, a magnifying lens, HTML pinned to nodes, hulls around sets
  of nodes, a background grid, or the TanStack Devtools panel.
metadata:
  purpose: >
    The tools drawn beside or over a @bruno00o/graph graph: minimap, legend,
    lens, anchored HTML, hulls, background grid and the devtools panel, how each
    one is created and destroyed, what it reads, and where it does not work.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/minimap/index.ts
  - src/legend/index.ts
  - src/legend/view.ts
  - src/host/lens.ts
  - src/host/anchors.ts
  - src/hulls.ts
  - src/devtools/index.ts
  - src/devtools/react.tsx
  - docs/content/docs/(guide)/minimap-and-legend.mdx
  - docs/content/docs/(guide)/lens.mdx
  - docs/content/docs/(guide)/drawing-layers.mdx
  - docs/content/docs/(guide)/devtools.mdx
  - docs/content/docs/api/minimap.mdx
  - docs/content/docs/api/legend.mdx
  - docs/content/docs/api/hull.mdx
  - docs/content/docs/api/devtools.mdx
  - docs/content/docs/api/anchor.mdx
requires:
  - core
---

# Add companions to a graph

Load the core skill first (`intent load @bruno00o/graph#core`): the graph, its definition and its states work as described there. Every tool here follows a mounted graph and is destroyed with it.

| Tool | Where it lives | Created with |
| --- | --- | --- |
| Minimap | Own entry `@bruno00o/graph/minimap` | `createMinimap(graph, options)` |
| Legend | Own entry `@bruno00o/graph/legend` | `createLegend(graph, options)` then `mountLegend(legend, options)` |
| Lens | Main entry | `interaction.lens` in the definition, `graph.lens.set(...)` |
| Anchored HTML | Main entry | `graph.anchors.set(element, options)` |
| Hulls | Main entry | `hull(...)` in `hulls` of the definition |
| Background grid | Main entry | `background` in the definition |
| Devtools | `@bruno00o/graph/devtools` and `/devtools/react` | `graphDevtoolsPlugin()` |

Not on a map: a graph drawn by `mountMapGraph` or `<MapGraph>` keeps legends, anchors, hulls and devtools, but has no minimap (`createMinimap` draws nothing and warns in development; the map has its own navigation), no lens (`graph.lens.set` does nothing and warns in development) and no background grid (the map draws the background). See the map skill.

## Setup

The companions need a mounted graph: one made by `mountGraph` (or `<Graph>`, `mountMapGraph`, `<MapGraph>`). Any other object throws an `Error`. In React, `<Minimap>`, `<Legend>` and `useLegend` read the graph of the enclosing `<Graph>`, or take a `graph` prop or option (see the react skill).

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { createLegend, mountLegend } from '@bruno00o/graph/legend'
import { createMinimap } from '@bruno00o/graph/minimap'

type Item = { id: string; name: string; group: string; weight: number }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const links: Link[] = []

const definition = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to' }),
    nodes(items, { color: 'group', size: 'weight', label: 'name' }),
  ],
  states: {
    match: { outline: 'var(--graph-accent)', label: true },
    faded: { opacity: 0.08, label: false, hide: true },
  },
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })

const minimap = createMinimap(graph, { corner: 'bottomRight', width: 200, height: 150 })

const legend = createLegend(graph, { highlight: 'match', hidden: 'faded' })
const view = mountLegend(legend, { titles: { color: 'Group', size: 'Weight' } })
document.body.append(view.element)
```

## Core Patterns

### Minimap

`createMinimap(graph, options)` draws the whole graph (its nodes, and its edges up to `maxEdges`; the shapes of a `shapes()` mark are not drawn) with the rectangle of the current view. Dragging the rectangle pans, pressing elsewhere centers the view there, and the wheel zooms.

- It sits in a `corner` of the graph element: `'topLeft'`, `'topRight'`, `'bottomLeft'` or `'bottomRight'` (default). With `corner: null`, it leaves `minimap.element` to you, to place anywhere in the page.
- `width` and `height` default to 200 by 150, and a value that is not above 0 falls back to the default. Other options: `margin`, `padding`, `maxEdges` (20,000: past it the minimap draws nodes only), `nodeSize`, `nodeColor`, `selectionColor`, `background`, `mask`, `viewColor`, `pan`, `zoom`. Colors are CSS colors, `--graph-*` tokens included, resolved with the theme.
- `minimap.update(options)` changes the options it is given and keeps the others; an option set to `undefined` returns to its default. `minimap.destroy()` removes it, and destroying the graph does too.
- It draws in a worker when the browser has workers and `OffscreenCanvas`, at a pace bounded by its cost; at 500,000 nodes it costs the page a few milliseconds. It draws nodes, group containers and edges, never labels, badges, hulls or the grid. It is hidden from assistive technologies and takes no focus.

```ts
import { createMinimap } from '@bruno00o/graph/minimap'

const placed = createMinimap(graph, { corner: null, width: 240, height: 160, nodeSize: 3 })
document.querySelector('#overview')?.append(placed.element)
placed.update({ width: 300, selectionColor: null })
```

In React, `<Minimap corner="bottomLeft" />` inside `<Graph>`; with `corner={null}` it renders a `div` where it stands. Example: [minimap options](https://bruno00o.github.io/graph/examples/minimap-options).

### Legend

The legend is read from the scales and the marks, not written; the shapes of a `shapes()` mark have no scale and no entry in it. `createLegend` keeps its state in a store; `mountLegend` renders it as plain HTML styled by the theme tokens.

- `legend.store.state` holds sections: `color` (categories with the nodes and edges drawn in each, or a ramp for a sequential scale), `size` and `width` (the ends of the domain and a rounded value between), `marks` (the sections of marks with `scales` of their own), `looks` (shapes, images and line patterns, shown for a kind of element drawn with more than one look), `layers`, `hovered` and `off` (the ids switched off).
- Raw colors (`raw()`) and `fill` or `stroke` colors have no category: those elements count only under their look. At most 64 categories are listed, plus the ones switched off.
- `mountLegend` writes no text of its own. Titles come from `titles`, values from `format`, looks from `lookText`, layers from `layerText`, and the scales of a mark from `markTitle` or its `name`. Pass `sections` to choose and order them. `view.destroy()` removes the legend element and leaves the legend itself. A helper that takes the graph types it `GraphInstance` (`import type { GraphInstance } from '@bruno00o/graph'`) or `ReturnType` of the function that mounts it. Items are toggle buttons unless `toggle: false`; `[data-graph-legend]` marks the element and `[data-item]` its items.
- Under the pointer or the keyboard focus, an item puts its elements in the `highlight` state; a click, Enter or Space switches it off, and its elements go to the `hidden` state. Both are **free states you declare** in the definition, and name in `createLegend`.
- `hidden` only restyles unless the state has `hide: true`: with `hide`, the elements of an off item disappear from the graph, keep their selection, and the item stays listed. Without a `hidden` state, switching off only changes `legend.store.state.off`, for you to filter the data with.
- `legend.hover(id)`, `toggle(id, off?)`, `only(id)` (the others of its section off), `reset()` and `keys(id)` drive the same behavior from a renderer of your own. `legend.update(options)` merges like the minimap. Destroying the legend empties its two states.

Filter the data from the legend when no `hidden` state is given:

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { createLegend } from '@bruno00o/graph/legend'

type Item = { id: string; group: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const links: Link[] = []

const define = (shown: readonly Item[]) =>
  defineGraph({
    marks: [edges(links, { source: 'from', target: 'to' }), nodes(shown, { color: 'group' })],
  })

const graph = mountGraph(document.body, { definition: define(items), ariaLabel: 'Sample graph' })
const legend = createLegend(graph)

let filtered = legend.store.state.off
legend.store.subscribe(() => {
  const { color, off } = legend.store.state
  if (off === filtered) return
  filtered = off
  const categories = color?.type === 'categories' ? color.items : []
  const hidden = new Set(categories.filter((item) => item.off).map((item) => item.value))
  graph.update({ definition: define(items.filter((item) => !hidden.has(item.group))) })
})
```

In React, `<Legend highlight="match" hidden="faded" titles={{ color: 'Group' }} />` inside `<Graph>`, or `useLegend` for a legend drawn by your components:

```tsx
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { Graph, Legend, Minimap, useLegend } from '@bruno00o/graph/react'

type Item = { id: string; name: string; group: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const links: Link[] = []
const definition = defineGraph({
  marks: [edges(links, { source: 'from', target: 'to' }), nodes(items, { color: 'group' })],
  states: { match: { outline: 'var(--graph-accent)' } },
})

function Swatches() {
  const { state, legend } = useLegend({ highlight: 'match' })
  if (state.color?.type !== 'categories') return null
  return state.color.items.map((item) => (
    <button key={item.id} type="button" onClick={() => legend?.toggle(item.id)}>
      {String(item.value)}
    </button>
  ))
}

export function Chart() {
  return (
    <Graph definition={definition} ariaLabel="Sample graph" style={{ height: 480 }}>
      <Minimap corner="bottomLeft" />
      <Legend titles={{ color: 'Group' }} highlight="match" />
      <Swatches />
    </Graph>
  )
}
```

Examples: [minimap and legend](https://bruno00o.github.io/graph/examples/minimap-and-legend), [legend of your own](https://bruno00o.github.io/graph/examples/custom-legend).

### Lens

A magnifier: a circle that draws the graph under it at a higher zoom, without moving the view and without distorting positions. Labels too small or crowded for the view appear in it, and picking inside it hits what it shows.

- Off by default. `interaction: { lens: true }` or `{ lens: { radius, zoom, key } }` in `defineGraph` shows it under the pointer while `key` is held (`'Alt'`, Option on a Mac, by default; `key: null` for code only). `radius` is in screen pixels (120), `zoom` multiplies the view zoom (3, at least 1). The wheel over the lens changes its magnification from 1 to 32.
- `graph.lens.set(input)` shows, moves or resizes it with or without the option; fields left out keep their value. `at` is a point in screen pixels relative to the graph element (a fixed lens, which you drag by its empty inside), `'pointer'` (follows the pointer, hides when it leaves) or `'focus'` (follows the keyboard-focused node). `set(null)` hides it. A non-finite `at`, `radius` or `zoom`, or a `radius` of 0 or less, throws a `RangeError`. `graph.lens.get()` returns the shown lens, or `null` when hidden, and `lens.toWorld(point)` converts a screen point through it. Each change emits `lenschange` and updates `lens` in the store.
- The lens leaves out exports and the minimap, never moves anchored HTML, and does not work on a map. On a touch screen, show it from a button of your application.

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; name: string }
const items: Item[] = []

const definition = defineGraph({
  marks: [nodes(items, { label: 'name' })],
  interaction: { lens: { radius: 140, zoom: 4, key: 'Alt' } },
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })

graph.lens.set({ at: { x: 200, y: 160 } })
graph.lens.set({ at: 'pointer', zoom: 5 })
graph.lens.set({ at: 'focus' })
graph.on('lenschange', ({ lens }) => console.log(lens?.zoom ?? 'hidden'))
graph.lens.set(null)
```

Example: [lens](https://bruno00o.github.io/graph/examples/lens).

### Anchored HTML

`graph.anchors.set(element, options)` pins an HTML element to the graph. The graph places it every frame with a CSS transform, so it follows pan, zoom and node moves with no code of yours. It returns a function that removes the element; `graph.anchors.remove(element)` does the same. Calling `set` again on the same element changes its options.

Give exactly one target:

| Option | Follows |
| --- | --- |
| `node` | A node, by key |
| `nodes` | The bounding box of several nodes, missing keys skipped |
| `state` | The bounding box of the nodes in a state, such as the selection |
| `edge` | The anchor of the edge label, halfway along the visible line |
| `point` | A point in world units |

- `when` (a state name) shows the element only while its node or edge is in that state, such as `'hovered'` or `'selected'`: a tooltip. It is accepted with `node`, `nodes` and `edge`, not with `point` or `state`. A state given to `state` or `when` must be declared in the definition, or be `selected`, `hovered` or `focused`; otherwise `set` throws.
- `side` is `'top'`, `'right'`, `'bottom'`, `'left'` or `'center'` (default), 4 pixels from the node edge and outline; `align` is `'start'`, `'center'` or `'end'` along that side; `offset` is a `{ x, y }` shift in screen pixels; `scale: true` makes the element grow with the zoom.
- The element is hidden while its target is gone or off screen. It keeps its own size (read with a `ResizeObserver`).
- Pointer events go through to the graph unless `interactive: true`, for buttons and menus. The wheel still goes to the graph unless the element under it can scroll, and keys pressed inside do not reach the graph shortcuts.
- Anchored elements are HTML over the canvas: no export draws them, and they stay above the lens.

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; name: string }
const items: Item[] = []

const definition = defineGraph({ marks: [nodes(items, { label: 'name' })] })
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })

const tooltip = document.createElement('div')
graph.on('pointerenter', ({ target }) => {
  if (target.kind !== 'node') return
  tooltip.textContent = String(target.key)
  graph.anchors.set(tooltip, { node: target.key, side: 'right', when: 'hovered' })
})

const menu = document.createElement('div')
graph.on('contextmenu', ({ target, world }) => {
  const at = target?.kind === 'node' ? { node: target.key } : { point: world }
  graph.anchors.set(menu, { ...at, side: 'right', align: 'start', interactive: true })
})
```

`target.datum` is typed from the marks in `pointerenter` and `click` handlers (read `target.datum.name` instead of the key for a label). The anchor stays in place after the pointer leaves, hidden by `when`, so one element is reused for every hover. In React, use `<Anchor>` inside `<Graph>` (react skill). Examples: [context menu](https://bruno00o.github.io/graph/examples/context-menu), [path costs](https://bruno00o.github.io/graph/examples/weighted-path).

### Hulls and the background grid

A hull is a shape drawn under edges and nodes around a set of nodes: build it with `hull()` and list it in `hulls`. It follows its nodes; for an area or a line with geometry of its own, such as a zone with a hole, use a `shapes()` mark (shapes skill). It encloses one of:

- a list of keys: `hull({ nodes: ['a', 'b'] })`, missing keys skipped;
- every node of a mark: `hull({ nodes: people })`, where `people` is **the same mark object** listed in `marks`;
- the nodes of a mark grouped by a field or function: `hull({ nodes: people, by: 'group' })`, one hull per value, with color options that may be functions of the value;
- the nodes in a state: `hull({ state: 'flagged' })`, which follows the state as it changes.

Options: `shape` (`'rounded'` default, `'smooth'` bends the sides outward), `padding` (screen pixels, 16), `color` (outline, and a 12% fill), `fill`, `stroke`, `strokeWidth` (screen pixels, 1, `0` for no outline). Without colors a hull uses `--graph-group-fill` and `--graph-group-line`. A negative or non-finite `padding` or `strokeWidth` throws a `RangeError`. Hulls follow their nodes through layouts, drags and transitions, are convex, may cover nodes of other sets, and are drawn in exports. Use a hull for any set of nodes, overlapping sets and states; use group containers (the groups skill) when the structure is in the data and the reader folds it.

`background: { grid: 'lines' | 'dots' }` draws a grid under everything that follows pan and zoom, in `--graph-grid` and `--graph-grid-major`. Lines fall on multiples of `spacing` (16, positive) times a power of 4 chosen by the zoom, and every fourth line is darker. `adaptive: false` keeps one level at `spacing` that grows and shrinks with the zoom and fades out when denser than about 8 pixels. The canvas stays transparent: the page paints `--graph-paper`.

```ts
import { defineGraph, edges, hull, nodes } from '@bruno00o/graph'

type Item = { id: string; name: string; group: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const links: Link[] = []

const people = nodes(items, { color: 'group', label: 'name' })

const definition = defineGraph({
  marks: [edges(links, { source: 'from', target: 'to' }), people],
  states: { flagged: { stroke: 'var(--graph-accent)' } },
  hulls: [
    hull({
      nodes: people,
      by: 'group',
      shape: 'smooth',
      padding: 24,
      color: (group) => (group === 'core' ? 'var(--graph-cat-1)' : 'var(--graph-cat-2)'),
    }),
    hull({ state: 'flagged', color: 'var(--graph-accent)' }),
    hull({ nodes: ['n1', 'n2'], strokeWidth: 0 }),
  ],
  background: { grid: 'dots', spacing: 20, adaptive: false, majorColor: 'var(--graph-grid)' },
})
```

Examples: [drawing layers](https://bruno00o.github.io/graph/examples/drawing-layers), [backgrounds](https://bruno00o.github.io/graph/examples/backgrounds).

### Devtools panel

`graphDevtoolsPlugin()` adds a Graph panel to TanStack Devtools: frame rate and timings, node, edge and shape counts, issues (shape problems included), selection, named states and layout runs, for every graph mounted on the page. A hovered shape shows as `shape <key>`; `messages.shapes`, `messages.shapeIssue` and `messages.shapeTarget` replace its texts. The graph measures nothing until a panel is open and visible.

```ts
import { graphDevtoolsPlugin } from '@bruno00o/graph/devtools'
import { TanStackDevtoolsCore } from '@tanstack/devtools'

const devtools = new TanStackDevtoolsCore({ plugins: [graphDevtoolsPlugin()] })
devtools.mount(document.body.appendChild(document.createElement('div')))
```

```tsx
import { graphDevtoolsPlugin } from '@bruno00o/graph/devtools/react'
import { TanStackDevtools } from '@tanstack/react-devtools'

const plugins = [graphDevtoolsPlugin()]

export function Devtools() {
  return <TanStackDevtools plugins={plugins} />
}
```

- `@tanstack/devtools` (vanilla) and `@tanstack/devtools-utils` (React entry) are optional peer dependencies: install them. Create the plugin once, outside the render, as above.
- Without the shell, `GraphDevtoolsPanel` (React) or `new GraphDevtoolsCore().mount(element, { theme })` render the panel anywhere. `theme` is `'dark'` or `'light'` (dark by default).
- Every text comes from `messages` (`title`, `number`, and the rest): pass only the ones to replace. Keep the `messages` object stable in React, since a new one mounts the panel again.
- Times are main-thread times, not GPU times. Leave the panel out of production builds like the rest of TanStack Devtools.

Example: [devtools](https://bruno00o.github.io/graph/examples/devtools).

## Common Mistakes

### HIGH A minimap or a lens on a map

The minimap does not support a graph drawn on a map, and `graph.lens.set` does nothing there: the map owns the camera and has its own navigation. Do not add them to `mountMapGraph` or `<MapGraph>`. The legend, anchors and hulls work on a map; the background grid is dropped.

### HIGH A legend state that the definition does not declare

`highlight` and `hidden` name free states. A name missing from `states` does not compile when the graph is typed, and throws an `Error` at run time otherwise. Declare the state with the style you want.

```ts expect-error=TS2322
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'
import { createLegend } from '@bruno00o/graph/legend'

type Item = { id: string; group: string }
const items: Item[] = []

const definition = defineGraph({
  marks: [nodes(items, { color: 'group' })],
  states: { faded: { opacity: 0.1 } },
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })

createLegend(graph, { highlight: 'match' })
```

Source: [createLegend](https://bruno00o.github.io/graph/docs/api/legend#errors).

### HIGH A `hidden` legend state that does not hide

A `hidden` state declared with only `opacity` fades the elements of an off item, it does not filter the graph. Add `hide: true` to filter: the elements disappear, keep their selection, and the item stays in the legend. Without a `hidden` state, read `legend.store.state.off` and filter the data yourself.

### HIGH A hull made from another mark object

`hull({ nodes: people })` matches the nodes of the mark **object** passed to `marks`. A second `nodes(items, ...)` call, or a mark rebuilt in a React render while the hull keeps the old one, encloses nothing. Keep one `people` constant for both, and a hull with no node draws nothing. A hull around a state needs that state declared: an undeclared name does not compile.

```ts expect-error=TS2322
import { defineGraph, hull, nodes } from '@bruno00o/graph'

type Item = { id: string }
const items: Item[] = []

defineGraph({
  marks: [nodes(items)],
  hulls: [hull({ state: 'flagged' })],
})
```

### MEDIUM `when` on a point or a state anchor

`when` shows an anchored element while its node or edge is in a state. A `point` or a `state` target takes none, and the types refuse it. A point anchor shows whenever the point is on screen; a state anchor shows while the state has nodes.

```ts expect-error=TS2345
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
const items: Item[] = []

const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [nodes(items)] }),
  ariaLabel: 'Sample graph',
})

graph.anchors.set(document.createElement('div'), { point: { x: 0, y: 0 }, when: 'hovered' })
```

### MEDIUM Expecting anchored HTML in an export

Anchors are HTML over the canvas, not part of the scene: `exportPng` and `exportSvg` leave them out, and so do the lens and the minimap. Hulls and the background grid are drawn in exports.

### MEDIUM A minimap with `corner: null` that is never placed

With `corner: null` the minimap is not added to the page: append `minimap.element` yourself (in React, `<Minimap corner={null} />` renders the `div`).

### MEDIUM The lens that never shows

`interaction.lens` is off by default. Turn it on and hold Alt (Option on a Mac) over the graph, or call `graph.lens.set(...)`. The key does nothing while a text field has the focus.

### MEDIUM Panel messages created in render

A new `messages` object passed to `GraphDevtoolsPanel` mounts the panel again at every render. Hoist it, as with the plugin.

## Completion

The task is done when:

- each companion is created from a mounted graph, once, and destroyed with it (nothing to clean up by hand except elements you placed yourself);
- the minimap and the lens are absent from map graphs;
- the states named by the legend, hulls and anchors are declared in `states`, and `hidden` has `hide: true` when it must filter;
- hulls use the mark constants listed in `marks`;
- the graph element is not covered by anchored HTML that should let pointer events through (`interactive` only for buttons and menus);
- `tsc` accepts the code with no cast.

## References

Every page has a Markdown version: add `.md` to its URL.

- Guides: [Minimap and legend](https://bruno00o.github.io/graph/docs/minimap-and-legend), [Lens](https://bruno00o.github.io/graph/docs/lens), [Drawing layers](https://bruno00o.github.io/graph/docs/drawing-layers), [TanStack Devtools](https://bruno00o.github.io/graph/docs/devtools)
- API: [createMinimap](https://bruno00o.github.io/graph/docs/api/minimap), [createLegend and mountLegend](https://bruno00o.github.io/graph/docs/api/legend), [hull](https://bruno00o.github.io/graph/docs/api/hull), [Devtools](https://bruno00o.github.io/graph/docs/api/devtools), [Anchor](https://bruno00o.github.io/graph/docs/api/anchor)
- The values a legend explains come from the scales: see the styling skill.
