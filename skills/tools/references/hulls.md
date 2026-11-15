# Hulls

A hull is a shape drawn under edges and nodes around a set of nodes: build it with `hull()` and list it in `hulls`. It follows its nodes; for an area or a line with geometry of its own, such as a zone with a hole, use a `shapes()` mark (shapes skill). It encloses one of:

- a list of keys: `hull({ nodes: ['a', 'b'] })`, missing keys skipped;
- every node of a mark: `hull({ nodes: people })`, where `people` is **the same mark object** listed in `marks`;
- the nodes of a mark grouped by a field or function: `hull({ nodes: people, by: 'group' })`, one hull per value, with color options that may be functions of the value;
- the nodes in a state: `hull({ state: 'flagged' })`, which follows the state as it changes.

Options: `shape` (`'rounded'` default, `'smooth'` bends the sides outward), `padding` (screen pixels, 16), `color` (outline, and a 12% fill), `fill`, `stroke`, `strokeWidth` (screen pixels, 1, `0` for no outline). Without colors a hull uses `--graph-group-fill` and `--graph-group-line`. A negative or non-finite `padding` or `strokeWidth` throws a `RangeError`. Hulls follow their nodes through layouts, drags and transitions, are convex, may cover nodes of other sets, and are drawn in exports. Use a hull for any set of nodes, overlapping sets and states; use group containers (the groups skill) when the structure is in the data and the reader folds it.

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

## Labels

`label` names a hull with text drawn by the graph, in PNG and SVG exports too. It is the text, or `{ text, background, color, size, weight, font, maxWidth }`: `size` 12 pixels at zoom 1, `weight` 500, `background` a color, `true` for `--graph-label-background`, or nothing. With `by`, `text` can be a function of the group (`{ value, count, keys, data }`, the members drawn in the hull), and `color` a function of the value; it runs again when the members change. An empty string draws no label. A `size` that is not above 0, a negative `maxWidth` or a `weight` outside 1 to 1000 throws a `RangeError` from `hull()`.

```ts
import { defineGraph, hull, nodes } from '@bruno00o/graph'

type Person = { id: string; team: string; name: string }
declare const staff: Person[]

const people = nodes(staff, { label: 'name', color: 'team' })

export const definition = defineGraph({
  marks: [people],
  hulls: [
    hull({ nodes: people, by: 'team', label: ({ value, count }) => `${value} (${count})` }),
    hull({ nodes: ['a', 'b'], label: { text: 'Pair', weight: 'bold', background: true } }),
  ],
})
```

- The label sits centered above the highest point of the hull, outside its outline and past its padding, so it does not cover the nodes. It follows the hull as its nodes move.
- It keeps its size while the hull is at least as wide on screen as the text, shrinks with the hull when you zoom out further, and hides under 8 pixels like other labels. It hides with its hull (zoom range, time window, layer, a `hide` state, a folded group, the far side of the globe).
- Labels give way to each other. Hull labels come after the labels of hovered, focused, raised and `'always'` elements and before the other node, edge and shape labels, the hull with the most nodes first.
- Text that holds buttons or HTML belongs to an anchor on the same nodes (`graph.anchors.set(element, { nodes: keys, side: 'top' })`), not to a label.

### A function as the text of a hull without `by`

A function receives the group of one hull, which only exists with `by`. Without `by` the types refuse it and the hull draws no label.

```ts expect-error=TS2769
import { hull } from '@bruno00o/graph'

hull({ nodes: ['a', 'b'], label: ({ value }) => String(value) })
```
