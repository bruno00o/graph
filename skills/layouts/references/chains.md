# Draw the chains between exits

`chains`, from `@bruno00o/graph/layouts/chains`, runs the analysis of `ways` (paths skill) on the graph it lays out and draws each chain between two exits as an arc of a circle through both exits. The branches that hang on a chain fan out around it, and the exits linked by chains or edges sit together in rows.

```ts
import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { chains } from '@bruno00o/graph/layouts/chains'
import { force } from '@bruno00o/graph/layouts/force'

type Spot = { id: string; label: string; exit: boolean }
type Link = { id: string; from: string; to: string }

declare const spots: Spot[]
declare const links: Link[]

const definition = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to' }),
    nodes(spots, { label: 'label' }),
  ],
  layout: chains<Spot>({ exits: (spot) => spot.exit, spacing: 16 }),
})
const graph = mountGraph(document.body, { definition, ariaLabel: 'Chains between exits' })

graph.layout.run(chains({ exits: ['north', 'south'], core: force() }), { fit: true })
```

- `exits` is a function of the node item and key, or a list of keys, as in `ways`. Inside `defineGraph`, a function needs the item type on the call (`chains(…)`), as `grid` with `order`: otherwise the item is `unknown`.
- A step is the largest diameter plus `spacing`; `spacing` is the gap between two nodes of a chain, from their borders, and defaults to the largest diameter, at least 24. A chain of `n` nodes is an arc `n + 1` steps long, straight when the arc would be shorter than the chord; a chain that returns to its own exit is a circle through it.
- Exits form units: two linked exits sit 1.6 steps apart; exits linked along a path sit on a line, each chain a half circle; a cycle or an exit linked to three others or more is a heart, on a circle, or placed by `core` (any layout, run first on the heart exits alone).
- Branches with one child per level move one step per node; siblings share the angle by the size of their subtrees. Components without an exit get their own unit, fanned from their highest-degree node.
- Like `grid`, `chains` ends at once, on the main thread, is not incremental and never moves fixed nodes: a fixed exit anchors its unit. The analysis always uses `failure: 'node'`, so `ways` with the default `failure` finds the same chains.

## Mistakes

### HIGH Importing `chains` from the layouts entry point

`chains` has its own entry point, like `force`, so that `@bruno00o/graph/layouts` carries none of the analysis.

```ts expect-error=TS2305
import { chains } from '@bruno00o/graph/layouts'
```

### MEDIUM Expecting arcs from exits that do not link

A node lies on a chain only when it is on a path between two exits, or on a cycle back to one exit. A tree hanging off the exits, or nodes in a component with no exit, are drawn as fans, not arcs. Check `ways(graph, { exits }).chains` first when the drawing has no arc.
