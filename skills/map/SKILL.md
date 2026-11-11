---
name: map
description: >
  Use when drawing a @bruno00o/graph graph inside a MapLibre map: placing nodes by
  longitude and latitude, mounting the graph on a map with mountMapGraph or
  MapGraph in React, drawing great circles and routes that follow roads or other
  lines, switching basemaps or the globe projection, putting a timeline on a map
  graph, exporting the map and the graph as one PNG, and finding why a layout,
  minimap, lens, rotation or view option does nothing on a map. Not for a plain
  graph that only uses coordinates without a map.
metadata:
  purpose: >
    The MapLibre adapter of @bruno00o/graph: mountMapGraph and MapGraph, the
    longitude and latitude channels, who owns the camera, projections, geodesic
    edges and waypoints, what a map graph leaves out, exportMapPng, and the
    mistakes that hide the graph or leak the map.
  type: composition
  library: '@bruno00o/graph'
sources:
  - src/map/index.ts
  - src/map/react.tsx
  - src/map/export.ts
  - src/core/geo.ts
  - src/waypoints.ts
  - src/types.ts
  - docs/content/docs/(guide)/map.mdx
  - docs/content/docs/api/map.mdx
  - docs/content/docs/api/map-graph.mdx
requires:
  - core
---

# Draw a graph on a MapLibre map

`@bruno00o/graph/map` draws the graph as a custom layer of a MapLibre GL JS map (version 6 or later), in the map's own WebGL context. Nodes are placed by `longitude` and `latitude`. Load the core skill first (`intent load @bruno00o/graph#core`): `mountMapGraph` returns the same `GraphInstance` as `mountGraph`, so data updates, states, selection, events, anchors and the store work the same way.

## Setup

1. Install MapLibre next to the library. It is an optional peer dependency, and `@bruno00o/graph/map` imports nothing from it at run time: the map you create is the only one.

   ```sh
   npm install @bruno00o/graph maplibre-gl
   ```

2. Import the MapLibre stylesheet once. TypeScript checks side-effect CSS imports against CSS module types: bundlers declare them, otherwise add `declare module '*.css'`.

   ```ts no-check
   import 'maplibre-gl/dist/maplibre-gl.css'
   ```

3. Give the map container a height, create the map, place the nodes with `longitude` and `latitude` channels, and mount.

   ```ts
   import { defineGraph, edges, nodes } from '@bruno00o/graph'
   import { mountMapGraph } from '@bruno00o/graph/map'
   import { Map as MapLibreMap } from 'maplibre-gl'

   type Place = { id: string; name: string; lng: number; lat: number; group: string }
   type Route = { id: string; from: string; to: string }

   const places: Place[] = [
     { id: 'a', name: 'Alpha', lng: 2.35, lat: 48.85, group: 'north' },
     { id: 'b', name: 'Beta', lng: 13.4, lat: 52.52, group: 'north' },
     { id: 'c', name: 'Gamma', lng: 12.5, lat: 41.9, group: 'south' },
   ]
   const routes: Route[] = [
     { id: 'r1', from: 'a', to: 'b' },
     { id: 'r2', from: 'a', to: 'c' },
   ]

   const definition = defineGraph({
     marks: [
       edges(routes, { source: 'from', target: 'to' }),
       nodes(places, { longitude: 'lng', latitude: 'lat', label: 'name', color: 'group' }),
     ],
   })

   const container = document.querySelector<HTMLElement>('#map')
   if (!container) throw new Error('No #map element')
   const map = new MapLibreMap({
     container,
     style: 'https://tiles.openfreemap.org/styles/positron',
     center: [10, 48],
     zoom: 3,
   })
   const graph = mountMapGraph(map, { definition, ariaLabel: 'Places and routes' })
   graph.view.fit({ padding: 40 })

   graph.destroy()
   map.remove()
   ```

   Result: nodes sit on their places and follow the map. `mountMapGraph` accepts a map with any style, before or after its style loads, and adds a custom layer on top of the style (or under `beforeId`). The last two lines show the order of teardown: destroy the graph first, then `map.remove()`; or pass a `signal` to `mountMapGraph` and abort it before removing the map.

## Core Patterns

### Place nodes and frame them

