---
name: groups
description: >
  Use when nesting @bruno00o/graph nodes in groups with a parent field or by a
  field value with groups(), styling group containers, folding and unfolding
  groups from code, from a double-click or from React state, giving a group a
  layout of its own, merging parallel edges, the edges between groups or the
  edges toward a folded group into one, hiding elements with a state
  without removing their data, or finding why a group does not fold, a key does
  not match or the layout ignores a fold.
metadata:
  purpose: >
    Groups and the transformations that change what is drawn while the data
    stays as it is: parent channels, containers, spreading, fold and unfold
    (instance and controlled), groups() by a field, merge and aggregate for
    edges, betweenGroups, and hide states, with the key, layout and typing
    mistakes that go with them.
  type: sub-skill
  library: '@bruno00o/graph'
sources:
  - src/marks.ts
  - src/types.ts
  - src/host/graph-instance.ts
  - src/host/events.ts
  - src/core/projection.ts
  - src/core/hierarchy.ts
  - src/host/folding.ts
  - src/host/picking.ts
  - src/host/element-keys.ts
  - docs/content/docs/(guide)/groups.mdx
  - docs/content/docs/(guide)/transformations.mdx
  - docs/content/docs/api/groups.mdx
requires:
  - core
---

# Groups, merged edges and hidden elements

Load the core skill first (`intent load @bruno00o/graph#core`). A group is a node like any other: it has a key, a mark, options and states. Three options change what is drawn while the data stays as it is: `parent` and `groups()` nest nodes, `merge` on `edges()` draws parallel edges as one, and a state with `hide: true` takes elements out of the drawing.

## Choose how to group

| Situation                                                       | Use                                           |
| --------------------------------------------------------------- | --------------------------------------------- |
| The data already says which node holds which (a parent key)     | the `parent` channel of `nodes()`             |
| Items carry a value (sector, type) and groups should follow it  | `groups(items, { by })`                       |
| Groups of values inside groups of the data                      | `groups(items, { by, parent })`               |
| Many parallel edges between the same two nodes                  | `merge` and `aggregate` on `edges()`          |
| Edges between two big groups                                    | `betweenGroups: 'groups'` on `edges()`        |
| Filter elements out and keep selection, positions and layout    | a state with `hide: true`                     |

## Setup: groups by a parent key

A node joins a group through the `parent` channel, which reads the key of the group. `null` or missing means top level. A node becomes a group as soon as another node names it, at any depth.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; label: string; parent: string | null }
type Link = { id: string; from: string; to: string }

const items: Item[] = [
  { id: 'g', label: 'Group', parent: null },
  { id: 'h', label: 'Inner group', parent: 'g' },
  { id: 'a', label: 'A', parent: 'g' },
  { id: 'b', label: 'B', parent: 'h' },
]
const links: Link[] = [{ id: 'e1', from: 'a', to: 'b' }]

const definition = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to' }),
    nodes(items, {
      parent: 'parent',
      label: 'label',
      container: { padding: 24, fillOpacity: 0.4 },
    }),
  ],
})
const graph = mountGraph(document.body, {
  definition,
  ariaLabel: 'Groups',
  initialFolded: ['h'],
})
```

Result: group `g` draws as a rounded container behind its children, its label above it, and `h` starts folded, drawn as one node. A `parent` that names no node is reported in `graph.issues()` as `missing-parent` and the node waits at the top level until its group arrives; a parent that would contain itself is `parent-cycle` and the node stays at the top level.

## Core Patterns

A layout that follows folds comes from the layouts skill: `import { force } from '@bruno00o/graph/layouts/force'`, then `layout: force()` and `relayout: true` in `defineGraph`.

### Style the container

The `container` option of `nodes()` styles a node while it is an unfolded group: `shape` (`'rectangle'` default, `'circle'`), `padding` (default 16), `fill` (default `--graph-group-fill`), `fillOpacity` (0..1, default 1, translucent on a map), `stroke` (`--graph-group-line`), `strokeWidth` (1), `spread` and `gap`, plus `drag`, `label`, `badges` and `layout` below. A folded group draws with the ordinary options of its mark (color, size, shape, label, badges). States apply to containers like nodes. Edges that end on a container stop at its border.

- `container.drag: false` keeps a container in place: a press inside it pans the view or draws a lasso, and its children can still be dragged one by one. It defaults to the `drag` of the node, so `drag: false` on the mark pins the containers too (interaction skill).
- `container.layout` (a layout, `null` or a function of the group item) lays the members of the unfolded group out together, and the layout around places the group as one block (layouts skill: workers, unfolding, limits). It works on `nodes()` and `groups()` and is ignored on a map.
- An unfolded group keeps its label, above the container, and shows its badges only while folded. `container.label` and `container.badges` set them while it is unfolded, with the values of the `label` and `badges` options of `nodes()` (`null` draws none); container badges sit on the corners of the container. The same options apply to the groups of `groups()`.

```ts
import { nodes } from '@bruno00o/graph'

