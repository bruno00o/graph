---
name: core
description: >
  Use when drawing nodes and edges in the browser with @bruno00o/graph, with or
  without a framework: turning arrays of items and links into a graph with
  defineGraph, nodes() and edges(), mounting it with mountGraph, mapping fields to
  color, size and labels, typing the data so events and targets are typed,
  highlighting or fading sets of nodes with states, reacting to clicks and
  selection, replacing the data, and finding why a graph stays blank, misses
  edges or does not update. Load it before any other skill of this package; React
  apps load the react skill after it.
metadata:
  purpose: >
    The setup every task with @bruno00o/graph builds on: data and keys, marks and
    their channels, the definition, mounting, the instance API, states, events,
    data updates and data problems, with the mistakes that leave a graph blank,
    stale or untyped.
  type: core
  library: '@bruno00o/graph'
sources:
  - src/index.ts
  - src/define-graph.ts
  - src/marks.ts
  - src/types.ts
  - src/core/raw.ts
  - src/core/issues.ts
  - src/core/source-table.ts
  - src/core/live-source.ts
  - src/host/data-status.ts
  - src/host/graph-instance.ts
  - src/host/events.ts
  - docs/content/docs/(guide)/installation.mdx
  - docs/content/docs/(guide)/quick-start.mdx
  - docs/content/docs/(guide)/data.mdx
  - docs/content/docs/(guide)/states.mdx
  - docs/content/docs/(guide)/typescript.mdx
  - docs/content/docs/(guide)/vanilla.mdx
  - docs/content/docs/api/define-graph.mdx
  - docs/content/docs/api/mount-graph.mdx
  - docs/content/docs/api/graph-instance.mdx
  - docs/content/docs/api/events.mdx
---

# Draw a graph with @bruno00o/graph

A graph is a frozen definition (`defineGraph`) made of marks (`nodes()`, `edges()`, and `shapes()` for free areas and lines, from `@bruno00o/graph/shapes`: shapes skill), mounted into an element (`mountGraph`) that returns an instance. The instance drives everything at run time: view, selection, states, positions, events, updates. Rendering uses WebGL2, so it needs a browser.

## Setup

1. Install the package. It ships ES modules only, with its types.

   ```sh
   npm install @bruno00o/graph
   ```

2. Import the theme once, beside your global styles. Without it every color falls back to its light value. TypeScript checks this side-effect import against CSS module types: bundlers declare them (`vite/client`), otherwise add `declare module '*.css'` to a `.d.ts` file.

   ```ts no-check
   import '@bruno00o/graph/theme.css'
   ```

3. Give the container a size. The graph fills its container and never sizes itself; a container 0 pixels high shows nothing.

   ```css
   #graph {
     height: 480px;
   }
   ```

4. Define the marks, mount with an `ariaLabel` (required: it names the graph for assistive technologies), and keep the instance.

   ```ts
   import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

   type Item = { id: string; label: string; group: string; weight: number }
   type Link = { id: string; from: string; to: string }

   const items: Item[] = [
     { id: 'n1', label: 'Node 1', group: 'A', weight: 4 },
     { id: 'n2', label: 'Node 2', group: 'A', weight: 2 },
     { id: 'n3', label: 'Node 3', group: 'B', weight: 7 },
   ]
   const links: Link[] = [
     { id: 'e1', from: 'n1', to: 'n2' },
     { id: 'e2', from: 'n1', to: 'n3' },
   ]

   const definition = defineGraph({
     marks: [
       edges(links, { source: 'from', target: 'to', arrow: 'target' }),
       nodes(items, { color: 'group', size: 'weight', label: 'label' }),
     ],
     states: { muted: { opacity: 0.2, label: false } },
   })

   const container = document.querySelector<HTMLElement>('#graph')
   if (!container) throw new Error('No #graph element')
   const graph = mountGraph(container, { definition, ariaLabel: 'Sample graph' })

   graph.on('click', ({ target }) => {
     if (target?.kind !== 'node') return graph.states.clear('muted')
     const near = new Set([target.key, ...graph.neighbors(target.key)])
     graph.states.set('muted', { nodes: items.map((item) => item.id).filter((id) => !near.has(id)) })
   })
   ```

   Result: nodes colored by group and sized by weight, edges with arrows under them, the view fitted to the nodes with a 32 pixel margin. Marks draw in order, so edges listed first sit under the nodes. Pan, zoom, drag, click selection and keyboard navigation work without options. Nodes without `x` and `y` are placed in a spiral or next to their neighbors; for a real layout, pass `layout` to `defineGraph` (see the layout guide below).

