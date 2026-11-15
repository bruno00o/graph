---
name: map
description: >
  Use when drawing a @bruno00o/graph graph inside a MapLibre map: placing nodes by
  longitude and latitude, mounting the graph on a map with mountMapGraph or
  MapGraph in React, moving one graph between its own canvas and a map with a
  surface, drawing great circles and routes that follow roads or other lines,
  switching basemaps or the globe projection, putting a timeline on a map graph,
  drawing areas and zones on the map, exporting the map and the graph as one PNG,
  and finding why a layout, minimap, lens, rotation or view option does nothing
  on a map. Not for a plain graph that only uses coordinates without a map.
metadata:
  purpose: >
    The MapLibre adapter of @bruno00o/graph: mountMapGraph and MapGraph, map
    surfaces that move a graph onto a map and back, the longitude and latitude
    channels, who owns the camera, projections, geodesic edges and waypoints,
    what a map graph leaves out, exportMapPng, and the mistakes that hide the
    graph or leak the map.
  type: composition
  library: '@bruno00o/graph'
sources:
  - src/map/index.ts
  - src/map/react.tsx
  - src/host/canvas-surface.ts
  - src/map/export.ts
  - src/core/geo.ts
  - src/host/position-event.ts
  - src/shapes/wrap.ts
  - src/shapes/subdivide.ts
  - src/waypoints.ts
  - src/types.ts
  - docs/content/docs/(guide)/map.mdx
  - docs/content/docs/api/map.mdx
  - docs/content/docs/api/map-graph.mdx
  - docs/content/docs/api/graph-component.mdx
requires:
  - core
---

# Draw a graph on a MapLibre map

`@bruno00o/graph/map` draws the graph as a custom layer of a MapLibre GL JS map (version 6 or later), in the map's own WebGL context. Nodes are placed by `longitude` and `latitude`. Load the core skill first (`intent load @bruno00o/graph#core`): `mountMapGraph` returns the same `GraphInstance` as `mountGraph`, so data updates, states, selection, events, anchors and the store work the same way. A graph mounted on its own canvas can also move onto a map and back, keeping everything: see [Move one graph between its canvas and a map](#move-one-graph-between-its-canvas-and-a-map).

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
- A node with `longitude` and `latitude` is sized in screen pixels (`units` defaults to `'screen'`): it keeps its size as the map zooms. `units: 'world'` scales it with the map (the world is 512 units wide at map zoom 0, so `size: 10` spans about 7 degrees). A node placed by `x` and `y`, or by neither, defaults to `'world'` and is huge at map zooms: give it `units: 'screen'`. A `groups()` mark takes the units of its first member. Edges are straight lines in Web Mercator unless they are great circles or have waypoints.
- The map keeps its own camera at mount and the graph does not frame its nodes by itself. Call `graph.view.fit({ padding: 40 })` right after mounting; it waits until the map is measured. Every `fit` takes its own `padding` (32 pixels by default).
- `geoToWorld({ longitude, latitude })` and `worldToGeo({ x, y })` convert between degrees and world units. The zoom of the graph is `2 ** map.getZoom()`.

### Know who moves what

The map owns the camera, its limits and its gestures. Dragging the background, the wheel, pinches and double clicks on the background move the map, and the graph follows: `graph.view.get()` and `viewchange` report the map's camera. The graph owns its elements: hover, clicks, selection, lasso, node drag, focus and keyboard. While a node is dragged or a lasso drawn, the graph pauses the map's drag and box zoom; a double click on a node does not zoom the map. With a lasso whose `modifier` is `null` (interaction skill), every drag on the background draws a lasso, so the map moves with the wheel, pinches and the keyboard only. A shape editor takes the gestures on the shapes it edits the same way.

- `graph.view.set`, `fit` and `zoomBy` move the map with `jumpTo`, animations included. The graph keyboard works: arrows move the focus, Shift and arrows pan, `+`, `-` and `0` zoom and fit.
- `update({ view })` moves nothing on a map: a controlled `view` waits for the canvas. `initialView`, `view` and `onViewChange` are not options of `mountMapGraph`.
- The map stays north up and without pitch: a graph on the map turns off rotation and pitch (and the largest pitch) and gives them back when the last graph on the map is destroyed or leaves it.
- On a flat map the graph is drawn once, between longitudes -180 and 180, on the world copy under the camera: across the antimeridian a node and its edges show on one side only (shapes in degrees show on both sides).