type Item = { id: string; name: string; parent: string | null; alerts: number }
const items: Item[] = []

nodes(items, {
  parent: 'parent',
  label: (item) => `${item.name} (${item.alerts})`,
  badges: { topRight: (item) => (item.alerts > 0 ? { text: item.alerts } : null) },
  container: {
    label: 'name',
    badges: { topRight: (item) => (item.alerts > 0 ? { text: '!' } : null) },
  },
})
```

### Spread overlapping children

Children of an unfolded group that overlap, such as nodes at the same coordinates, move apart around their place (`container.spread`, on by default; `gap` 4 in pixels for `units: 'screen'` nodes, else world units). Only the drawn position moves: the data keeps its place, no `positionchange` is emitted, so `persistPositions` never stores a spread position, and children return at once when the group folds. `graph.positions.get` and `snapshot()` give the drawn positions. A child you drag or `positions.set` leaves its pack. Layouts never move a spread child, and members that a group layout arranges are not spread. Set `container: { spread: false }` to leave children stacked. The `spread` option of `defineGraph` (map skill) is another thing: it moves apart nodes outside groups at the very same point, and never touches the children of an unfolded group.

### Fold and unfold from code

```ts
import type { GraphInstance } from '@bruno00o/graph'

export function control(graph: GraphInstance) {
  graph.groups.fold(['h'])
  graph.groups.unfold(['g'])
  graph.groups.toggle('g')
  graph.groups.fold()
  graph.groups.unfold()
  graph.groups.set(['g'])
  console.log(graph.groups.folded(), graph.groups.isFolded('g'))
  console.log(graph.groups.parent('a'), graph.groups.children('g'))
  return graph.on('foldchange', ({ folded }) => console.log(folded))
}
```

- The `foldchange` that follows the arrival of the groups of `groups()` fires once their data is applied, so `graph.count()` in its handler is complete.
- `fold()` and `unfold()` without keys act on every group, nested ones included. A folded group inside a folded group stays folded when its parent opens. A folded key that names no node yet applies when the group arrives. `initialFolded` is the same at mount.
- `initialFolded` also takes a function of the group node, called once for each group when it first has a child, before it is drawn: at mount and for every group that arrives later, from new data or a live source. A group it folds stays folded until you unfold it, a group already decided is not asked again (even after it leaves and comes back), and `foldchange` reports the groups it folds. With controlled `folded`, the function folds the group at once and sends the request to `onFoldChange`, so keep it in your state. An error it throws is reported and leaves the group unfolded.
- Pass an array of keys, never a string: the types refuse `fold('group-1')` (`KeyList` takes a list), and in plain JavaScript it folds `'g'`, `'r'`, `'o'`... and warns once in development.
- A folded group hides its children and draws as a node. Edges into hidden children draw to the outermost folded group; edges inside one folded group disappear. Unfolding brings everything back as it was.
- `interaction.fold` (on by default): double-click a group, or Enter on a focused group, toggles it. A `doubleclick` handler that calls `event.originalEvent.preventDefault()` keeps the group as it is. Turn it off with `interaction: { fold: false }`.
- Dragging an unfolded container moves its descendants; dragging a folded group moves only the group. A folded group needs no position: it starts at the center of its members.

### Control folding from state

Pass `folded` at mount to own it (the new groups of `groups()` start folded by asking `onFoldChange`, so answering every request is enough: mount with `folded: []`, and the handler's `update({ folded })` folds them; to know a group key before mounting, there is none, use `keyOf` on the instance): every request (double-click, Enter, `graph.groups`) calls `onFoldChange` and only `update({ folded })` changes what is drawn. Mode is fixed at mount; a prop that starts `undefined` and is set later does not take control.

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'
import type { Key } from '@bruno00o/graph'

type Item = { id: string; parent: string | null }
const items: Item[] = []

const definition = defineGraph({ marks: [nodes(items, { parent: 'parent' })] })

let folded: Key[] = ['g']
const graph = mountGraph(document.body, {
  definition,
  ariaLabel: 'Groups',
  folded,
  onFoldChange: (event) => {
    folded = [...event.folded]
    graph.update({ folded })
  },
})
```

