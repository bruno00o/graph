# Move a graph between its canvas and a map

One graph, two definitions, one `update` each way. The map reads `longitude` and `latitude`, the canvas a `geo` layout that uses the same projection.

```ts
import { defineGraph, edges, geoToWorld, mountGraph, nodes, type View } from '@bruno00o/graph'
import { geo } from '@bruno00o/graph/layouts'
import { mapSurface } from '@bruno00o/graph/map'
import type { Map as MapLibreMap } from 'maplibre-gl'

type Place = { id: string; name: string; lng: number; lat: number }
type Route = { id: string; from: string; to: string }
declare const places: Place[]
declare const routes: Route[]
declare const element: HTMLElement
declare const map: MapLibreMap

const center = { longitude: 10, latitude: 48 }
const scale = 2048
const origin = geoToWorld(center)

const plain = defineGraph({
  marks: [
    edges(routes, { source: 'from', target: 'to' }),
    nodes(places, { label: 'name', units: 'screen' }),
  ],
  layout: geo<Place>({ longitude: 'lng', latitude: 'lat', center, scale }),
})
const onMap = defineGraph({
  marks: [
    edges(routes, { source: 'from', target: 'to' }),
    nodes(places, { longitude: 'lng', latitude: 'lat', label: 'name' }),
  ],
})

const graph = mountGraph(element, { definition: plain, ariaLabel: 'Places' })
const surface = mapSurface(map)

const toMap = (view: View): View => ({
  x: view.x / scale + origin.x,
  y: view.y / scale + origin.y,
  zoom: view.zoom * scale,
})

export function showMap(): void {
  graph.update({ surface, definition: onMap, view: toMap(graph.view.get()) })
}

export function hideMap(): void {
  graph.update({ surface: null, definition: plain })
}
```

## In React

`useMapSurface(map)` makes the surface of the map you created, `null` while `map` is `null`, and releases it on unmount. The map is created in `useEffect` inside a child of `<Graph>`, which sits above the canvas and hides with `opacity`.

```tsx
import { defineGraph, nodes } from '@bruno00o/graph'
import { useMapSurface } from '@bruno00o/graph/map/react'
import { Graph } from '@bruno00o/graph/react'
import { Map as MapLibreMap } from 'maplibre-gl'
import { type CSSProperties, useEffect, useRef, useState } from 'react'

type Place = { id: string; name: string; lng: number; lat: number }
const places: Place[] = []
const plain = defineGraph({ marks: [nodes(places, { label: 'name', units: 'screen' })] })
const onMap = defineGraph({
  marks: [nodes(places, { longitude: 'lng', latitude: 'lat', label: 'name' })],
})

function Backdrop({ shown, onCreate }: { shown: boolean; onCreate: (map: MapLibreMap | null) => void }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!host.current) return
    const created = new MapLibreMap({
      container: host.current,
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: [10, 48],
      zoom: 3,
    })
    onCreate(created)
    return () => {
      onCreate(null)
      created.remove()
    }
  }, [onCreate])
  const style: CSSProperties = {
    position: 'absolute',
    inset: 0,
    opacity: shown ? 1 : 0,
    pointerEvents: shown ? 'auto' : 'none',
  }
  return <div ref={host} style={style} />
}

export function Places({ wanted }: { wanted: boolean }) {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const surface = useMapSurface(map)
  const there = wanted && surface !== null
  return (
    <Graph
      definition={there ? onMap : plain}
      surface={there ? surface : null}
      ariaLabel="Places"
      style={{ height: 480 }}
    >
      <Backdrop shown={there} onCreate={setMap} />
    </Graph>
  )
}
```
