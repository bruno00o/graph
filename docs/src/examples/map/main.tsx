import { type Badge, defineGraph, edges, type GraphInstance, hull, nodes } from '@bruno00o/graph'
import { exportMapPng, mountMapGraph } from '@bruno00o/graph/map'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { type Ref, useLayoutEffect, useRef, useState } from 'react'
import { followSiteBasemap, siteBasemap } from '../shared/basemap'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

setWorkerUrl(workerUrl)

interface Place {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly weight: number
  readonly longitude: number
  readonly latitude: number
}

interface Route {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly far: boolean
}

type Projection = 'globe' | 'mercator'

const coordinates: ReadonlyArray<readonly [number, number]> = [
  [2.35, 48.86],
  [-0.13, 51.51],
  [13.4, 52.52],
  [12.5, 41.9],
  [-3.7, 40.42],
  [4.9, 52.37],
  [16.37, 48.21],
  [14.42, 50.09],
  [21.01, 52.23],
  [18.07, 59.33],
  [10.75, 59.91],
  [12.57, 55.68],
  [24.94, 60.17],
  [-9.14, 38.72],
  [23.73, 37.98],
  [19.04, 47.5],
  [26.1, 44.43],
  [4.35, 50.85],
  [8.54, 47.37],
  [-6.26, 53.35],
  [28.98, 41.01],
  [30.52, 50.45],
  [24.11, 56.95],
  [5.37, 43.3],
  [9.19, 45.46],
  [11.58, 48.14],
  [2.17, 41.39],
  [-74.01, 40.71],
  [-46.63, -23.55],
  [77.21, 28.61],
  [139.69, 35.69],
  [151.21, -33.87],
]

const nearby = 27

const places: Place[] = coordinates.map(([longitude, latitude], index) => ({
  id: `p${index}`,
  label: messages.place(index + 1),
  group: String.fromCharCode(65 + (index % 5)),
  weight: 20 + ((index * 37) % 80),
  longitude,
  latitude,
}))

function distance(a: Place, b: Place): number {
  const dx = (a.longitude - b.longitude) * Math.cos(((a.latitude + b.latitude) * Math.PI) / 360)
  return Math.hypot(dx, a.latitude - b.latitude)
}

const routes: Route[] = []
for (const place of places.slice(0, nearby)) {
  const nearest = places
    .slice(0, nearby)
    .filter((other) => other !== place)
    .sort((a, b) => distance(place, a) - distance(place, b))
    .slice(0, 2)
  for (const other of nearest) {
    const [from, to] = place.id < other.id ? [place, other] : [other, place]
    const id = `${from.id}-${to.id}`
    if (!routes.some((route) => route.id === id)) {
      routes.push({ id, from: from.id, to: to.id, far: false })
    }
  }
}
for (const [index, place] of places.slice(nearby).entries()) {
  const hub = places[index * 5]
  if (hub) routes.push({ id: `${hub.id}-${place.id}`, from: hub.id, to: place.id, far: true })
}

function definitionOf(geodesic: boolean) {
  return defineGraph({
    marks: [
      edges<Route>(routes, {
        source: 'from',
        target: 'to',
        width: (route) => (route.far ? 1.5 : 2),
        geodesic: (route) => geodesic && route.far,
        dash: (route) => (route.far ? 'dashed' : 'solid'),
        arrow: (route) => (route.far ? 'target' : 'none'),
      }),
      nodes<Place>(places, {
        longitude: 'longitude',
        latitude: 'latitude',
        color: 'group',
        size: (place) => 10 + place.weight / 8,
        label: { text: 'label', background: true },
        badges: {
          topRight: (place): Badge | null => (place.weight > 90 ? { text: place.weight } : null),
        },
      }),
    ],
    states: { active: { flow: true } },
    hulls: [hull({ state: 'selected', color: 'var(--graph-accent)', padding: 12 })],
    interaction: { lasso: true },
  })
}

function assign(ref: Ref<GraphInstance | null>, value: GraphInstance | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const host = useRef<HTMLDivElement>(null)
  const graph = useRef<GraphInstance | null>(null)
  const map = useRef<MapLibreMap | null>(null)
  const [status, setStatus] = useState('')
  const [projection, setProjection] = useState<Projection>('globe')
  const [geodesic, setGeodesic] = useState(true)

  useLayoutEffect(() => {
    const container = host.current
    if (!container) return
    const created = new MapLibreMap({
      container,
      style: siteBasemap(),
      center: [30, 35],
      zoom: 1.4,
    })
    created.on('style.load', () => created.setProjection({ type: 'globe' }))
    const mounted = mountMapGraph(created, {
      definition: definitionOf(true),
      ariaLabel: messages.mapLabel(places.length),
    })
    map.current = created
    graph.current = mounted
    assign(ref, mounted)
    mounted.on('pointerenter', ({ target }) => {
      setStatus(target.kind === 'node' ? target.datum.label : '')
    })
    mounted.on('pointerleave', () => setStatus(''))
    mounted.on('selectionchange', ({ selection }) => {
      const chosen = new Set(selection.nodes)
      mounted.states.set('active', {
        edges: routes
          .filter((route) => chosen.has(route.from) || chosen.has(route.to))
          .map((route) => route.id),
      })
    })
    const unfollow = followSiteBasemap(created)
    return () => {
      unfollow()
      mounted.destroy()
      created.remove()
      map.current = null
      graph.current = null
      assign(ref, null)
    }
  }, [ref])

  const project = () => {
    const next = projection === 'globe' ? 'mercator' : 'globe'
    map.current?.setProjection({ type: next })
    setProjection(next)
  }

  const route = () => {
    graph.current?.update({ definition: definitionOf(!geodesic) })
    setGeodesic(!geodesic)
  }

  const save = () => {
    const current = graph.current
    if (!current) return
    const start = performance.now()
    void exportMapPng(current, { pixelRatio: 2 }).then((blob) => {
      setStatus(messages.exported('PNG', blob.size, performance.now() - start))
      download(blob, 'map.png')
    })
  }

  return (
    <div className="example-graph">
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div className="example-actions">
        <button className="example-button" type="button" onClick={project}>
          {messages.projection(messages.projections[projection])}
        </button>
        <button className="example-button" type="button" onClick={route}>
          {messages.farRoutes(messages.farRouteModes[geodesic ? 'geodesic' : 'straight'])}
        </button>
        <button className="example-button" type="button" onClick={save}>
          {messages.downloadPng}
        </button>
      </div>
      <output className="example-status" aria-live="polite">
        {status}
      </output>
    </div>
  )
}