In React, give `<Graph>` `folded` and `onFoldChange`, initialized before the first render (react skill). `graph.store.get().folded` holds the folded keys for `useGraphState`.

### Group items by a field with `groups()`

`groups()` returns a mark of group nodes, one per value of `by`; the items move into their group, which starts folded. Put the mark next to the mark of the items and pass the same data array (or live source) to both. Leave the mark out to ungroup.

```ts
import { defineGraph, edges, groups, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; label: string; sector: string; team: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const links: Link[] = []

const bySector = (item: Item) => item.sector

const sectors = groups(items, {
  by: bySector,
  name: 'sectors',
  size: (group) => 20 + Math.sqrt(group.count) * 6,
  label: (group) => `Sector ${group.value}`,
  container: { padding: 20 },
})

const definition = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to' }),
    nodes(items, { label: 'label' }),
    sectors,
  ],
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sectors' })

const key = graph.groups.keyOf('sectors', 'north')
graph.groups.unfold([key])
```

- Options are those of `nodes()` read from a `NodeGroup`: `value`, `count`, `keys`, `data`, `key`, `parent`. The `key` and `parent` options of `groups()` describe the items (key defaults to `id`), not the group nodes.
- `min` (default 1) is the fewest items that make a group; smaller groups leave their items in place. `folded: false` shows new groups unfolded. An item without a value stays out of every group.
- The key of a group node is internal and never collides with a data key. Read it from `target.key`, `group.key`, `graph.groups.parent(key)` or `graph.groups.folded()`, or ask `graph.groups.keyOf(name, value, parent?)`, which works before the group exists (for `initialFolded`). `name` is the mark's `name`, or the field of `by` when it has none. Never build the key by hand.
- An item with a `parent` in the data leaves that group for its group by value. Give `groups()` the same `parent` to make groups within each group of the data and nest in it: `groups(items, { by: 'sector', parent: 'team' })`.
- With a live source, an item that changes its value moves to its new group, and a group left with fewer than `min` members disappears.
- Without `units`, a group node takes the units of its first member (screen pixels for nodes placed by `longitude` and `latitude`).
- `groups()` called again with the same data, `name`, `by`, `key`, `parent` and `min` reuses its groups; a `by` function is compared by identity, so declare it once (as `bySector`), not inline in a definition rebuilt on every render.

### Merge parallel edges

To reuse option objects, hoist them as functions typed with `AggregateEdge<Link>`, a type exported from the main entry (`(aggregate: AggregateEdge<Link>) => aggregate.count`); callbacks written inline in `edges()` are inferred.

`merge: true` draws the edges of one mark that join the same two visible nodes in the same direction as one aggregated edge; `aggregate` styles it. The aggregated edge is read again whenever one of its edges changes, arrives or leaves, so its `count`, `keys`, `data` and the width, color and label computed from them follow the data: updating one merged edge is enough. Its channels and styles read an `AggregateEdge`: `id`, `source`, `target`, `count`, `keys`, `data`, `forward`, `backward` (each `{ count, keys, data }`), and `value` when `by` is set (not for edges merged by `foldedAsOne`).

```ts
import { edges } from '@bruno00o/graph'

type Link = { id: string; from: string; to: string; kind: string }
const links: Link[] = []

edges(links, {
  source: 'from',
  target: 'to',
  color: 'kind',
  merge: { by: 'kind', directed: false, min: 3 },
  aggregate: {
    width: (aggregate) => aggregate.count,
    label: (aggregate) => String(aggregate.count),
    ends: {
      target: { label: { text: (aggregate) => String(aggregate.forward.count), background: true } },
      source: { label: { text: (aggregate) => String(aggregate.backward.count), background: true } },
    },
  },
})
```

