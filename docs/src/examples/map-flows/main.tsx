import { defineGraph, edges, type GraphInstance, nodes } from '@bruno00o/graph'
import { mountMapGraph } from '@bruno00o/graph/map'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { type Ref, useLayoutEffect, useRef, useState } from 'react'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

setWorkerUrl(workerUrl)

interface Spot {
  readonly id: string
  readonly label: string
  readonly hub: boolean
  readonly group: string
  readonly longitude: number
  readonly latitude: number
}

interface Route {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly volume: number
  readonly trunk: boolean
}

const next = random(6)
const hubs: ReadonlyArray<readonly [number, number]> = [
  [-98, 38],
  [-50, -12],
  [12, 47],
  [70, 22],
  [128, -6],
]
const spots: Spot[] = []
const routes: Route[] = []
const route = (from: string, to: string, volume: number, trunk: boolean) =>
  routes.push({ id: `r${routes.length}`, from, to, volume, trunk })
hubs.forEach(([longitude, latitude], index) => {
  const group = String.fromCharCode(65 + index)
  const hub = `h${index}`
  spots.push({ id: hub, label: messages.hub(group), hub: true, group, longitude, latitude })
  for (let spoke = 0; spoke < 9; spoke++) {
    const angle = next() * Math.PI * 2
    const reach = 6 + next() * 16
    spots.push({
      id: `${hub}-${spoke}`,
      label: messages.node(spots.length + 1),
      hub: false,
      group,
      longitude: longitude + Math.cos(angle) * reach * 1.4,
      latitude: latitude + Math.sin(angle) * reach,
    })
    route(hub, `${hub}-${spoke}`, 5 + next() * 45, false)
  }
  route(hub, `h${(index + 1) % hubs.length}`, 60 + next() * 40, true)
})

const definitionOf = (moving: boolean) =>
  defineGraph({
    marks: [
      edges<Route>(routes, {
        source: 'from',
        target: 'to',
        width: 'volume',
        stroke: (route) => (route.trunk ? 'var(--graph-accent)' : 'var(--graph-ink-muted)'),
        geodesic: (route) => route.trunk,
        arrow: 'target',
        flow: (route) => (moving ? 20 + route.volume : false),
      }),
      nodes<Spot>(spots, {
        longitude: 'longitude',
        latitude: 'latitude',
        color: 'group',
        size: (spot) => (spot.hub ? 22 : 9),
        label: (spot) => (spot.hub ? spot.label : null),
      }),
    ],
    scales: { size: (value) => value, width: { range: [1, 5] } },
  })

function assign(ref: Ref<GraphInstance | null>, value: GraphInstance | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const host = useRef<HTMLDivElement>(null)
  const graph = useRef<GraphInstance | null>(null)
  const [moving, setMoving] = useState(true)

  useLayoutEffect(() => {
    const container = host.current
    if (!container) return
    const map = new MapLibreMap({
      container,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [15, 18],
      zoom: 1.2,
    })
    const mounted = mountMapGraph(map, {
      definition: definitionOf(true),
      ariaLabel: messages.graphLabel(spots.length, routes.length),
    })
    mounted.view.fit({ padding: 40 })
    graph.current = mounted
    assign(ref, mounted)
    return () => {
      mounted.destroy()
      map.remove()
      graph.current = null
      assign(ref, null)
    }
  }, [ref])

  const toggle = () => {
    graph.current?.update({ definition: definitionOf(!moving) })
    setMoving(!moving)
  }

  return (
    <div className="example-graph">
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div className="example-actions">
        <button className="example-button" type="button" onClick={toggle}>
          {moving ? messages.stop : messages.start}
        </button>
      </div>
    </div>
  )
}