In React, use `<Graph>` instead of `mountGraph`: load the react skill.

## Core Patterns

### Key the data

- Nodes are keyed by their `id` field. Without one, the `key` option is required: a field name or a function. Keys are strings or finite numbers.
- Edges are keyed the same way. `source` and `target` take the field holding a node key, or a function.
- An edge waits until both of its ends exist, then appears. Waiting edges are not errors: `graph.count().pending` counts them.

```ts
import { edges, nodes } from '@bruno00o/graph'

type Row = { code: number; name: string }
type Pair = { start: number; end: number; kind: string }

const rows: Row[] = [{ code: 1, name: 'One' }, { code: 2, name: 'Two' }]
const pairs: Pair[] = [{ start: 1, end: 2, kind: 'link' }]

const rowMark = nodes(rows, { key: 'code', label: 'name' })
const pairMark = edges(pairs, {
  key: (pair) => `${pair.kind}:${pair.start}:${pair.end}`,
  source: 'start',
  target: 'end',
})
```

### Map fields with channels, set constants with styles

One rule decides how an option reads its value:

- A **channel** (`color`, `size`, `label`, `x`, `y`, edge `width`) takes a field name or a function, and its value goes through a scale: categories get palette colors, numbers get a size range. Field names are checked against the item type.
- A **style** (`fill`, `stroke`, `opacity`, `shape`, `strokeWidth`, `outline`, edge `dash` and `arrow`) takes a constant or a function, never a field name, and its value is drawn as given. `fill` wins over `color`.
- A number literal (`size: 30`) and a function wrapped in `raw()` skip the scale.

```ts
import { edges, nodes, raw } from '@bruno00o/graph'

type Item = { id: string; label: string; group: string; weight: number; hex: string }
type Link = { id: string; from: string; to: string; strength: number }

const items: Item[] = []
const links: Link[] = []

const itemMark = nodes(items, {
  color: raw((item) => item.hex),
  size: 'weight',
  shape: 'diamond',
  opacity: (item) => (item.weight > 2 ? 1 : 0.5),
  label: 'label',
})
const linkMark = edges(links, { source: 'from', target: 'to', width: 'strength', stroke: '#888' })
```

Colors are CSS strings, resolved by the browser: hex, `var(--graph-cat-3)`, `color-mix(...)`. A CSS variable follows the light and dark theme.

### Name marks to tell their items apart

Give each mark a `name` when two marks of one kind exist. Targets carry it in `mark`, and comparing it narrows `datum` to that mark's item type. Type the arrays, never the call: `nodes<Item>(...)` stops the inference of `name`.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; label: string }
type Team = { id: string; title: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const teams: Team[] = []
const links: Link[] = []

const definition = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to' }),
    nodes(items, { name: 'item', label: 'label' }),
    nodes(teams, { name: 'team', label: 'title', shape: 'square' }),
  ],
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Items and teams' })

graph.on('click', ({ target }) => {
  if (target?.kind !== 'node') return
  if (target.mark === 'item') console.log(target.datum.label)
  if (target.mark === 'team') console.log(target.datum.title)
})
```

Node keys are shared across node marks: when two items share a key, the first one wins, in mark order then data order.

### Style sets of elements with states

Declare states in the definition, then set their members by key at run time. State names become types: a misspelled name does not compile.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; label: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const links: Link[] = []

const definition = defineGraph({
  marks: [edges(links, { source: 'from', target: 'to' }), nodes(items, { label: 'label' })],
  states: {
    near: { outline: 'var(--graph-accent)', others: { opacity: 0.2, label: false } },
    pinned: { outline: 'var(--graph-ink)', outlineWidth: 3 },
    selected: { stroke: 'var(--graph-cat-1)' },
  },
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })

graph.states.set('near', { nodes: ['n1', ...graph.neighbors('n1')] })
graph.states.add('pinned', { nodes: ['n2'] })
graph.states.remove('pinned', { nodes: ['n2'] })
graph.states.clear('near')
graph.selection.set({ nodes: ['n3'] })
graph.selection.clear()
```