- `by` splits the merge: edges of two values between the same nodes draw as two aggregated edges side by side. `directed: false` puts both directions on one line that points the way of the first edge in `keys`, and `forward` and `backward` tell the directions apart (one end each through `aggregate.ends`). `min` (default 2) is the fewest edges that merge; edges that end in a folded group always merge.
- With `by`, the edges toward a folded group split by value too. `foldedAsOne: true` draws the edges that end in a folded group (from a node, or between two folded groups) as one aggregated edge whatever `by`; between plain nodes `by` still splits them, and unfolding brings back one line per value. That line has no `value` (a channel such as `color: (aggregate) => aggregate.value` reads `undefined`: give it a fallback) and its `id` ends with `null`. It does nothing without `by`, and the groups that `betweenGroups: 'groups'` draws as boxes are not folded groups.
- `min` governs parallel edges between visible nodes and edges into folded groups only. With `betweenGroups: 'groups'`, every edge that rises to a pair of groups draws as an aggregated edge, even a single one, whatever `min`.
- Merging is per mark, so an aggregated edge stays in the layer of its mark. Without `merge`, an edge pair A to B and B to A is two curves.
- Without `aggregate`, an aggregated edge takes the look of its first merged edge; labels (end labels too) show only when it stands for one edge. The first edge is the first to have reached the graph and stays while it is in the data.
- Picking returns the first edge with `target.aggregate` holding all of them: `graph.on('click', ({ target }) => target?.kind === 'edge' && target.aggregate?.keys)`. `aggregate.id` names the aggregated edge itself: built from the mark, its two visible ends (in a fixed order when `merge.directed` is `false`) and the `by` value (`null` with `foldedAsOne`), it stays the same while the edge joins the same ends, whichever edges it merges. Key a panel or a tooltip on it, not on `target.key` or `keys[0]`, which change when the first edge leaves. Clicking selects every merged edge, hovering hovers them all, and an aggregated edge shows the states of any of its edges. It hides when all its edges hide.
- Keep a `by` function stable, as for `groups()`.

### One direction per half

A two-way line is one target by default: a click selects every merged edge. With `halves: true` next to `directed: false`, an aggregated edge that has edges both ways is drawn as two halves, and each half acts for its own direction:

- the half next to `aggregate.target` stands for `forward`, the half next to `aggregate.source` for `backward`. They meet at the `split` of `aggregate.ends` (the middle by default). `forward` and `backward` are relative to the aggregated edge, which points the way of the first edge in `keys`: they do not mean the `from` and `to` fields of your links. `aggregate.source` and `aggregate.target` are the keys of the nodes (or folded groups) the line joins, so `forward` is "`aggregate.source` to `aggregate.target`".
- picking a half returns the first edge of its direction (`key`, `datum`) with `target.direction` set to `'forward'` or `'backward'`; `target.aggregate` still holds the whole line.
- a click selects the edges of that direction only; in the default `'multiple'` selection mode, Shift, Cmd or Ctrl adds them or removes them. Hover works per half. `click` fires before the selection changes: read `target.direction` in `click`, and the selected keys in `selectionchange` or `graph.selection.get()`. A selection has no direction of its own, so keep the last clicked one if you display it.
- every state draws on the half of its own edges: selection, hover, free states, `others`, `hide` and `raise`. A state `stroke` colors one half; a half whose edges all hide disappears while the other stays. The legend and the exports follow.
- a line with edges one way only stays whole, and so does every line when `directed` is not `false`. The halves share the zoom range, the time and the layer of the line. Keyboard focus stays on nodes, so keyboard users cannot pick a direction.
- `halves` is opt-in and costs a second pass over the two-way lines only.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
type Link = { id: string; from: string; to: string }

const items: Item[] = []
const links: Link[] = []

