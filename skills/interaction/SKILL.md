---
name: interaction
description: >
  Use when configuring how people work with a @bruno00o/graph graph: selection
  modes, node drag, the lasso, what the wheel and a trackpad do (zoom, pan or
  scroll the page), touch, auto-pan, turning gestures off, keyboard navigation and
  focus; reacting to clicks, hovers, drags and the pointer; controlling the
  selection from application state; and styling states beyond a basic highlight:
  fading everything outside a state, drawing members above the rest, hiding
  members, always showing their labels, or styling nodes, edges and shapes apart. The
  first graph, plain states and event basics are in the core skill; moving the
  view from code is in the view skill.
metadata:
  purpose: >
    The interaction model of a @bruno00o/graph graph: the interaction options of
    defineGraph, selection and its controlled mode, drag and lasso, wheel,
    touch and keyboard, pointer events and their targets, and the advanced
    state styles others, raise, hide and label always.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/types.ts
  - src/define-graph.ts
  - src/host/events.ts
  - src/host/graph-instance.ts
  - src/host/keyboard.ts
  - src/host/selection-control.ts
  - src/host/element-keys.ts
  - src/core/state-names.ts
  - docs/content/docs/(guide)/interaction.mdx
  - docs/content/docs/(guide)/states.mdx
  - docs/content/docs/api/events.mdx
  - docs/content/docs/api/define-graph.mdx
requires:
  - core
---

# Configure interaction and states

Load the core skill first (`intent load @bruno00o/graph#core`): it covers marks, `graph.on`, `graph.states` and the built-in states. This skill covers the options that shape gestures and the selection, the events people trigger, and the state styles that go beyond a highlight. Everything is on by default except the lasso and the lens.

## Core Patterns

### Set the interaction options

Options live in the `interaction` of `defineGraph`; every value below is the default except where noted.

```ts
import { defineGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
const items: Item[] = []

const definition = defineGraph({
  marks: [nodes(items)],
  interaction: {
    pan: true,
    zoom: { speed: 1 },
    wheel: 'zoom',
    autoPan: { speed: 1 },
    select: 'multiple',
    drag: true,
    lasso: false,
    keyboard: true,
    fold: true,
    lens: false,
  },
})
```

- `select`: `'multiple'` (Shift, Cmd or Ctrl adds or removes), `'single'`, or `false` for none.
- `zoom` and `autoPan` take `true`, `false`, or `{ speed }` (a finite number, 0 or more, or `defineGraph` throws a `RangeError`).
- `wheel` is `'zoom'`, `'pan'` or `'page'`; anything else throws a `TypeError`.
- `fold` makes a double click on a group, or Enter on a focused group, fold it. `lens` belongs to the tools skill.
- The zoom range and the reachable area are not here: they are the `view` of `defineGraph` (view skill).

### Select, and control the selection

A click selects the element alone; with `'multiple'` (the default), Shift, Cmd or Ctrl adds it or removes it; a click on the background clears. A click on a merged edge selects all the edges it merges, or, with `halves` (groups skill), the edges of the direction under the pointer. A click on a shape (shapes skill) selects it the same way, after nodes, edges and containers drawn over it. A press released within 4 pixels (10 for a touch) is a click. Read and change the selection from code:

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
const items: Item[] = []
const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [nodes(items)] }),
  ariaLabel: 'Sample graph',
})