- A node you drag stays where it was dropped, even when its data says otherwise, until its own coordinates change. `graph.positions.reset()` puts every node back on its `longitude` and `latitude` with a glide, `reset(keys)` only some; a node whose data gives no position stays. `positionchange` carries `geo` on a map: the moved nodes as `{ longitude, latitude }` in degrees, the longitude from -180 up to 180 even across the antimeridian. `persistPositions({ collection, longitude: 'lng', latitude: 'lat' })` writes them back (tanstack-db skill).
- `graph.drawsOnMap` is `true` while the graph draws on a map, mounted there by `mountMapGraph` or `<MapGraph>` or moved there with a surface: code shared with a plain graph reads it to leave out what a map does not draw, such as a layout or the minimap.
- Nodes that share a place draw in the order they arrived, so a large one can cover a small one. `order` on `nodes()` (lower values first, under the others; styling skill) stacks large nodes under small ones, and the node on top is the one a click picks.

### Move one graph between its canvas and a map

`mountGraph` draws on its own canvas. `mapSurface(map)` (`@bruno00o/graph/map`) makes a surface for a MapLibre map: `graph.update({ surface })` moves the graph onto it, `graph.update({ surface: null })` brings it back. The data, selection, states, folded groups, hidden layers, time window and listeners stay. Give each side its definition in the same `update`: the map reads `longitude` and `latitude`, the canvas a layout (`geo` uses the same projection, layouts skill), and both apply together, so the layout never sees the other side's nodes.

The recipe, with both definitions, is in [references/surfaces.md](references/surfaces.md).

- Each surface keeps its own positions and view. Back on a side, nodes are where you left them and no layout runs; nodes that arrived meanwhile are placed on return (by the layout on the canvas, by their coordinates on the map), and a layout run the move stopped starts again. Positions are in the world units of the side the graph is on, so `positions.snapshot()` reads that side.
- `view` given with a new `surface` is the view to take there, on the canvas too. Without it the map shows its own camera the first time, and the canvas the view it had. The plain view is in layout units and the map's zoom is `2 ** map.getZoom()`: convert with the `center` and `scale` given to `geo`, as in the recipe.
- `graph.store.get().surface` (`'canvas'` or `'map'`) and `graph.drawsOnMap` say which side the graph is on; `surfacechange` (`{ surface, previous }`) fires once the graph and its companions have moved.
- Hide the map element while the graph is on its canvas with `opacity: 0` and `pointer-events: none`, never `display: none`: MapLibre sizes the map from its element, and a graph that comes to a map of size 0 draws nothing.
- A surface holds one graph at a time (a second graph throws an `Error`) and keeps its layer and renderer after the graph leaves, so the next visit is quick. `surface.release()` frees them and sends the graph on it back to its canvas. `map.remove()` does the same, with a development warning, and `graph.destroy()` releases every surface the graph visited.
- `mountGraph(container, { surface })` mounts on the map at once, and `mountMapGraph(map, options)` is that with a surface released with the graph.
- Companions follow without being created again: the minimap empties and sleeps on the map and draws the canvas positions on return, the lens hides on the map and shows again, the shape editor drops a gesture in progress (and proposes a text being typed) and draws in degrees on the map with `units: 'auto'`, devtools show the surface, presence shows cursors only between people on the same surface. The legend, the timeline and anchors need nothing. Code of your own that sits beside the graph listens to `surfacechange`.
- `persistPositions` writes the moves of the side the graph is on when you call it: pass `surfaces: ['canvas', 'map']` for both, into different fields (tanstack-db skill). `positionchange.surface` names the side of its positions.
- Without a surface, a graph can still be destroyed and mounted again on the other side: keep `positions.snapshot()` of each side and give it as `initialPositions`. A snapshot belongs to one surface, `initialPositions` is read once at mount, and nodes with `longitude` and `latitude` ignore their entry.

### Know where the graph sits

On a map, the graph inserts `graph.element` into the map container right after the canvas container of MapLibre, as its sibling, absolutely positioned over the whole map. It clips its content at the edges of the map and takes no pointer events itself (the map canvas keeps them). It has no `z-index`, so it stacks by document order: above the map canvas and its markers, under the popups of MapLibre, then the controls (`z-index` 2).

- Put your own overlays in `graph.anchors` or `<Anchor>` (tools and react skills): their layer lives inside `graph.element`, over markers and under popups and controls, and follows the camera.
- An element of your own in the map container goes over `graph.element` when it comes later in the document or has a `z-index` of 1 or more.
- A child you add to `graph.element` yourself is clipped at the edges of the map and gets no pointer events unless it sets `pointer-events: auto`.

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

If the style is already loaded when you switch, call `map.setProjection({ type: 'globe' })` directly; `style.load` fires again after every `setStyle`. The framing from `fit` does not depend on the projection and is not redone by the switch. On the globe, an element on the far side is hidden and cannot be picked, and an edge that goes behind the horizon is cut there. Edges between distant nodes bend with the surface; short ones stay straight. MapLibre turns the globe into a flat map between zoom 11 and 12 and the graph turns with it. `view.toScreen` and `toWorld` account for the globe. Anchored HTML follows the globe too: an anchor on a node, nodes, state, edge or point sits where its target is drawn, during the flat to globe transition as well, takes the size of a node at that place, scales with the globe there when it has `scale: true`, and hides while its target is behind the horizon.

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

