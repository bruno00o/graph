import { defineGraph, edges, geoToWorld, nodes, type View, worldToGeo } from '@bruno00o/graph'
import { geo } from '@bruno00o/graph/layouts'
import { useMapSurface } from '@bruno00o/graph/map/react'
import { Graph, type GraphInstance, Legend, useGraph, useGraphState } from '@bruno00o/graph/react'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { type Ref, useEffect, useRef, useState } from 'react'
import { followSiteBasemap, siteBasemap } from '../shared/basemap'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

setWorkerUrl(workerUrl)

interface Spot {
  readonly id: string
  readonly label: string | null
  readonly area: string
  readonly weight: number
  readonly longitude: number
  readonly latitude: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const center = { longitude: 6, latitude: 47 }
const scale = 160
const origin = geoToWorld(center)
const areas = ['A', 'B', 'C', 'D', 'E', 'F']

const next = random(43)
const spots: Spot[] = []
const links: Link[] = []
const hubs: string[] = []
for (const area of areas) {
  const longitude = center.longitude + (next() - 0.5) * 9
  const latitude = center.latitude + (next() - 0.5) * 5
  const hub = `s${spots.length}`
  hubs.push(hub)
  const count = 10 + Math.floor(next() * 14)
  for (let index = 0; index < count; index++) {
    const spread = () => (next() + next() + next() - 1.5) * 0.5
    spots.push({
      id: `s${spots.length}`,
      label: index === 0 ? messages.hub(area) : null,
      area,
      weight: index === 0 ? 60 : Math.round(4 + next() ** 2 * 30),
      longitude: longitude + (index === 0 ? 0 : spread() * 1.4),
      latitude: latitude + (index === 0 ? 0 : spread()),
    })
    if (index > 0) links.push({ id: `l${links.length}`, from: hub, to: `s${spots.length - 1}` })
  }
}
hubs.forEach((hub, index) => {
  links.push({ id: `l${links.length}`, from: hub, to: hubs[(index + 1) % hubs.length] ?? hub })
})

const style = {
  color: 'area',
  size: 'weight',
  label: { text: 'label', background: true },
  units: 'screen',
} as const

const plain = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', opacity: 0.4 }),
    nodes<Spot>(spots, style),
  ],
  scales: { size: { range: [8, 26] }, color: { domain: areas } },
  states: { match: { outline: 'var(--graph-accent)' } },
  layout: geo<Spot>({ center, scale, spacing: 2 }),
})

const onMap = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', opacity: 0.4 }),
    nodes<Spot>(spots, { ...style, longitude: 'longitude', latitude: 'latitude' }),
  ],
  scales: { size: { range: [8, 26] }, color: { domain: areas } },
  states: { match: { outline: 'var(--graph-accent)' } },
})

function cameraOf(view: View): { center: [number, number]; zoom: number } {
  const place = worldToGeo({ x: view.x / scale + origin.x, y: view.y / scale + origin.y })
  return { center: [place.longitude, place.latitude], zoom: Math.log2(view.zoom * scale) }
}

function Backdrop({
  shown,
  onMap: report,
}: {
  readonly shown: boolean
  readonly onMap: (map: MapLibreMap | null) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const container = host.current
    if (!container) return
    const created = new MapLibreMap({ container, style: siteBasemap(), center: [6, 47], zoom: 4 })
    const unfollow = followSiteBasemap(created)
    report(created)
    return () => {
      report(null)
      unfollow()
      created.remove()
    }
  }, [report])
  return (
    <div
      ref={host}
      style={{
        position: 'absolute',
        inset: 0,
        opacity: shown ? 1 : 0,
        pointerEvents: shown ? 'auto' : 'none',
      }}
    />
  )
}

function Toggle({
  map,
  onToggle,
}: {
  readonly map: MapLibreMap | null
  readonly onToggle: () => void
}) {
  const graph = useGraph()
  const surface = useGraphState((state) => state.surface)
  const there = surface === 'map'
  return (
    <div className="example-actions">
      <button
        type="button"
        className="example-button"
        disabled={!map}
        onClick={() => {
          if (!there) map?.jumpTo(cameraOf(graph.view.get()))
          onToggle()
        }}
      >
        {there ? messages.toCanvas : messages.toMap}
      </button>
    </div>
  )
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [wanted, setWanted] = useState(false)
  const surface = useMapSurface(map)
  const there = wanted && surface !== null

  return (
    <Graph
      ref={ref}
      className="example-graph"
      definition={there ? onMap : plain}
      surface={there ? surface : null}
      ariaLabel={messages.graphLabel(spots.length)}
    >
      <Backdrop shown={there} onMap={setMap} />
      <Toggle map={map} onToggle={() => setWanted((current) => !current)} />
      <div className="example-scale-legend example-scale-legend-right">
        <Legend
          highlight="match"
          sections={['color']}
          titles={{ color: messages.legendTitle }}
          ariaLabel={messages.legendLabel}
        />
      </div>
    </Graph>
  )
}