graph.selection.set({ nodes: ['n1', 'n2'] })
const { nodes: selectedNodes, edges: selectedEdges } = graph.selection.get()
graph.selection.clear()
graph.on('selectionchange', ({ selection }) => console.log(selection.nodes, selection.edges, selectedNodes, selectedEdges))
```

`selectionchange` fires for every change, from a person or from code, with the whole selection in the order keys joined it.

To keep the selection in your own state, pass `selection` at mount with `onSelectionChange`. From then on a click, `selection.set` and `clear` change nothing: they call `onSelectionChange` with the selection they ask for, and only `update({ selection })` applies one.

```ts
import { defineGraph, type ElementKeysInput, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
const items: Item[] = []
const definition = defineGraph({ marks: [nodes(items)] })

let selection: ElementKeysInput = { nodes: [] }
const graph = mountGraph(document.body, {
  definition,
  ariaLabel: 'Sample graph',
  selection,
  onSelectionChange: ({ selection: next }) => {
    selection = { ...next, nodes: next.nodes.slice(0, 3) }
    graph.update({ selection })
  },
})
```

- Each request starts from the last request not answered yet, so two quick Shift-clicks before an answer ask for both elements.
- The mode is fixed at mount. A graph mounted without `selection` ignores `update({ selection })`. In React, pass `selection` and `onSelectionChange` from the first render (react skill).
- An element removed from the data leaves the selection, and `onSelectionChange` reports it.
- The selection is not a free state: change it with `graph.selection`, never `graph.states`.
- With a shape mark, the selection and `ElementKeysInput` carry a `shapes` list beside `nodes` and `edges`: keep it when you rewrite the selection (`{ ...next, nodes: [...] }` does). Without a shape mark, `shapes` keys are ignored.

### React to pointer events

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; label: string }
type Link = { id: string; from: string; to: string }
const items: Item[] = []
const links: Link[] = []
const graph = mountGraph(document.body, {
  definition: defineGraph({
    marks: [edges(links, { source: 'from', target: 'to' }), nodes(items, { label: 'label' })],
  }),
  ariaLabel: 'Sample graph',
})

const controller = new AbortController()
graph.on('click', ({ target, point, world }) => console.log(target?.key, point, world), {
  signal: controller.signal,
})
graph.on('doubleclick', ({ target, originalEvent }) => {
  if (target?.kind === 'node') originalEvent.preventDefault()
})
graph.on('contextmenu', ({ target, originalEvent }) => {
  originalEvent.preventDefault()
  console.log(target)
})
graph.on('pointerenter', ({ target }) => {
  if (target.kind !== 'edge') return
  const from = graph.datumOf({ kind: 'node', key: target.endpoints.source })
  console.log(from)
})
graph.on('pointermove', ({ target, world }) => console.log(target?.key ?? world.x))
graph.on('dragend', ({ keys }) => console.log(keys))
controller.abort()
```

- `target` is `{ kind, key, datum, mark }`, with `kind` `'node'`, `'edge'`, or `'shape'` when the definition has a shape mark (a shape under the pointer never beats a node, an edge or a container drawn over it). It is `null` over the background for `click`, `doubleclick`, `contextmenu` and `pointermove`, and never `null` for `pointerenter` and `pointerleave`. An edge target also has `endpoints` (the key of a folded group stands for an end hidden in it), `end` (`'source'` or `'target'`) on a mark with `ends`, and `aggregate` (every merged edge, split into `forward` and `backward`) on a merged edge or an edge between folded groups. On a half of a two-way merged edge (`merge: { directed: false, halves: true }`), `direction` is `'forward'` for the half next to `aggregate.target` and `'backward'` for the half next to `aggregate.source`; `key` and `datum` are those of the first edge of that direction. Hover enters and leaves per half too (`pointerleave` then `pointerenter` when the pointer crosses from one half to the other).
- `click` fires before the default selection, so a handler sees the selection as it was. A `doubleclick` on a group folds it after the handlers run, unless one calls `originalEvent.preventDefault()`.
- `pointermove` fires at most once per frame; the graph tracks the pointer for it only while a handler is subscribed. During a drag its target is the dragged node.
- `dragstart`, `drag` and `dragend` carry `keys`: every moved node (the whole selection when the dragged node is selected, the nodes inside a dragged group). `positionchange` reports the positions, with `origin` `'drag'`, `'api'` or `'layout'`.
- A handler that throws stops neither the other handlers nor the click: its error goes to `reportError`. A handler may destroy the graph; the graph then does nothing more for that event.
- Pass a `signal` to remove handlers together. `graph.signal` aborts when the graph is destroyed: give it to listeners you add elsewhere.

### Drag and lasso

Dragging a node starts after 4 pixels and emits no click. Dragging a selected node moves the whole selection, and a group's container moves its children. During a layout run, a dragged node stays where it is dropped and the others settle around it. Dragging a shape pans the view like the background, and a double click on a shape does nothing.

`lasso: true` with `select: 'multiple'` draws a lasso with Shift and a drag from the background, or from a shape; the nodes inside join the selection on release, and so do the shapes whose every point is inside (never a shape that contains the lasso). Edges are not taken. Without the lasso, Shift and drag pans. A long press never starts a lasso, and Escape cancels one in progress.

### Choose what the wheel does

| `wheel` | Wheel or two-finger scroll | Cmd or Ctrl and wheel, trackpad pinch |
| --- | --- | --- |
| `'zoom'` (default) | Zooms around the pointer | Zooms |
| `'pan'` | Moves the view (sideways with Shift on a mouse wheel) | Zooms |
| `'page'` | Scrolls the page | Zooms |

Use `'zoom'` for a graph that fills the window, `'pan'` for trackpads, `'page'` for a graph inside a page that scrolls, so the wheel never traps the reader. In `'page'` mode each wheel event left to the page emits `zoomhint` with `key` (`'Meta'` on Apple systems, `'Control'` elsewhere): the graph shows no text, so show your own hint.

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
const items: Item[] = []
const hint = document.createElement('p')
const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [nodes(items)], interaction: { wheel: 'page' } }),
  ariaLabel: 'Sample graph',
})

