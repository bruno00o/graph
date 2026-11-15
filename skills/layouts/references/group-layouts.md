# Lay out each group with a layout of its own

`container.layout` on `nodes()` (and on `groups()`, which takes the options of `nodes()`) gives an unfolded group a layout for its members. The layout around the group then places the group as one block, as large as its container. Without `container.layout`, the layout of the definition places the members with everything else.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { grid, layers } from '@bruno00o/graph/layouts'
import { force } from '@bruno00o/graph/layouts/force'

type Item = { id: string; label: string; parent: string | null; kind: string }
type Link = { id: string; from: string; to: string }

declare const items: Item[]
declare const links: Link[]

const definition = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to' }),
    nodes(items, {
      label: 'label',
      parent: 'parent',
      container: { layout: (item) => (item.kind === 'pipeline' ? layers() : grid()) },
    }),
  ],
  layout: force(),
})

const graph = mountGraph(document.body, { definition, ariaLabel: 'Sample graph' })

await graph.layout.run(undefined, { keys: graph.groups.children('a') })
```

## How a run goes

- Groups are laid out from the deepest up. A nested group with a layout of its own is one block in its parent, padding and label included. A group without one is laid out with the layout of the group above it.
- An edge between two groups pulls on the blocks that hold its ends, in the closest group that holds both.
- The layout of the definition then places the top-level nodes and the blocks, and turns each block to face its neighbors as the group layout's `turns` allows: `'free'` for `force`, `rings` and `radial`, `'flip'` (a mirror across the layers) for `layers`, `'none'` for `grid`, `geo` and `placed`. Containers that still overlap are pushed apart. With no layout in the definition, the groups are laid out and only pushed apart; `graph.layout.run()` then works without a layout in the definition.
- It is one run: `layoutstart` and `layoutend` fire once, named after the layout of the definition, or after the outermost group layout when the definition has none. `layout.running` stays true until the end, `layout.stop()` stops every layout of it, and `waitForData` holds the first one.
- Groups that do not depend on each other run side by side. `force` groups under 2,000 nodes share a pool of at most four workers (kept 10 seconds after the last run); a larger group, or a layout of your own, runs by itself, up to four at a time. The other layouts run on the main thread in slices of 8 ms. Without workers the result is the same.
- `run(undefined, { keys })` arranges the given members with the layout of their group; the group keeps its place unless its own key is in `keys`. A layout passed to `run` replaces the layout of the outermost groups that run.
- A member with `x` and `y` in the data keeps its place, and its group stays where it is in the group above it.

## New nodes, unfolding and repeated runs

- Nodes that arrive in a group run that group alone: an incremental layout (`force`) places the newcomers and leaves the rest, the others lay out the group again. When its container grows, what is around it glides out of the way, and the layout around it does not run.
- When the graph lays out again (new nodes, a new layout, `relayout`), a group whose members, edges, sizes, items and layout are the same keeps its last arrangement. `graph.layout.run()` always runs every group it moves.
- A group with a layout of its own arranges its members as it unfolds: they come out of the folded node and glide to their places over `transitions.layout`, while the nodes and containers around it make room, even with no layout in the definition. An incremental layout puts back the members it arranged before, dragged ones included, and places only the others (no run when there are none); another layout arranges the whole group again, or keeps its last arrangement when nothing changed while it was folded. Nested groups that unfold together arrange from the deepest up. It is one run, with `layoutstart`, `layoutend` and `positionchange`, and `waitForData` holds it.
- With `relayout: true`, an unfold lays out the whole graph again: members come out of the folded node, follow their block while the layout around places it, and glide to their final places without leaving the container.
- Members arranged by a group layout are not spread (`container.spread`): spreading applies to children placed by their data, or by no layout at all.

## Limits

- Layouts are compared by name and options (a shallow comparison), so `grid()` called again with the same values runs nothing. An option that is a function compares by identity: pass a function declared once.
- The code that lays out groups loads with `@bruno00o/graph/layouts` and `/layouts/force`. Without them the graph loads it as soon as a mark declares `container.layout`, folded groups included, and layouts wait for it a few milliseconds; a layout of your own alone in a container works. If it cannot load, a development warning says so and groups are laid out as if they had no layout.
- On a map, `container.layout` is ignored with a single development warning. A custom layout in a group receives `container` (key, item, circle) and `blocks` (`size`, `items(index)`, `keys(index)`) in its `LayoutGraph`: a block is a node as large as the group it stands for.
