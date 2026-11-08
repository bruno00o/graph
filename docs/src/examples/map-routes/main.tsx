import {
  defineGraph,
  edges,
  type GraphInstance,
  type LineStringGeometry,
  lineWaypoints,
  nodes,
} from '@bruno00o/graph'
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
  readonly group: string
  readonly longitude: number
  readonly latitude: number
}

interface Route {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly line: LineStringGeometry
}

type Position = [longitude: number, latitude: number]

const next = random(23)
const spots: Spot[] = Array.from({ length: 22 }, (_, index) => {
  const longitude = -6 + next() * 32
  const latitude = 41 + next() * 14
  return {
    id: `s${index}`,
    label: messages.node(index + 1),
    group: String.fromCharCode(65 + (longitude > 10 ? 1 : 0) + (latitude > 48 ? 2 : 0)),
    longitude,
    latitude,
  }
})

function meander(from: Position, to: Position, depth: number, bend: number): Position[] {
  if (depth === 0) return [from, to]
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const push = (next() - 0.5) * bend
  const middle: Position = [from[0] + dx / 2 - dy * push, from[1] + dy / 2 + dx * push]
  const left = meander(from, middle, depth - 1, bend * 0.6)
  return [...left.slice(0, -1), ...meander(middle, to, depth - 1, bend * 0.6)]
}

const distance = (a: Spot, b: Spot) =>
  Math.hypot(a.longitude - b.longitude, a.latitude - b.latitude)
const routes: Route[] = []
const seen = new Set<string>()
for (const spot of spots) {
  const nearest = spots
    .filter((other) => other !== spot)
    .sort((a, b) => distance(spot, a) - distance(spot, b))
    .slice(0, 2)
  for (const other of nearest) {
    const id = [spot.id, other.id].sort().join('-')
    if (seen.has(id)) continue
    seen.add(id)
    const coordinates = meander(
      [spot.longitude, spot.latitude],
      [other.longitude, other.latitude],
      5,
      0.7,
    )
    routes.push({ id, from: spot.id, to: other.id, line: { type: 'LineString', coordinates } })
  }
}

const labelOf = new Map(spots.map((spot) => [spot.id, spot.label]))

const definitionOf = (winding: boolean) =>
  defineGraph({
    marks: [
      edges<Route>(routes, {
        source: 'from',
        target: 'to',
        width: 2,
        stroke: 'var(--graph-ink-muted)',
        waypoints: (route) => (winding ? lineWaypoints(route.line) : null),
      }),
      nodes<Spot>(spots, {
        longitude: 'longitude',
        latitude: 'latitude',
        color: 'group',
        size: 12,
        label: { text: 'label', background: true },
      }),
    ],
  })

function assign(ref: Ref<GraphInstance | null>, value: GraphInstance | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const host = useRef<HTMLDivElement>(null)
  const graph = useRef<GraphInstance | null>(null)
  const [winding, setWinding] = useState(true)
  const [status, setStatus] = useState('')

  useLayoutEffect(() => {
    const container = host.current
    if (!container) return
    const map = new MapLibreMap({
      container,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [10, 48],
      zoom: 3.5,
    })
    const mounted = mountMapGraph(map, {
      definition: definitionOf(true),
      ariaLabel: messages.graphLabel(spots.length, routes.length),
    })
    mounted.view.fit({ edges: routes.map((route) => route.id), padding: 40 })
    mounted.on('pointerenter', ({ target }) => {
      if (target.kind !== 'edge') return
      const { from, to, line } = target.datum
      setStatus(
        messages.route(labelOf.get(from) ?? from, labelOf.get(to) ?? to, line.coordinates.length),
      )
    })
    mounted.on('pointerleave', () => setStatus(''))
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
    graph.current?.update({ definition: definitionOf(!winding) })
    setWinding(!winding)
  }

  return (
    <div className="example-graph">
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div className="example-actions">
        <button className="example-button" type="button" onClick={toggle}>
          {messages.routes(winding)}
        </button>
      </div>
      <output className="example-status" aria-live="polite">
        {status}
      </output>
    </div>
  )
}