- `longitude` and `latitude` are channels (a field name or a function): degrees, Web Mercator, latitude from -85.05 to 85.05. Map centers are `[longitude, latitude]` in MapLibre, in that order.
- `x` and `y` in world units work too (the world spans 512 units, longitude -180 at x 0). A node with neither is placed near its placed neighbors, or on a spiral.
- Node sizes are in screen pixels: a node keeps its size as the map zooms. Edges are straight lines in Web Mercator unless they are great circles or have waypoints.
- The map keeps its own camera at mount and the graph does not frame its nodes by itself. Call `graph.view.fit({ padding: 40 })` right after mounting; it waits until the map is measured. Every `fit` takes its own `padding` (32 pixels by default).
- `geoToWorld({ longitude, latitude })` and `worldToGeo({ x, y })` convert between degrees and world units. The zoom of the graph is `2 ** map.getZoom()`.

### Know who moves what

The map owns the camera, its limits and its gestures. Dragging the background, the wheel, pinches and double clicks on the background move the map, and the graph follows: `graph.view.get()` and `viewchange` report the map's camera. The graph owns its elements: hover, clicks, selection, lasso, node drag, focus and keyboard. While a node is dragged or a lasso drawn, the graph pauses the map's drag and box zoom; a double click on a node does not zoom the map.

- `graph.view.set`, `fit` and `zoomBy` move the map with `jumpTo`, animations included. The graph keyboard works: arrows move the focus, Shift and arrows pan, `+`, `-` and `0` zoom and fit.
- `update({ view })` has no effect. `initialView`, `view` and `onViewChange` are not options of `mountMapGraph`.
- The map stays north up and without pitch: `mountMapGraph` turns off rotation and pitch (and the largest pitch) and gives them back when the last graph on the map is destroyed.
- On a flat map the graph is drawn once, between longitudes -180 and 180, on the world copy under the camera: across the antimeridian a node and its edges show on one side only.

### Switch basemaps