let timer: ReturnType<typeof setTimeout> | undefined
graph.on('zoomhint', ({ key }) => {
  hint.textContent = key === 'Meta' ? 'Hold Cmd and scroll to zoom' : 'Hold Ctrl and scroll to zoom'
  hint.hidden = false
  clearTimeout(timer)
  timer = setTimeout(() => {
    hint.hidden = true
  }, 1500)
})
```

Wheel lines and pages (Firefox) are converted to pixels. With `zoom: false`, wheel events go to the page. A pinch on a trackpad zooms in every mode.

### Touch, auto-pan and turning gestures off

- Touch: one finger pans and drags like the mouse, two fingers pinch (zoom by the distance, move by the midpoint). A second finger ends a node drag or a lasso. A tap selects like a click. The canvas sets `touch-action: none`, so the page does not scroll under the graph.
- Auto-pan: while a node drag or a lasso is within 40 pixels of the element's edge, the view scrolls toward it, faster closer. `autoPan: false` turns it off; it needs `pan`.
- `pan: false` and `zoom: false` stop people moving or zooming the view by pointer, fingers, wheel and keyboard alike. Your code still moves it with `graph.view` and `graph.focus.set`, which keeps the view fixed while a script tours the graph.

### Navigate with the keyboard

With `keyboard: true` the element is focusable (`tabindex="0"`, `role="application"`). Keys from a child element, such as an input in an overlay, are ignored.

| Key | Action |
| --- | --- |
| Arrow keys | Move the focus to the nearest node in that direction |
| Enter or Space | Select the focused node; with Shift, Cmd or Ctrl, add it |
| Enter on a group | Fold or unfold it, with `fold: true` |
| Escape | Cancel the lasso, then clear the selection, then remove the focus |
| Shift and arrows | Pan the view by a tenth of its size, with `pan: true` |
| `+` and `-` | Zoom in and out, with `zoom: true` |
| `0` | Fit the whole graph, with `pan` and `zoom` both true |

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; label: string }
const items: Item[] = []
const graph = mountGraph(document.body, {
  definition: defineGraph({ marks: [nodes(items, { label: 'label' })] }),
  ariaLabel: 'Sample graph',
})

graph.focus.set({ kind: 'node', key: 'n3' })
const focused = graph.focus.get()
graph.on('focuschange', ({ target }) => console.log(target, focused))
graph.focus.set(null)
```

- Without a focused node, arrows start from the last selected node, or the node nearest the center. The view follows the focused node when it comes within 48 pixels of the edge, with `pan: true`.
- A pointer press removes the focus; losing DOM focus remembers it and gives it back with the keyboard. `focus.set` also moves DOM focus when the keyboard is on, and an unknown key changes nothing.
- The focused node's label (or its key) is announced to screen readers through a live region. Hidden elements, by zoom, time, layer or state, are skipped.

### Style states beyond a highlight

A state style takes `opacity`, `fill`, `stroke`, `strokeWidth`, `outline`, `outlineWidth`, `halo`, `label`, `labelColor`, `flow`, `raise`, `hide` and `others`. Declare states in `defineGraph({ states })` and fill them by key (core skill). On a shape only `opacity`, `fill`, `stroke`, `strokeWidth`, `raise`, `hide` and `others` apply (shapes skill). These properties are the ones to reach for:

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; label: string }
type Link = { id: string; from: string; to: string }
const items: Item[] = []
const links: Link[] = []

