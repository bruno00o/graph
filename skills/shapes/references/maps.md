# Shapes on a map

`mountMapGraph` and `<MapGraph>` draw shapes under containers, hulls, edges and nodes, above the basemap, on a flat map and on the globe. They are picked, taken by the lasso, styled by states, labeled, and drawn by `exportMapPng` and by the SVG export (flat) like on any graph. Give geometry in degrees (GeoJSON, or `{ longitude, latitude }` points) and it lines up with the basemap and with nodes placed by `longitude` and `latitude`.

```ts
import { defineGraph, nodes, type ShapeGeometry } from '@bruno00o/graph'
import { mountMapGraph } from '@bruno00o/graph/map'
import { shapes } from '@bruno00o/graph/shapes'
import type { Map as MapLibreMap } from 'maplibre-gl'

type Area = { id: string; geometry: ShapeGeometry }
type Place = { id: string; lng: number; lat: number }
declare const map: MapLibreMap
const places: Place[] = []
const areas: Area[] = [
  { id: 'reach', geometry: { center: { longitude: 2.35, latitude: 48.86 }, radius: 250_000 } },
  {
    id: 'coast',
    geometry: {
      type: 'Polygon',
      coordinates: [[[-5, 43], [8, 43], [8, 51], [-5, 51], [-5, 43]]],
    },
  },
]

const graph = mountMapGraph(map, {
  definition: defineGraph({
    marks: [
      shapes(areas, { label: 'id' }),
      nodes(places, { longitude: 'lng', latitude: 'lat' }),
    ],
  }),
  ariaLabel: 'Areas and places',
})
graph.view.fit({ padding: 40 })
```

Result: `reach` is a circle of 250 kilometers on the Earth and `coast` a polygon in degrees, both labeled with their id.

- A circle centered on a place in degrees takes its radius in meters and becomes a polygon of 128 points that follows the surface of the Earth. A circle in world units keeps its radius in world units.
- A shape in world units (`{ x, y }` points, a rectangle) stays in world units, as a node without `longitude` and `latitude` does. The world is 512 units wide, so a rectangle 100 units wide covers a fifth of the Earth.
- A shape in degrees that crosses the antimeridian takes the short way and shows on both sides of a flat map, picked and lassoed on both sides. This holds off a map too, for shapes in degrees; never for circles or for shapes in world units. Nodes and their edges still show on one side.
- On the globe, outlines and fills follow the surface (long edges are split into shorter ones, once per geometry), and the part behind the horizon is neither drawn nor picked.
- A pinned shape follows its node on a map; its geometry is in world units around the node, where a radius of 2 spans about 1.4 degrees of longitude.