`map.setStyle(style)` keeps the graph on the map, whether the style is a URL or an object and whether MapLibre patches the old style or reloads it. The graph is drawn on top of the new style, or under the layer named by `beforeId` when the new style has it. Colors that read well on a light basemap can vanish on a dark one or on imagery: switch node and edge colors with the basemap, a light color with a dark outline on dark ones. See the [basemaps example](https://bruno00o.github.io/graph/examples/basemaps).

`id` (default `'graph'`) names the layer; two graphs on one map need two ids. `beforeId` names a style layer to draw under, such as the place labels of the basemap.

### Use the globe

The graph follows the projection of the map. Set the globe on style load and nodes, edges, labels, badges, images, hulls and the lasso go with it:

```ts
import { Map as MapLibreMap } from 'maplibre-gl'

declare const map: MapLibreMap

map.on('style.load', () => map.setProjection({ type: 'globe' }))
```

If the style is already loaded when you switch, call `map.setProjection({ type: 'globe' })` directly; `style.load` fires again after every `setStyle`. The framing from `fit` does not depend on the projection and is not redone by the switch. On the globe, an element on the far side is hidden and cannot be picked, and an edge that goes behind the horizon is cut there. Edges between distant nodes bend with the surface; short ones stay straight. MapLibre turns the globe into a flat map between zoom 11 and 12 and the graph turns with it. `view.toScreen` and `toWorld` account for the globe.

### Draw great circles

`geodesic` on an edge mark (a style: a constant or a function of the item) makes edges follow the shortest path over the Earth between nodes placed by `longitude` and `latitude`.

```ts
import { edges } from '@bruno00o/graph'

type Route = { id: string; from: string; to: string; long: boolean }
const routes: Route[] = []

const arcs = edges(routes, { source: 'from', target: 'to', geodesic: (route) => route.long })
```

On the globe such an edge is an arc of the sphere. On a flat map it bends toward the poles, and one that crosses the antimeridian is cut in two, each part reaching the edge of the world. Arrows, dashes, flows, labels and picking follow the path. Geodesic edges are never bundled, and an edge with waypoints ignores `geodesic`. The option works without a map as well.

### Draw routes along a network

`waypoints` gives an edge the points of a road, a river or any line, in order from source to target. The edge still starts and ends on its nodes; only the points between are fixed. `lineWaypoints` reads a GeoJSON `LineString` or `MultiLineString` geometry (`LineStringGeometry` and `MultiLineStringGeometry` are structural types: a `GeoJSON.LineString` fits) as `{ longitude, latitude }` points and drops the first and last positions, which usually sit on the nodes; `{ keepEnds: true }` keeps them.

```ts
import { edges, lineWaypoints, type LineStringGeometry } from '@bruno00o/graph'

type Road = { id: string; from: string; to: string; geometry: LineStringGeometry }
const roads: Road[] = []

const network = edges(roads, {
  source: 'from',
  target: 'to',
  waypoints: (road) => lineWaypoints(road.geometry),
})
```

- A waypoint is `{ longitude, latitude }`, `{ x, y }` or `[x, y]` in world units. Invalid points are skipped, and no point draws a plain edge.
- On a flat map a line that crosses the antimeridian takes the short way and is drawn on both sides. On the globe it follows the surface and is cut behind the horizon; the first and last segments, from the nodes to the line, stay straight on screen.
- Corners are sharp: give the line more points for a smoother curve. A waypoint edge is never bundled, routed, bridged or bent beside parallel edges.

### Use the map in React

`<MapGraph>` from `@bruno00o/graph/map/react` mounts the graph on the map you pass and destroys it on unmount, or when `map`, `id` or `beforeId` change. It takes the props of `<Graph>` without `initialView`, `view`, `onViewChange`, `className` and `style`, and renders no element: its children render where it stands, with the graph in context, so the hooks, `<Anchor>`, `<Legend>` and `<Timeline>` work inside it. Create the map in `useEffect`, never `useLayoutEffect`: on unmount React runs the layout cleanup of `<MapGraph>` before the passive cleanup that removes the map, so the graph leaves the map first.

```tsx
import { defineGraph, nodes } from '@bruno00o/graph'
import { MapGraph } from '@bruno00o/graph/map/react'
import { Timeline } from '@bruno00o/graph/react'
import { Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'

type Place = { id: string; name: string; lng: number; lat: number; opened: number }
const places: Place[] = []
const definition = defineGraph({
  marks: [
    nodes(places, { longitude: 'lng', latitude: 'lat', label: 'name', time: 'opened' }),
  ],
})

export function Places() {
  const host = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  useEffect(() => {
    if (!host.current) return
    const created = new MapLibreMap({
      container: host.current,
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: [10, 48],
      zoom: 3,
    })
    setMap(created)
    return () => created.remove()
  }, [])
  return (
    <div style={{ position: 'relative', height: 480 }}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {map ? (
        <MapGraph map={map} definition={definition} ariaLabel="Places">
          <Timeline mode="grow" />
        </MapGraph>
      ) : null}
    </div>
  )
}
```

Outside `<MapGraph>`, give the graph to `<Legend>`, `<Timeline>`, `useLegend` or `useTimeline` through their `graph` prop or option. The `ref` of `<MapGraph>` gives the instance.

### Put a timeline on the map

The time window works on a map as on any graph (time skill). Without React, create the timeline with `createTimeline(graph, { mode: 'grow' })`, draw it with `mountTimeline`, and destroy in reverse order: the view, the timeline, the graph, then `map.remove()`.

### Export the map with the graph

`exportMapPng(graph, options)` saves the map and the graph in one PNG: it draws the map again in a hidden element at the chosen pixel ratio, waits for its tiles, draws the graph above and writes the attribution in the bottom right corner, which most tile licenses require.

```ts
import { exportMapPng } from '@bruno00o/graph/map'
import type { GraphInstance } from '@bruno00o/graph'

declare const graph: GraphInstance

const png = await exportMapPng(graph, { pixelRatio: 2, labels: 'visible', timeout: 20_000 })
const link = document.createElement('a')
link.href = URL.createObjectURL(png)
link.download = 'map.png'
link.click()
```

- `attribution` overrides the text, which defaults to what the map shows, or else the attribution of its sources. `labels` is `'visible'`, `'all'` or `'none'`. Tiles still missing after `timeout` (milliseconds) are left out. On the globe the image shows the globe as on screen.
- It throws for a destroyed graph or one not mounted by `mountMapGraph`, and a `RangeError` for a `pixelRatio` that is not a positive number. It rejects when the hidden map cannot load its style. A map export takes 1 to 7 seconds depending on tiles.
- `exportPng` and `exportSvg` from `@bruno00o/graph/export` draw the graph alone, without the map.

### Make MapLibre's worker load with a bundler

MapLibre loads tiles in a web worker it looks for next to its own module. Once a bundler has moved that module, give MapLibre the worker URL before creating the map. With Vite:

```ts no-check
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(workerUrl)
```

The `?worker&url` query is a Vite import with no types outside Vite, so this fragment is not typechecked. In a project that includes it, add `vite/client` to `types`, or declare the module in a `.d.ts` file (`declare module '*?worker&url' { const url: string; export default url }`). `optimizeDeps.exclude` is not enough at build time.

### Groups, hulls and spreading on a map

Hulls and groups work, on the globe too. A group needs no coordinates: its container encloses its children, and a folded group starts at their center. A `groups()` mark without `units` takes the units of its members, so groups of geo-placed nodes keep their pixel size. The `padding` of a container is in pixels. Containers are translucent on a map by default (`container.fillOpacity` changes it, 1 is opaque). Places that share coordinates are spread around their place when their group unfolds, and go back when it folds; `container: { spread: false }` keeps them stacked.

## Common Mistakes

### HIGH Expecting a layout to place nodes on a map

A `layout` in the definition is ignored (a development warning once), and `graph.layout.run` rejects with an `Error`. Give every node a `longitude` and a `latitude`, or `x` and `y` in world units. The same goes for `background`, `bundling`, `routing` and `bridges`: ignored.

### HIGH Removing the map before the graph

Destroying the graph removes its layer and gives the map's gestures, rotation and pitch back, which needs a live map: call `graph.destroy()` before `map.remove()`, or pass a `signal` and abort it first. In React, create the map in `useEffect` so `<MapGraph>` unmounts before the map is removed.

### HIGH Passing a view to a map graph

The map holds the view. `initialView`, `view` and `onViewChange` are not accepted, and `update({ view })` is ignored.

```ts expect-error=TS2353
import { defineGraph, nodes } from '@bruno00o/graph'
import { mountMapGraph } from '@bruno00o/graph/map'
import type { Map as MapLibreMap } from 'maplibre-gl'

type Place = { id: string; lng: number; lat: number }
const places: Place[] = []
declare const map: MapLibreMap

mountMapGraph(map, {
  definition: defineGraph({ marks: [nodes(places, { longitude: 'lng', latitude: 'lat' })] }),
  ariaLabel: 'Places',
  view: { x: 0, y: 0, zoom: 1 },
})
```

Move the map instead (`map.jumpTo`, `graph.view.set` or `fit`). The `view` limits and `padding` of the definition change nothing either: the map's own zoom limits apply.

### MEDIUM Swapping longitude and latitude

MapLibre takes `[longitude, latitude]`; `geoToWorld` takes `{ longitude, latitude }`. Map `longitude` to the east-west field, `latitude` to the north-south one. A graph that lands in the ocean or off the world has them swapped, or degrees in a projected unit.

### MEDIUM Expecting rotation, pitch, terrain, lens or minimap

The map stays north up and without pitch, in a flat or globe projection. The lens does nothing (`graph.lens.set` is ignored), the minimap draws nothing on a map graph and warns in development, and the SVG export draws the flat map. In development the graph warns when the map is rotated or tilted.

### MEDIUM Colors tuned for one basemap

Node and edge colors that read on a light style vanish on a dark one or on imagery. Compute colors from the current basemap and rebuild the definition with `graph.update({ definition })` when it changes.

### MEDIUM Forgetting the attribution in an export

`exportMapPng` writes the attribution the map shows. Passing `attribution: ''` removes it, and most tile licenses forbid that. Use `exportPng` only when the map should not be in the image.

### MEDIUM A map with no height

MapLibre sizes the map from its container. A container with no height draws nothing, graph included; give it a height in CSS before creating the map.

## Completion

The task is done when:

- the map container has a height, MapLibre 6 is installed and its stylesheet is imported;
- every node has `longitude` and `latitude` (or `x` and `y`), and no `layout`, `view`, `initialView`, `onViewChange` or `bundling` is set for the map graph;
- the graph is framed with `graph.view.fit({ padding })` after mounting;
- teardown destroys the graph before `map.remove()`, or a `signal` does it;
- with React, `<MapGraph>` renders after the map exists, and the map is created in `useEffect`;
- with a bundler, MapLibre's worker URL is set;
- exports use `exportMapPng` when the basemap must appear, with its attribution.

## References

Every page has a Markdown version: add `.md` to its URL.

- [Map](https://bruno00o.github.io/graph/docs/map), [mountMapGraph and exportMapPng](https://bruno00o.github.io/graph/docs/api/map), [MapGraph](https://bruno00o.github.io/graph/docs/api/map-graph), [Waypoints](https://bruno00o.github.io/graph/docs/marks#waypoints)
- Examples: [nodes on a flat map](https://bruno00o.github.io/graph/examples/flat-map), [basemaps](https://bruno00o.github.io/graph/examples/basemaps), [map component](https://bruno00o.github.io/graph/examples/map-component), [great circles](https://bruno00o.github.io/graph/examples/great-circles), [flows on a map](https://bruno00o.github.io/graph/examples/map-flows), [routes along a network](https://bruno00o.github.io/graph/examples/map-routes), [map in time](https://bruno00o.github.io/graph/examples/map-time-window)
- The `geo` layout (`@bruno00o/graph/layouts`) uses the same projection for the same data without a map: [Layout, geography](https://bruno00o.github.io/graph/docs/layout#geography).