const definition = defineGraph({
  marks: [edges(links, { source: 'from', target: 'to' }), nodes(items, { label: 'label' })],
  states: {
    path: {
      stroke: 'var(--graph-accent)',
      strokeWidth: 2.5,
      label: true,
      raise: true,
      others: { opacity: 0.15, label: false },
    },
    landmark: { label: 'always' },
    off: { hide: true },
    only: { others: { hide: true } },
    near: {
      nodes: { outline: 'var(--graph-accent)', others: { opacity: 0.12, label: false } },
      edges: { stroke: 'var(--graph-accent)', strokeWidth: 2, others: { opacity: 0.12 } },
    },
    hovered: { others: { opacity: 0.3 } },
  },
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })

graph.states.set('path', graph.paths.shortest('n1', 'n9') ?? {})
graph.states.set('landmark', { nodes: ['n2', 'n3'] })
graph.states.set('only', graph.paths.reach('n1', { maxCost: 2 }))
graph.states.clear('path')
```

- To light a hovered node, its neighbors and the edges among them, fill a free by-kind state on `pointerenter` and clear it on `pointerleave`: nodes are the hovered key and `graph.neighbors(key)`, edges are the `graph.edgesOf(key)` of each of those nodes whose two `graph.endpoints` are in the node set (or `graph.paths.reach(key, { maxCost: 1 })`, which returns `{ nodes, edges }`). A built-in `hovered: { others }` only spares the hovered element itself.
- `others` styles every element outside the state, as long as the state has at least one member (a key whose element does not exist yet does not count). It takes the same properties except `raise` and `others`. Setting members costs the same with or without `others`.
- A state of edges also fades the nodes outside it, its own ends included, and the shapes too: a member of any kind activates `others` for every kind. Put the ends in the state, or style by kind: `{ nodes, edges, shapes }`, each a full style, with `others` applying to that kind only. A style is by kind or for both, never mixed (`{ opacity: 0.2, nodes: {} }` does not compile). A kind left out has no style, or its default for built-in states.
- `raise: true` draws members above every mark, labels them first and picks them first, in exports too. It is `true` for `selected`, `hovered` and `focused`; `raise: false` draws them in place. It costs one more draw of the raised elements. A raised shape comes first only among shapes: it stays under containers, hulls, edges and nodes.
- `label: 'always'` shows a label at every zoom (8 pixels at least, or its own size if smaller) and ignores `minScreenSize`. It still gives way to labels it would cover, so thousands of members do not cover the screen with text.
- `hide: true` takes members out of drawing, labels, picking, exports and legend counts, and hides the edges of a hidden node. Members keep their position, selection and other states. `others: { hide: true }` keeps only the members while the state has one.
- Built-in states take the same options: `hovered: { others: { opacity: 0.3 } }` fades everything but the hovered element at the cost of one state change per hover. A style merges with the default of that built-in state, property by property.
- Priority: each property comes from the first state that sets it, in the order `selected`, `hovered`, `focused`, then your states in declaration order; `others` takes the rank of its state. The opacity of the winning state multiplies the element's own.
- A definition holds at most 29 free states; more throws a `RangeError`.

## Common Mistakes

### HIGH Expecting a lasso without both options

The lasso needs `lasso: true` (default `false`) and `select: 'multiple'` (the default). With `select: 'single'` or `false`, or without `lasso`, Shift and drag pans the view and selects nothing. Edges are never taken by the lasso.

### HIGH Controlling the selection without answering requests

In controlled mode a click only calls `onSelectionChange`. A handler that does not end in `update({ selection })` (or, in React, a parent that does not render the new `selection` prop) leaves the selection frozen. The mode is fixed at mount: `update({ selection })` on a graph mounted without `selection` does nothing.

### MEDIUM Setting the selection through states

`selected`, `hovered` and `focused` are built in. `graph.states.set('selected', ...)` does not compile; use `graph.selection.set`, and `graph.focus.set` for the focus.

### MEDIUM A state of edges that fades the nodes

`others` on a state fades every element outside it, nodes, edges and shapes. A state that holds only edges therefore dims all nodes and shapes, even the ends of its edges. Use the by-kind form with `others` under `edges` only, or add the end nodes to the state. The same holds for a state of nodes and the zones of a shape mark.

```ts
import { defineGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
const items: Item[] = []

const definition = defineGraph({
  marks: [nodes(items)],
  states: { route: { edges: { stroke: 'var(--graph-accent)', others: { opacity: 0.2 } } } },
})
```

### MEDIUM Mixing a style for both kinds with a style by kind

`{ opacity: 0.2, nodes: { halo: true } }` does not compile: a state style is either for both kinds or by kind.

```ts expect-error=TS2353
import { defineGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
const items: Item[] = []

defineGraph({
  marks: [nodes(items)],
  states: { near: { opacity: 0.2, nodes: { halo: true } } },
})
```

### MEDIUM Turning off pan or zoom and losing keyboard fit

`pan: false` and `zoom: false` also disable the matching keys: `0` fits nothing unless both are on, and with `pan: false` the view no longer follows the focused node. Code still moves the view.

### MEDIUM Showing a page-scroll hint yourself in `'page'` mode

In `wheel: 'page'` the graph shows no text. Subscribe to `zoomhint` and show your own hint, in the page language. A wheel left to the page never calls `preventDefault`, and `zoomhint` fires for every such event: debounce the hint.

### MEDIUM Reading the pointer event of an edge as a node

Targets are a union on `kind`: node, edge, and shape when the definition has a shape mark (an untyped `GraphInstance` may see all three, so an `else` after the node case holds shapes too, and a `switch` over `kind` needs `case 'shape'`). Check `target?.kind` (and `target.mark` when two marks of one kind carry different items) before reading `datum` or `endpoints`; a `click` target is `null` on the background. The same goes for `end`, `aggregate` and `direction`, which exist on edge targets only:

```ts expect-error=TS2339
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
type Link = { id: string; from: string; to: string }
const items: Item[] = []
const links: Link[] = []
const graph = mountGraph(document.body, {
  definition: defineGraph({
    marks: [
      edges(links, { source: 'from', target: 'to', merge: { directed: false, halves: true } }),
      nodes(items),
    ],
  }),
  ariaLabel: 'Sample graph',
})

graph.on('click', ({ target }) => console.log(target?.direction))
```

Narrow first: `if (target?.kind === 'edge') console.log(target.direction)`.

### MEDIUM Expecting the graph to own the wheel and drag on a map

On a graph inside a MapLibre map, the map owns the camera and its gestures: wheel, pinch and background drag move the map. The graph keeps hover, click, selection, lasso, node drag and keyboard. The `wheel` option, the pointer pan and pinch, and auto-pan do not apply: configure the map instead (map skill).

## Completion

The task is done when:

- gesture options sit in `interaction`, with `lasso` and `select: 'multiple'` set together when a lasso is wanted;
- a controlled selection is mounted with `selection` and `onSelectionChange`, and every request is answered with `update({ selection })`;
- handlers narrow `target` on `kind` before reading `datum` or `direction`, and are removed with a `signal` or the function `on` returns;
- state styles use `others`, `raise`, `hide` and `label: 'always'` as needed, with by-kind styles where only one kind must change;
- keyboard and focus are left on unless the page has its own shortcuts, and `focus.set` is used for programmatic focus;
- shapes, when there are some, follow the shapes skill: `pick` decides which ones take the pointer, and `others` states are by kind where zones must not fade;
- `tsc` accepts the code with no cast on targets or state names.

## References

Every page has a Markdown version: add `.md` to its URL.

- [Interaction](https://bruno00o.github.io/graph/docs/interaction), [States](https://bruno00o.github.io/graph/docs/states), [Events](https://bruno00o.github.io/graph/docs/api/events), [defineGraph](https://bruno00o.github.io/graph/docs/api/define-graph), [GraphInstance](https://bruno00o.github.io/graph/docs/api/graph-instance)
- Examples: [named states](https://bruno00o.github.io/graph/examples/named-states), [selection synced with a list](https://bruno00o.github.io/graph/examples/controlled-selection), [keyboard navigation](https://bruno00o.github.io/graph/examples/keyboard-navigation), [event log](https://bruno00o.github.io/graph/examples/event-log), [context menu](https://bruno00o.github.io/graph/examples/context-menu), [hover neighborhood](https://bruno00o.github.io/graph/examples/hover-neighborhood), [filter by degree](https://bruno00o.github.io/graph/examples/degree-filter), [page that scrolls](https://bruno00o.github.io/graph/examples/navigation)