- Style properties: `opacity`, `fill`, `stroke`, `strokeWidth`, `outline`, `outlineWidth`, `halo`, `label` (`true`, `false` or `'always'`), `labelColor`, `flow`, `raise`, `hide`, and `others`, the style of every element outside a state that has members.
- `selected`, `hovered` and `focused` are built in. Declaring one restyles it; their members change through `graph.selection` and user input, never `graph.states`.
- When several states set one property, the first wins: `selected`, `hovered`, `focused`, then your states in declaration order.
- A key may join a state before its element exists; the element takes the style when it arrives.
- A state holds `{ nodes, edges }` keys, and `shapes` too when the definition has a shape mark (shapes skill). The selection has the same lists.

### Listen to events

`graph.on(name, handler, { signal })` returns a function that unsubscribes. Payloads are typed from the marks.

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

const controller = new AbortController()
graph.on('selectionchange', ({ selection }) => console.log(selection.nodes), {
  signal: controller.signal,
})
const stop = graph.on('pointerenter', ({ target }) => {
  if (target.kind === 'edge') console.log(target.datum.from, target.endpoints)
})
stop()
controller.abort()
```

Events: `click`, `doubleclick`, `contextmenu`, `pointermove`, `pointerenter`, `pointerleave`, `dragstart`, `drag`, `dragend`, `positionchange`, `selectionchange`, `focuschange`, `foldchange`, `viewchange`, `timechange`, `layerchange`, `lenschange`, `issueschange`, `zoomhint`, `layoutstart`, `layoutend`, `loadingchange`.

A target is a node or an edge, plus `kind: 'shape'` when the definition has a shape mark. An untyped `GraphInstance` (a helper that takes the instance) may see all three kinds: narrow on `target.kind` before reading `endpoints` or `datum`.

### Replace the data

Build a new array, put new objects in it for the items that changed, build a new definition, and pass it to `update`. Positions, view, selection and states stay. Items kept as the same objects are not rewritten, so keep unchanged items as they are.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; label: string }
type Link = { id: string; from: string; to: string }

const linkOptions = { source: 'from', target: 'to' } as const
const itemOptions = { label: (item: Item) => item.label.toUpperCase() }

let items: Item[] = [{ id: 'n1', label: 'One' }]
let links: Link[] = []

const define = () =>
  defineGraph({ marks: [edges(links, linkOptions), nodes(items, itemOptions)] })

const graph = mountGraph(document.body, { definition: define(), ariaLabel: 'Sample graph' })

items = [...items.map((item) => (item.id === 'n1' ? { ...item, label: 'First' } : item)), { id: 'n2', label: 'Two' }]
links = [...links, { id: 'e1', from: 'n1', to: 'n2' }]
graph.update({ definition: define() })
```

Options are compared by content, so a rebuilt definition with equal options rewrites nothing. Functions compare by identity: declare them once, as `itemOptions` does, or every update restyles every item of the mark. Data that streams its changes (a TanStack DB collection) needs no `update`; see the data guide below.

### Read the instance

- `graph.store.get()` and `graph.store.subscribe(listener)` (a read-only TanStack Store): view, size, `hovered`, `focused`, `selection`, members of every state, layout status, and `positionsVersion`.
- Positions are not in the store: read `graph.positions.get(key)` when `positionsVersion` changes; move nodes with `graph.positions.set([[key, { x, y }]])`.
- Structure: `graph.neighbors(key)`, `graph.edgesOf(key)`, `graph.endpoints(edgeKey)`, `graph.datumOf({ kind: 'node', key })`, `graph.pick({ x, y })` (screen pixels).
- View: `graph.view.fit({ nodes: [key], duration: 400 })`, `graph.view.set(view)`, `graph.view.zoomBy(2)`.
- `await graph.drawn()` resolves after the next frame is drawn. It says nothing about live data: `await graph.loaded()` does (next section).

### Check the data

The graph never throws on bad data: it draws around each problem and lists it. `graph.issues()` returns the problems present now, `issueschange` fires when they change, and development builds log a warning per data change that brings new ones.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = [{ id: 'n1' }, { id: 'n1' }]
const links: Link[] = [{ id: 'e1', from: 'n1', to: 'n9' }]
const definition = defineGraph({
  marks: [edges(links, { source: 'from', target: 'to' }), nodes(items)],
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })

