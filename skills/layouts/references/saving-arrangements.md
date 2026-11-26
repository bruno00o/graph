# Save a whole arrangement

An application can let the user save the arrangement of a view as one record of its own, such as a named layout: one value that holds every node, not one row per node as `persistPositions` writes (tanstack-db skill). Take the record from `positions.snapshot()` and give it back at the next mount with `initialPositions`, or to a mounted graph with `positions.set`.

```ts
import { defineGraph, mountGraph, nodes } from '@bruno00o/graph'
import type { Key, Point } from '@bruno00o/graph'

type Item = { id: string; label: string }

declare const items: Item[]
declare const container: HTMLElement
declare function loadArrangement(): [Key, Point][] | undefined
declare function storeArrangement(entries: [Key, Point][]): void

const definition = defineGraph({ marks: [nodes(items, { label: 'label' })] })

const graph = mountGraph(container, {
  definition,
  ariaLabel: 'Sample graph',
  initialPositions: loadArrangement(),
})

export function save() {
  storeArrangement([...graph.positions.snapshot()])
}

export function restore(entries: Iterable<readonly [Key, Point]>) {
  graph.positions.set(entries, { duration: 400 })
}
```

- `initialPositions` is read once and emits nothing; `undefined` means no entries. `positions.set` emits `positionchange` with the origin `'api'`, and the `duration` glides.
- A record outlives the data. An entry whose key is not a node of the graph is ignored by both ways, without a warning, and the other entries apply. A node without an entry is new: the layout places it next to its placed neighbors, or it starts on the spiral. A snapshot is complete, so the next save drops stale entries. To clean a record you hold, keep the entries whose key `graph.positions.get(key)` knows.
- To tell user moves from replayed ones, read the `origin` of `positionchange`: `'drag'` for a dragged node, `'layout'` for a layout result, `'api'` for `positions.set` and `positions.reset`, `'agent'` for the actions of the agent bridge. The event fires inside `set`, so a flag around your own replay is enough to keep it from counting as an edit; a layout result is an edit too.

```ts
import type { GraphInstance, Key, Point } from '@bruno00o/graph'

export function track(graph: GraphInstance) {
  let restoring = false
  let unsaved = false
  graph.on('positionchange', ({ origin }) => {
    if (origin === 'api' && restoring) return
    unsaved = true
  })
  return {
    replay(entries: Iterable<readonly [Key, Point]>) {
      restoring = true
      graph.positions.set(entries)
      restoring = false
      unsaved = false
    },
    unsaved: () => unsaved,
  }
}
```

## On a map

A snapshot is in the world units of the surface the graph is on, so on a map it is a record of the map, and a plain graph's snapshot does not fit it. To save nodes placed by `longitude` and `latitude` across surfaces, save degrees: `worldToGeo` on each point when saving, `geoToWorld` when restoring. `worldToGeo` does not wrap the longitude, so wrap a node dragged past the antimeridian into -180 to 180 yourself. The `geo` of `positionchange` is already wrapped, and exists on a map only.

```ts
import { geoToWorld, type GeoPoint, type Key, type Point, worldToGeo } from '@bruno00o/graph'

function wrap(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180
}

export function degrees(entries: Iterable<readonly [Key, Point]>) {
  return [...entries].map(([key, point]) => {
    const { longitude, latitude } = worldToGeo(point)
    return [key, { longitude: wrap(longitude), latitude }] as const
  })
}

export function world(entries: Iterable<readonly [Key, GeoPoint]>) {
  return [...entries].map(([key, geo]) => [key, geoToWorld(geo)] as const)
}
```