To move one graph between its canvas and a map in React, keep `<Graph>` and give it a `surface` ([below](#move-one-graph-in-react)). `<MapGraph>` from `@bruno00o/graph/map/react` is for a graph that only lives on a map: it mounts the graph on the map you pass and destroys it on unmount, or when `map`, `id` or `beforeId` change. It takes the props of `<Graph>` without `initialView`, `view`, `onViewChange`, `className` and `style`, and renders no element: its children render where it stands, with the graph in context, so the hooks, `<Anchor>`, `<Legend>` and `<Timeline>` work inside it. Create the map in `useEffect`, never `useLayoutEffect`: on unmount React runs the layout cleanup of `<MapGraph>` before the passive cleanup that removes the map, so the graph leaves the map first.

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

### Move one graph in React

`useMapSurface(map)` from `@bruno00o/graph/map/react` makes the surface of the map you created (`null` while `map` is `null`) and releases it on unmount. Give it to `<Graph surface>` with the definition of the same side: both apply in one `update`, and nothing remounts, so the children, hooks and companions keep their state. Create the map in `useEffect`, inside a child of `<Graph>` that sits above the canvas and hides with `opacity`.

The recipe is in [references/surfaces.md](references/surfaces.md#in-react).

- Read the side with `useGraphState((state) => state.surface)` or `onSurfaceChange`. `useMapSurface` keeps one surface until `map`, `id` or `beforeId` change, then moves the graph to the new one, with one layer on the map.
- To show the same area on both sides, call `map.jumpTo` before switching to the map, and set the plain view in a layout effect of the parent after switching back (it runs after the one of `<Graph>`).
- A map removed while the graph is on it, or a released surface, sends the graph back to its canvas, and it stays there until the `surface` prop changes again. When the component unmounts, the graph is destroyed on the map, with no trip back.
- Do not swap `<Graph>` for `<MapGraph>` to change side: each remounts the graph and loses its state.

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

- `attribution` overrides the text, which defaults to what the map shows, or else the attribution of its sources. `labels` is `'visible'`, `'all'` or `'none'`. `badges: false` leaves the badges of the nodes out. The image has the size of the map times `pixelRatio`: the exact `size` and `grid` of `exportPng` do not exist here, since the map draws the area its camera shows. Tiles still missing after `timeout` (milliseconds) are left out. On the globe the image shows the globe as on screen.
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

### Draw areas on the map

A `shapes()` mark (`@bruno00o/graph/shapes`, shapes skill) draws polygons, circles, rectangles and lines under the nodes and edges, above the basemap, on a flat map and on the globe. Shapes are picked, lassoed, styled by states and labeled, and `exportMapPng` draws them. Give their geometry in degrees (GeoJSON, or `{ longitude, latitude }` points) so it lines up with the basemap and with nodes placed by `longitude` and `latitude`; a circle centered on a place takes its radius in meters. A shape in world units stays in world units, and the world is 512 units wide, so a rectangle 100 units wide covers a fifth of the Earth.

On a flat map a shape in degrees that crosses the antimeridian shows on both sides, unlike a node. On the globe, long edges are split to follow the surface and the part behind the horizon is neither drawn nor picked. A shape pinned to a node with `node` follows it, with its geometry in world units; a circle or a rectangle in world units faces the screen on the globe, at the scale of the globe at its center, and the shape editor shows its preview, handles and text input the same way. Shapes are listed in the legend, and a shape editor draws and edits them on the map, in degrees (editor skill).

### Groups, hulls and spreading on a map

Hulls and groups work, on the globe too. A group needs no coordinates: its container encloses its children, and a folded group starts at their center. A `groups()` mark without `units` takes the units of its members, so groups of geo-placed nodes keep their pixel size. The `padding` of a container is in pixels. Containers are translucent on a map by default (`container.fillOpacity` changes it, 1 is opaque). Places that share coordinates are spread around their place when their group unfolds, and go back when it folds; `container: { spread: false }` keeps them stacked.

## Common Mistakes

### HIGH Expecting a layout to place nodes on a map

While the graph is on a map, a `layout` in the definition is ignored (a development warning once), and `graph.layout.run` rejects with an `Error`. Give every node a `longitude` and a `latitude`, or `x` and `y` in world units. The same goes for `background`, `bundling`, `routing` and `bridges`, and for `container.layout`. They come back when the graph moves back to its canvas.

### HIGH Removing the map before the graph

Destroying the graph removes its layer and gives the map's gestures, rotation and pitch back, which needs a live map: call `graph.destroy()` before `map.remove()`, or pass a `signal` and abort it first. In React, create the map in `useEffect` so `<MapGraph>` unmounts before the map is removed. A graph moved with a surface survives `map.remove()` or `surface.release()`: it goes back to its canvas, with a development warning, and stays there.

### HIGH Passing a view to a map graph

The map holds the view. `initialView`, `view` and `onViewChange` are not accepted by `mountMapGraph`, and `update({ view })` moves nothing while the graph is on a map. A `view` given with a new `surface` is the one exception: it is the view to take on that surface.

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

### MEDIUM Giving a snapshot to the other surface

A graph moved with `surface` keeps the positions of each side by itself. When you destroy it and mount it again instead, a `positions.snapshot()` from a plain graph holds the units of its layout, and one from a map the world units of the map. Passed as `initialPositions` to the other surface, it places nodes without coordinates in the wrong place. Keep one snapshot for each side.

```ts no-check
const plain = plainGraph.positions.snapshot()
mountMapGraph(map, { definition: onMap, ariaLabel: 'Places', initialPositions: plain })
```

### MEDIUM Swapping longitude and latitude

MapLibre takes `[longitude, latitude]`; `geoToWorld` takes `{ longitude, latitude }`. Map `longitude` to the east-west field, `latitude` to the north-south one. A graph that lands in the ocean or off the world has them swapped, or degrees in a projected unit.

### MEDIUM Expecting rotation, pitch, terrain, lens or minimap

The map stays north up and without pitch, in a flat or globe projection. While the graph is on a map, the lens shows nothing (`graph.lens.set` does not draw) and the minimap is empty; a minimap created there warns in development. Both come back when the graph moves back to its canvas. The SVG export draws the flat map. In development the graph warns when the map is rotated or tilted.

### MEDIUM Hiding the map element with `display: none`

A graph that moves back to its canvas leaves the map element in the page. With `display: none` the map measures 0 by 0, and the graph that comes back to it draws nothing. Hide it with `opacity: 0` and `pointer-events: none`, and show it again when the graph is on it.

### MEDIUM Moving a graph with the definition of the other side

`update({ surface })` without the matching `definition` keeps the old one. A definition with `longitude` and `latitude` on the canvas pins every node at its place in the 512-unit world: no layout moves them, and the graph is a small cluster. A definition without coordinates on the map leaves nodes near their neighbors, on a spiral. Give both in one `update`, as in the recipe.

```ts no-check
graph.update({ surface: null })
graph.update({ surface, definition: onMap })
```

### MEDIUM A second graph on one surface

A surface holds one graph. Moving another graph onto it, or onto a surface whose map was removed, throws an `Error` and the graph stays where it was. Make a surface for each graph with its own `id`, or release the first one.

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
- a graph that moves between its canvas and a map gets its surface and the definition of that side in one `update`, with the map element hidden by `opacity`;
- the graph is framed with `graph.view.fit({ padding })` after mounting, and shapes on the map have geometry in degrees;
- teardown destroys the graph before `map.remove()`, or a `signal` does it;
- with React, `<MapGraph>` (a graph only on a map) or `<Graph surface>` (a graph that moves) renders after the map exists, and the map is created in `useEffect`;
- with a bundler, MapLibre's worker URL is set;
- exports use `exportMapPng` when the basemap must appear, with its attribution.

## References

Every page has a Markdown version: add `.md` to its URL.

- [Map](https://bruno00o.github.io/graph/docs/map), [mountMapGraph, mapSurface and exportMapPng](https://bruno00o.github.io/graph/docs/api/map), [MapGraph and useMapSurface](https://bruno00o.github.io/graph/docs/api/map-graph), [Waypoints](https://bruno00o.github.io/graph/docs/marks#waypoints)
- Examples: [nodes on a flat map](https://bruno00o.github.io/graph/examples/flat-map), [basemaps](https://bruno00o.github.io/graph/examples/basemaps), [map component](https://bruno00o.github.io/graph/examples/map-component), [map and back](https://bruno00o.github.io/graph/examples/map-and-back), [map and back in React](https://bruno00o.github.io/graph/examples/map-and-back-react), [great circles](https://bruno00o.github.io/graph/examples/great-circles), [flows on a map](https://bruno00o.github.io/graph/examples/map-flows), [routes along a network](https://bruno00o.github.io/graph/examples/map-routes), [map in time](https://bruno00o.github.io/graph/examples/map-time-window)
- The `geo` layout (`@bruno00o/graph/layouts`) uses the same projection for the same data without a map: [Layout, geography](https://bruno00o.github.io/graph/docs/layout#geography).