console.log(graph.issues().map((issue) => issue.type))
console.log(graph.count().pending)
```

Here `issues()` holds one `duplicate-key` and `count().pending` is 1: edge `e1` waits for node `n9`. Issue types: `missing-key`, `duplicate-key`, `missing-parent`, `parent-cycle`, `missing-carrier`, and `invalid-shape` for a shape whose geometry cannot be read (shapes skill). `missing-key` and `duplicate-key` also come with `kind: 'shapes'`. A typed graph has the shape issues only when it has a shape mark; the plain `GraphIssue` of an untyped instance always includes them, so an exhaustive `switch (issue.type)` needs a `case 'invalid-shape'`.

### Know when live data has loaded

A live source (a TanStack DB collection, a live query, `subset`, the sources of `createExploration`) may deliver its rows over time. The graph reads its `status` and `status:change` event with nothing to configure. Array data, and live sources without a `status`, are always loaded.

- `graph.store.get().data` is `{ loading, failed }`: `loading` is `true` while a live source of the current definition has not finished its first load, `failed` lists the sources whose load failed. A failure is never an issue: `graph.issues()` stays about the data. The graph keeps drawing what a failed source delivered.
- `loadingchange` fires when either changes, with the new `data`. In React, `onLoadingChange` or `useGraphState((state) => state.data)`.
- `await graph.loaded()` resolves once nothing loads and what the sources delivered is applied: `count()` and `issues()` are complete. It resolves at once when nothing loads, and also after a failure. It rejects once the graph is destroyed. It is not `drawn()`: a layout may still run, so wait for `layoutend` or `await graph.drawn()` after it if you need the picture.
- The graph draws no loading indicator: show your own from `data`.

```ts
import { defineGraph, type LiveSource, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'

type Item = { id: string; label: string }

declare const rows: LiveSource<Item>

const definition = defineGraph({
  marks: [nodes(rows, { label: 'label' })],
  layout: force(),
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Graph of live rows' })

const overlay = document.createElement('p')
overlay.setAttribute('role', 'status')
overlay.textContent = 'Loading'
overlay.hidden = !graph.store.get().data.loading
document.body.append(overlay)

graph.on('loadingchange', ({ loading, failed }) => {
  overlay.hidden = !loading
  if (!loading && failed.length > 0) overlay.textContent = 'Some data could not be loaded'
})

export async function whenComplete() {
  await graph.loaded()
  return graph.count().nodes
}
```

`waitForData` in `defineGraph` decides what waits. While a source loads, its batches are drawn as they come. The first automatic full layout (also after a new layout, or with `relayout`) and the automatic fits wait until every source has loaded or failed, so a collection that syncs in three batches is laid out once, on all its rows. The wait is 10,000 ms from the first nodes by default; when the time is up they run on what is there. `true` waits for as long as sources load, `false` or `0` runs on the first batch as array data does, a negative number or `NaN` throws a `RangeError`. Turn it off when the source never reports ready (a stream that stays open) or when a first picture matters more than a complete layout. An explicit `graph.layout.run()` and `graph.view.fit()` never wait. Nodes that arrive after the first layout are placed as before.

A live source of your own may report `status` (`'loading'`, `'loadingSubset'` or `'idle'` mean loading, `'error'` or `'crashed'` failed, anything else loaded) and `on('status:change', listener)` returning a stop function. A `status` that stays `'idle'` once loaded counts as loading until it changes. Leave both out when the source has no first load.

### Destroy

`graph.destroy()` removes the element, its listeners and its GPU resources. Or pass a `signal` to `mountGraph` and abort it. After `destroy`, reads return the last state and actions do nothing.

## Common Mistakes

### HIGH Changing the data array or its items in place

The graph does not read the same mark object twice, and an item that is the same object as before counts as unchanged. A `push` or an assignment to a field changes nothing on screen.

Wrong:

```ts no-check
items.push({ id: 'n4', label: 'Node 4' })
items[0].label = 'Renamed'
graph.update({ definition })
```

Correct:

```ts no-check
items = [{ ...items[0], label: 'Renamed' }, ...items.slice(1), { id: 'n4', label: 'Node 4' }]
graph.update({ definition: defineGraph({ marks: [edges(links, linkOptions), nodes(items, itemOptions)] }) })
```

Source: [Update the data](https://bruno00o.github.io/graph/docs/data#update-the-data).

### HIGH Passing a constant color to a channel

`color` is a channel: a field name or a function whose values go through the color scale. A CSS color there does not compile, and a function returning CSS colors draws palette colors, one per distinct value.

```ts expect-error=TS2769
import { nodes } from '@bruno00o/graph'

type Item = { id: string; group: string }
const items: Item[] = []

nodes(items, { color: 'tomato' })
```

Use the style `fill` (`stroke` on edges) for a constant or a per-item color, or `raw()` to keep `color` without a scale:

```ts
import { nodes, raw } from '@bruno00o/graph'

type Item = { id: string; group: string; hex: string }
const items: Item[] = []

const constant = nodes(items, { fill: 'tomato' })
const perItem = nodes(items, { color: raw((item) => item.hex) })
```

Source: [Channels and styles](https://bruno00o.github.io/graph/docs/marks#channels-and-styles).

### HIGH Laying out or fitting before the live data has loaded

A `layout.run()` or `view.fit()` written right after mounting sees the first batch only: `await graph.loaded()` first. The automatic layout and fit already wait (`waitForData`), so add your own only when you turned that off. `await graph.drawn()` does not wait for data: it resolves after one frame, loaded or not.

### HIGH A container without a height

The graph fills its container and never sets its own size. A container with no height (an empty `div`, a flex child that does not stretch) draws nothing. Development builds warn once when the container measures 0 pixels. Give it a height in CSS before mounting.

### MEDIUM Changing the selection through states

`selected`, `hovered` and `focused` are built in and excluded from `graph.states`, and a state name not declared in the definition does not compile.

```ts expect-error=TS2345
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
const items: Item[] = []
const definition = defineGraph({
  marks: [nodes(items)],
  states: { muted: { opacity: 0.2 } },
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })

graph.states.set('selected', { nodes: ['n1'] })
```

Use `graph.selection.set({ nodes: ['n1'] })` for the selection, and declare every free state in `states`.

### MEDIUM Writing the item type on the call

`nodes<Item>(items, { name: 'item' })` stops TypeScript from inferring the literal `name`: targets report `mark` as `string | undefined` and comparing it no longer narrows `datum`. Type the array (`const items: Item[]`) and let the call infer.

### MEDIUM New option functions on every update

Options are compared by content, but functions by identity. A `label: (item) => item.name` written inside the code that rebuilds the definition is a new function each time, and every item of its mark is restyled on each update. Declare such functions once, outside that code.

### MEDIUM Treating a waiting edge as a bug

An edge whose `source` or `target` names no node is not dropped and not reported: it waits for that node. When edges are missing on screen, compare `graph.count().edges` with `graph.count().pending`, and check that the key types match (`1` and `'1'` are different keys).

## Completion

The task is done when:

- the container has a non-zero size and the graph draws (`await graph.drawn()` resolves, nodes are visible);
- `graph.issues()` is empty, or holds only problems you expect;
- `graph.count()` gives the expected `nodes` and `edges`, and `pending` is 0 unless edges wait on purpose;
- `tsc` accepts the code with no `any` or cast on targets, events and state names;
- data changes go through new arrays, new item objects and `graph.update`, or through a live source;
- a graph over live sources that load shows its loading from `data` or `loadingchange`, and code that needs the complete data awaits `graph.loaded()`, not `drawn()`;
- every mounted graph is destroyed, or its `signal` aborted, when its page or component goes away.

## References

Every page has a Markdown version: add `.md` to its URL. The site documents the latest release.

- [Quick start](https://bruno00o.github.io/graph/docs/quick-start), [Installation](https://bruno00o.github.io/graph/docs/installation)
- [Data and live sources](https://bruno00o.github.io/graph/docs/data), [Marks and channels](https://bruno00o.github.io/graph/docs/marks), [States](https://bruno00o.github.io/graph/docs/states), [TypeScript](https://bruno00o.github.io/graph/docs/typescript), [Vanilla](https://bruno00o.github.io/graph/docs/vanilla)
- API: [defineGraph](https://bruno00o.github.io/graph/docs/api/define-graph), [nodes](https://bruno00o.github.io/graph/docs/api/nodes), [edges](https://bruno00o.github.io/graph/docs/api/edges), [mountGraph](https://bruno00o.github.io/graph/docs/api/mount-graph), [GraphInstance](https://bruno00o.github.io/graph/docs/api/graph-instance), [Events](https://bruno00o.github.io/graph/docs/api/events)
- Layouts, groups, shapes, edge drawing, maps, time, exports and integrations have their own guides in the [docs](https://bruno00o.github.io/graph/docs), and their own skills when this package ships them: run `intent list` to see which.
