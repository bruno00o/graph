# Elastic drag

With `interaction: { drag: 'elastic' }`, the nodes around a dragged node follow it as if the edges were springs. A neighbor follows most of the way, a node a few hops away hardly moves, and nodes the dragged node passes close to step aside. The dropped node stays where it is dropped; the others slow down and stop where they were pulled, and never go back. It is off by default (`drag: true`).

```ts
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'

type Item = { id: string }
type Link = { id: string; from: string; to: string }
declare const items: Item[]
declare const links: Link[]

const definition = defineGraph({
  marks: [nodes(items), edges(links, { source: 'from', target: 'to' })],
  layout: force(),
  interaction: { drag: 'elastic' },
})
```

`drag` takes `true`, `false` or `'elastic'`; any other value makes `defineGraph` throw a `TypeError`.

## When the neighbors follow

- Only when the layout of the definition has `follow`. `force()` has one; `grid()`, `layers()`, `rings()`, `radial()`, `geo()`, `placed()` and `layout: null` have none, and a drag then moves only the dragged nodes.
- Only between layout runs. During a run the dragged node is pinned and the run settles the others, as with `drag: true`. A run that starts while the others still move (a new definition, `graph.layout.run()`, arrivals) stops them where they are.
- Never on a map: the graph has no layout there.
- Nodes placed by their data (`x` and `y`, or `longitude` and `latitude`), members of unfolded groups, nodes still gliding from an animation, and the other dragged nodes never move. Containers do not push the others away. Hidden nodes follow like visible ones, as in layouts.
- At most 5,000 nodes move, starting from the neighbors of the dragged nodes. A node wakes once a node next to it has moved half a screen pixel, so the motion stays local at every zoom.
- Nodes or edges that come or go during the drag start the network again from the positions reached, unless they start a layout run (new nodes do with `force()`); after the drop, they stop it. A move to another surface stops it too.

## Events and saving

The dragged nodes emit `dragstart`, `drag`, `dragend` and a `positionchange` on every move, as usual. The nodes that followed emit one `positionchange` with origin `'drag'`, once they are calm (or when something stops them), without the dragged nodes. `persistPositions` saves them like a drag.

```ts
import type { GraphInstance, Key, Point } from '@bruno00o/graph'

declare const graph: GraphInstance
declare function save(positions: ReadonlyMap<Key, Point>): void

graph.on('positionchange', ({ origin, positions }) => {
  if (origin === 'drag') save(positions)
})
```

`graph.settled()` waits until the nodes that followed are calm. With reduced motion, they do not move during the drag and jump to where they were pulled after the drop.

## A layout of your own

A custom layout follows drags by giving `follow(graph, held, pixel)`. The graph passes a fresh `LayoutGraph` whose `movable` leaves out the nodes that must not move, the indices of the dragged nodes and the size of a screen pixel in world units. `follow` returns a `LayoutFollower`, or `null` to leave the others in place. `LayoutFollower` is an experimental port, outside the semver promise.

```ts
import type { Layout, LayoutFollower } from '@bruno00o/graph'

declare const base: Layout

const still: Layout = {
  ...base,
  follow(graph, held, pixel): LayoutFollower {
    return {
      hold: (index, x, y) => {},
      release: () => {},
      step: (time, until) => false,
      moved: [],
      stop: () => {},
    }
  },
}
```

The graph calls `hold` on every move, `step(time, until)` once per frame with the milliseconds since the last frame (at most 100), and `release` at the drop. `step` writes the moved nodes into `graph.xy` and returns whether they still move; it must not work past `until`, a time of `performance.now()`. The graph writes the positions of `moved` after each step and calls `stop` once `step` returns `false` after the drop, when a layout starts, or when the nodes or edges change. With reduced motion, `step` receives `Infinity` and runs until calm, first before `release`, then after.

See [Interaction](https://bruno00o.github.io/graph/docs/interaction#let-the-neighbors-follow) and [Follow a drag](https://bruno00o.github.io/graph/docs/api/define-graph#follow-a-drag).
