# A legend declared by the application

The legend reads its sections from the scales of the definition. When elements take their look from rules of the application instead, through `fill`, `stroke`, style functions or states, those sections have nothing to explain. `entries` declares sections of your own: each entry has a label, a swatch, and rules that say which elements it covers.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { createLegend, mountLegend } from '@bruno00o/graph/legend'

type Item = { id: string; label: string; weight: number }
type Link = { id: string; from: string; to: string; strength: number }

declare const items: Item[]
declare const links: Link[]

const heavy = (item: Item) => item.weight >= 40
const strong = (link: Link) => link.strength >= 0.66

const graph = mountGraph(document.body, {
  definition: defineGraph({
    marks: [
      edges(links, {
        source: 'from',
        target: 'to',
        stroke: (link) => (strong(link) ? 'var(--graph-cat-2)' : 'var(--graph-edge)'),
        width: 3,
      }),
      nodes(items, {
        label: 'label',
        fill: (item) => (heavy(item) ? 'var(--graph-cat-1)' : 'var(--graph-node)'),
      }),
    ],
    states: { match: { raise: true }, off: { hide: true } },
  }),
  ariaLabel: 'Weighted graph',
})

const legend = createLegend(graph, {
  highlight: 'match',
  hidden: 'off',
  entries: [
    {
      title: 'Weight',
      entries: [
        {
          id: 'heavy',
          label: 'Heavy',
          swatch: { kind: 'nodes', fill: 'var(--graph-cat-1)' },
          nodes: (item) => heavy(item),
        },
        {
          id: 'strong',
          label: 'Strong links',
          swatch: { kind: 'edges', color: 'var(--graph-cat-2)', width: 3 },
          edges: (link) => strong(link),
        },
      ],
    },
  ],
})
const view = mountLegend(legend, { sections: ['entries'] })
document.body.append(view.element)
```

- `entries` is a list of groups `{ title?, entries }`; an entry is `{ id, label, swatch, nodes?, edges?, shapes? }`. The rules receive the item as given to its mark, typed from the marks of the definition, and its key. A folded group gives its `NodeGroup`, a merged edge its `AggregateEdge` (an entry that accepts it covers every edge it merges); unfolded group containers are not read.
- An entry with a rule is a category: under the pointer its elements go to the `highlight` state, switched off they go to `hidden`, `only` keeps it alone among the entries of its section that have rules, and `keys` lists its elements. Its item id is `a:` followed by its `id`, which `hover`, `toggle`, `only` and `keys` take. An entry without any rule is only displayed, not a button: `toggle` and `only` do nothing on it.
- An element may belong to several entries. `legend.store.state.entries` lists the sections with their items: `id`, `label`, `swatch`, `interactive`, the `nodes`, `edges` and `shapes` drawn that belong to it now, and `off`.
- The swatch is drawn like the swatches of the legend: `{ kind: 'nodes', shape, fill, stroke, image, imageColor }`, `{ kind: 'edges', color, width, dash }` (width 1 to 12, 2 by default) or `{ kind: 'shapes', geometry: 'area' | 'line', fill, stroke, dash }` (`null` draws no fill or outline). Missing values take the theme defaults. It is not read from the graph: give it the values of the style.
- `mountLegend` writes no text: `title` and `label` are yours. `sections` takes `'entries'` to place the declared sections among the others, or alone as above; without `sections` they come last. `empty: 'hide'` leaves out the entries that cover no element at the moment, unless switched off.
- `legend.update({ entries })` replaces them, and an entry removed loses its switched off state. In React, `<Legend entries={entries} />` and `useLegend({ entries })` take the same option.

## Costs and rules

A rule runs once per item, then again only for an item whose object or key changed, so keep it pure. Rules compare by identity: a new function is a new rule, and every element is read again; a new label, title or swatch reads nothing again. The first reading of a large graph, and the one after `update` with new rules, is cut into slices of about 6 ms, so the entries fill in a moment after the graph and keep their previous state until the reading completes. Each later reading visits every drawn element once per kind that has a rule, about 40 ns per element (8 to 10 ms at 100,000 nodes and 200,000 edges with 20 entries). A rule that throws counts as `false` and is reported once through `reportError`. A repeated `id` is ignored, the first one wins, with a warning in development.

## Common mistakes

### MEDIUM Rules made in render

`useLegend({ entries: [{ ..., nodes: (item) => item.weight >= 40 }] })` in a component makes new rules at every render, and the legend reads every element again each time. Declare the entries at module level, or in `useMemo` keyed on what the rules read.

### MEDIUM A swatch that does not match the graph

The swatch is a drawing of your own, not read from the marks: a rule changed in the style and not in the swatch shows another color than the graph. Keep one constant or function for both, as `heavy` above. A node swatch takes `fill`, an edge swatch `color`: a `color` on a node swatch does not compile.

```ts expect-error=TS2353
import type { LegendSwatch } from '@bruno00o/graph/legend'

const swatch: LegendSwatch = { kind: 'nodes', color: 'var(--graph-cat-1)' }
```

### LOW A `LegendState` built by hand without `entries`

`LegendState` has a required `entries` field. A state written by hand, for a test or a story of a legend of your own, needs `entries: []`.