const definition = defineGraph({
  marks: [
    edges(links, {
      source: 'from',
      target: 'to',
      arrow: 'target',
      merge: { directed: false, halves: true },
      aggregate: {
        ends: {
          target: { stroke: 'var(--graph-cat-2)' },
          source: { stroke: 'var(--graph-cat-4)' },
        },
      },
    }),
    nodes(items),
  ],
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Two-way links' })

graph.on('click', ({ target }) => {
  if (target?.kind !== 'edge' || !target.direction || !target.aggregate) return
  console.log(target.direction, target.aggregate[target.direction].keys, graph.selection.get().edges)
})
```

### One edge between two groups

By default an edge between two unfolded groups goes from member to member across both containers. `betweenGroups: 'groups'` draws it between the groups, container border to container border: each end rises to the child of the innermost group that holds both ends, and edges that rise to the same two children draw as one aggregated edge (a single edge makes one too, with `count` 1). Style it with `aggregate`, split with `merge.by`, merge directions with `merge.directed: false`.

```ts
import { edges } from '@bruno00o/graph'

type Link = { id: string; from: string; to: string }
const links: Link[] = []

edges(links, {
  source: 'from',
  target: 'to',
  betweenGroups: 'groups',
  merge: { directed: false },
  aggregate: { width: (aggregate) => Math.sqrt(aggregate.count) * 2 },
})
```

Edges inside one group still join their members. These edges are never bundled, routed or bridged, and layouts still read the edges of the data, member to member.

### Hide without losing state

A state with `hide: true` takes its members out of the drawing: not drawn, labeled, picked, reached by keyboard or lasso, nor exported; legend, minimap and hulls leave them out; the edges of a hidden node hide with it. They keep their position, selection, other states and their place in layouts, and return as they were. A hidden container still shows its children. Use it to filter in the UI; to remove elements from layouts and counts, filter the data array instead.

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string; weight: number }
const items: Item[] = []

const definition = defineGraph({
  marks: [nodes(items)],
  states: { off: { hide: true } },
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })

graph.states.set('off', { nodes: items.filter((item) => item.weight < 3).map((item) => item.id) })
graph.states.clear('off')
```

A legend whose `hidden` option names a `hide: true` state filters the graph from the legend (tools skill).

### Lay out again after a change

A fold, an unfold, or a change of `groups()` or `merge` changes what the layout sees. By default only nodes that appear are placed, and an unfolded group pushes its neighbors aside. Set `relayout: true` in `defineGraph` to run the layout again over every node it may move. Nodes with `x` and `y` and the node being dragged never move. Every layout keeps unfolded groups whole at every level, padding included; see the layouts skill.

### Positions and unfolding

Hidden nodes keep their positions, restored ones (`initialPositions`, layouts skill) included: a hidden member appears at its restored place when the group opens, a folded group keeps its own entry, and restored members are not spread. On unfolding, nodes return where they were, shifted by how far the group moved while folded, and glide out over `transitions.layout`; nodes placed by `x` and `y` stay where the data puts them; a node never shown appears around its group. With a layout in the definition, or a layout of its own in any group, an unfolding group makes room for itself. A group with `container.layout` arranges its members as they come out of it: an incremental layout puts back the members it arranged before and places only the new ones (layouts skill).

## Common Mistakes

### HIGH Passing a string to `fold`, `unfold` or `set`

These take a list of keys (`KeyList`). The types refuse a single string; in plain JavaScript, or through a cast, a string is read as its characters, folds nothing useful and warns once in development.

Wrong:

```ts expect-error=TS2345
import type { GraphInstance } from '@bruno00o/graph'

export const wrong = (graph: GraphInstance) => graph.groups.fold('sector-a')
```

Correct:

```ts
import type { GraphInstance } from '@bruno00o/graph'

export const right = (graph: GraphInstance) => graph.groups.fold(['sector-a'])
```

### HIGH Building the key of a `groups()` node by hand

The key of a group node made by `groups()` is internal, so guessing it (`'sectors:north'`) matches nothing: the fold is silently ignored. Use `graph.groups.keyOf(name, value, parent?)`, `target.key` or `graph.groups.folded()`.

### HIGH Expecting folding or merging to relayout

Folding, unfolding and a change of `groups()` or `merge` place only the nodes that appear (a group with `container.layout` also arranges its own members as it unfolds). For the whole layout to run again, set `relayout: true`; otherwise call `graph.layout.run()`.

### MEDIUM Giving `groups()` a different array than the items mark

`groups()` reads the same data as the mark of the items: the same array or the same live source. A copy or a filtered array builds groups from other items, so counts and members drift from what the nodes show.

### MEDIUM Setting a controlled `folded` after mount

Folding is controlled or not for the life of the graph, decided at mount by `folded`. Starting with `undefined` and setting `folded` later does not take control. Pass the initial array at mount (or `initialFolded`, an array or a function of the group, for an uncontrolled start).

### HIGH Setting `halves` without `directed: false`

`halves: true` is ignored unless `directed` is `false`: the type accepts the combination (`directed` may come from a variable), development builds only log a warning once per graph, and the line stays whole, so `target.direction` is never set and a click still selects both directions. Write `merge: { directed: false, halves: true }`. The same happens for a line with edges one way only, which is correct: only two-way lines split, so handle a click target without `direction`.

### MEDIUM Expecting `foldedAsOne` to merge without `by`

`merge: { foldedAsOne: true }` only changes how a `by` split treats the edges toward a folded group. Without `by` those edges already merge, and nothing changes. The merged line has no `value`, so a color or width that reads `aggregate.value` gets `undefined` for it, and its `id` has a `null` where a by-value line has the value: never compare the two.

### MEDIUM Identifying an aggregated edge by its first key

`target.key` and `aggregate.keys[0]` are the first merged edge: they change when that edge leaves or another arrives first, so a panel kept on them loses its edge. `aggregate.id` stays while the line joins the same ends.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'

type Item = { id: string }
type Link = { id: string; from: string; to: string }
const items: Item[] = []
const links: Link[] = []

const graph = mountGraph(document.body, {
  definition: defineGraph({
    marks: [edges(links, { source: 'from', target: 'to', merge: true }), nodes(items)],
  }),
  ariaLabel: 'Sample graph',
})

let openId: string | null = null
graph.on('click', ({ target }) => {
  if (target?.kind === 'edge' && target.aggregate) openId = target.aggregate.id
})
console.log(openId)
```

### MEDIUM Rebuilding `by` or `merge.by` functions in render

`groups()` and `merge` compare functions by identity. A new `by` function in a definition rebuilt on every render regroups every item each time. Declare `by`, and the options passed to `aggregate`, once.

### MEDIUM Typing `aggregate` against the edge item

`aggregate` channels read an `AggregateEdge<Link>`, not a `Link`: `(aggregate) => aggregate.data[0]?.kind` is the first merged edge's field, `aggregate.count` the number. `key`, `source`, `target`, `name`, `layer`, `supportedBy`, `merge` and `aggregate` are not options of `aggregate`.

### MEDIUM Expecting merged edges across marks or layers

Edges merge mark by mark. Two marks never share an aggregated edge, which also keeps each in its own layer. Put the edges to merge in one mark.

### MEDIUM Labels missing on an aggregated edge

A merged edge shows a label only when it stands for one edge, unless `aggregate` gives `label` (or end labels). Give `aggregate.label` for counts.

### MEDIUM Using `hide` to shrink the layout

A hidden element stays in layouts, counts as data, and keeps its selection. To drop it from the layout, filter the array passed to the mark.

### MEDIUM Groups on a map

On a map, groups made with `parent` or `groups()` work and need no coordinates; the container `padding` is in pixels and fills are translucent by default. A node mark that is a group but has no `longitude`, `latitude` or `units` stays in world units (huge at map zooms); only `groups()` inherits the units of its members. Layouts do not run on a map.

## Completion

The task is done when:

- `graph.issues()` has no `missing-parent` or `parent-cycle`, and every `parent` key exists;
- `fold`, `unfold`, `toggle` and `set` get arrays of keys, and group keys come from `keyOf`, events or `folded()`;
- a layout that must follow folds has `relayout: true`;
- controlled folding is initialized before the first render and answers every `onFoldChange`;
- a two-way line that must select one direction per click has `merge: { directed: false, halves: true }`, and handlers treat a target without `direction` as the whole line;
- a group that needs its own arrangement has `container.layout`, and `foldedAsOne` sits next to a `by`;
- merge options and `by` functions are declared once, panels on aggregated edges are keyed by `aggregate.id`, and `tsc` passes with no cast on `AggregateEdge`.

## References

Every page has a Markdown version: add `.md` to its URL. The site documents the latest release.

- Guides: [Groups](https://bruno00o.github.io/graph/docs/groups), [Transformations](https://bruno00o.github.io/graph/docs/transformations), [groups in layouts](https://bruno00o.github.io/graph/docs/layout#groups)
- API: [groups](https://bruno00o.github.io/graph/docs/api/groups), [edges](https://bruno00o.github.io/graph/docs/api/edges), [GraphInstance](https://bruno00o.github.io/graph/docs/api/graph-instance)
- Examples: [nested groups](https://bruno00o.github.io/graph/examples/nested-groups), [group by a field](https://bruno00o.github.io/graph/examples/group-by-field), [merge by kind](https://bruno00o.github.io/graph/examples/merge-by-kind), [layouts per group](https://bruno00o.github.io/graph/examples/group-layouts), [transformations](https://bruno00o.github.io/graph/examples/transformations), [lay out again after a fold](https://bruno00o.github.io/graph/examples/relayout-on-fold), [filter with a hidden state](https://bruno00o.github.io/graph/examples/threshold-filter), [group tree beside the graph](https://bruno00o.github.io/graph/examples/group-tree), [forces with groups](https://bruno00o.github.io/graph/examples/force-with-groups)
