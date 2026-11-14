# Labels and pins of shapes

## Label shapes

`label` is a text channel (a field or a function), or an object with the same text options as node labels:

```ts
import { defineGraph, mountGraph, type ShapeGeometry } from '@bruno00o/graph'
import { shapes } from '@bruno00o/graph/shapes'

type Zone = { id: string; title: string; park: boolean; geometry: ShapeGeometry }
const zones: Zone[] = []

const graph = mountGraph(document.body, {
  definition: defineGraph({
    marks: [
      shapes(zones, {
        label: {
          text: 'title',
          size: 14,
          weight: 'bold',
          color: 'var(--graph-ink-muted)',
          maxWidth: 140,
          background: (zone) => zone.park,
        },
      }),
    ],
    states: { named: { label: 'always' } },
  }),
  ariaLabel: 'Zones',
})

graph.states.set('named', { shapes: ['north'] })
```

- `text` is a channel and `background`, `color`, `size` (12 pixels at zoom 1 by default), `weight`, `font` and `maxWidth` are styles, as for nodes (styling skill). A text that is not a non-empty string draws no label. A shape has one label, horizontal, whatever its geometry.
- The anchor depends on the geometry: the point of a polygon farthest from its outline and its holes (on a multipolygon, in its widest part), the center of a circle or a rectangle, the top of the band of a ring, the middle of the longest segment of a line.
- Labels never overlap, and a shape label gives way to node and edge labels, which are placed first, then the labels of the largest shapes. Like node labels it shrinks when you zoom out and hides under 8 pixels on screen. It follows the fades of its shape and the opacity of its states, not the `opacity` of the mark. A hovered shape forces its label and a selected one comes before the others.
- The states `label` (`true`, `false`, `'always'`) and `labelColor` act on shape labels, and the exports write them.

## Pin shapes to a node

`node` is a channel that returns the key of a node. The geometry is then in world units from where the node is drawn: `{ center: { x: 0, y: 0 }, radius: 80 }` is a disc around it.

```ts
import { defineGraph, mountGraph, nodes, type ShapeGeometry } from '@bruno00o/graph'
import { shapes } from '@bruno00o/graph/shapes'

type Place = { id: string; x: number; y: number }
type Halo = { id: string; root: string; geometry: ShapeGeometry }
const places: Place[] = []
const halos: Halo[] = [
  { id: 'near', root: 'a', geometry: { center: { x: 0, y: 0 }, radius: 120, inner: 60 } },
]

const graph = mountGraph(document.body, {
  definition: defineGraph({
    marks: [
      shapes(halos, { node: 'root', label: (halo) => halo.id, pick: false }),
      nodes(places, { x: 'x', y: 'y' }),
    ],
  }),
  ariaLabel: 'Places and halos',
})
console.log(graph.count().shapes, graph.count().pendingShapes)
```

- A pinned shape follows its node through layouts, drags, glides and `positions.set`, without its geometry being read again. Picking, the lasso, `view.fit` and the exports see it where it is drawn. Layouts do not see it: it takes no room. It does not turn or grow with the node, and it stays under nodes and edges.
- While no node has the key, the shape waits: not drawn, picked, framed, or counted in `count().shapes`; `count().pendingShapes` counts it. It is not an issue. It shows as soon as the node arrives, as an edge does.
- While the node is hidden (folded group, zoom range, time window, hidden layer, or a state with `hide`), the shape is hidden too, and it fades with the node.
- The geometry stays in world units. A pinned shape in degrees (GeoJSON, `{ longitude, latitude }`) is drawn at its own place on the world, far from the node. On a map the world is 512 units wide, so a ring of radius 2 spans about 1.4 degrees of longitude.
- A `node` channel that returns no key (`null`, `undefined`, a value that is not a string or a finite number) pins nothing: the shape is an ordinary one, at the coordinates of its geometry.
