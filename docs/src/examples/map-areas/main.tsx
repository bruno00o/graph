import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  nodes,
  type ShapeGeometry,
} from '@bruno00o/graph'
import { mountMapGraph } from '@bruno00o/graph/map'
import { shapes } from '@bruno00o/graph/shapes'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { type Ref, useLayoutEffect, useRef, useState } from 'react'
import { followSiteBasemap, siteBasemap } from '../shared/basemap'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

setWorkerUrl(workerUrl)

type Projection = keyof typeof messages.projections
type Ring = [number, number][]

interface Area {
  readonly id: string
  readonly label: string
  readonly tone: number
  readonly kind: 'area' | 'reach' | 'route'
  readonly geometry: ShapeGeometry
}

interface Spot {
  readonly id: string
  readonly label: string
  readonly longitude: number
  readonly latitude: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const next = random(29)

function blob(longitude: number, latitude: number, reach: number, points: number): Ring {
  const ring: Ring = []
  for (let index = 0; index < points; index++) {
    const angle = (index / points) * Math.PI * 2
    const swell = 0.75 + next() * 0.25
    ring.push([
      longitude + Math.cos(angle) * reach * swell,
      latitude + Math.sin(angle) * reach * swell * 0.65,
    ])
  }
  return ring
}

const centers: ReadonlyArray<readonly [number, number, number]> = [
  [-102, 42, 16],
  [-58, -14, 14],
  [22, 4, 15],
  [92, 46, 18],
  [136, -24, 14],
]

const spots: Spot[] = centers.map(([longitude, latitude], index) => ({
  id: `s${index}`,
  label: messages.spot(index + 1),
  longitude,
  latitude,
}))
spots.push(
  { id: 's5', label: messages.spot(6), longitude: 174, latitude: -14 },
  { id: 's6', label: messages.spot(7), longitude: -158, latitude: 21 },
)

const links: Link[] = [
  { id: 'l0', from: 's0', to: 's1' },
  { id: 'l1', from: 's1', to: 's2' },
  { id: 'l2', from: 's2', to: 's3' },
  { id: 'l3', from: 's3', to: 's4' },
  { id: 'l4', from: 's4', to: 's5' },
  { id: 'l5', from: 's5', to: 's6' },
  { id: 'l6', from: 's6', to: 's0' },
]

const areas: Area[] = [
  ...centers.map(
    ([longitude, latitude, reach], index): Area => ({
      id: `a${index}`,
      label: messages.area(index + 1),
      tone: index + 1,
      kind: 'area',
      geometry: {
        type: 'Polygon',
        coordinates:
          index === 3
            ? [blob(longitude, latitude, reach, 36), blob(longitude + 2, latitude, reach / 3, 12)]
            : [blob(longitude, latitude, reach, 36)],
      },
    }),
  ),
  {
    id: 'a5',
    label: messages.area(6),
    tone: 6,
    kind: 'area',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [166, -24],
          [-170, -26],
          [-164, -6],
          [172, -4],
        ],
      ],
    },
  },
  ...spots.slice(4).map(
    (spot, index): Area => ({
      id: `r${index}`,
      label: messages.reach(spot.label, 900),
      tone: 7,
      kind: 'reach',
      geometry: {
        center: { longitude: spot.longitude, latitude: spot.latitude },
        radius: 900_000,
      },
    }),
  ),
  {
    id: 'route',
    label: messages.route,
    tone: 8,
    kind: 'route',
    geometry: {
      type: 'LineString',
      coordinates: [
        [142, 30],
        [168, 38],
        [-172, 42],
        [-146, 36],
        [-126, 40],
      ],
    },
  },
]

const definition = defineGraph({
  marks: [
    shapes(areas, {
      fill: (area: Area) =>
        area.kind === 'route'
          ? null
          : `color-mix(in srgb, var(--graph-cat-${area.tone}) ${area.kind === 'reach' ? 10 : 24}%, transparent)`,
      stroke: (area: Area) => `var(--graph-cat-${area.tone})`,
      strokeWidth: (area: Area) => (area.kind === 'route' ? 3 : 1.5),
      dash: (area: Area) =>
        area.kind === 'route' ? 'dashed' : area.kind === 'reach' ? 'dotted' : 'solid',
    }),
    edges<Link>(links, { source: 'from', target: 'to', geodesic: true, opacity: 0.7 }),
    nodes<Spot>(spots, {
      longitude: 'longitude',
      latitude: 'latitude',
      size: 14,
      label: { text: 'label', background: true },
    }),
  ],
  states: { chosen: { others: { opacity: 0.25 } } },
  interaction: { lasso: true },
})

const crossing: Key[] = ['a5', 'route']

function assign(ref: Ref<GraphInstance | null>, value: GraphInstance | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const host = useRef<HTMLDivElement>(null)
  const graph = useRef<GraphInstance | null>(null)
  const map = useRef<MapLibreMap | null>(null)
  const [status, setStatus] = useState('')
  const [projection, setProjection] = useState<Projection>('globe')

  useLayoutEffect(() => {
    const container = host.current
    if (!container) return
    const created = new MapLibreMap({
      container,
      style: siteBasemap(),
      center: [-175, 4],
      zoom: 1.7,
    })
    created.on('style.load', () => created.setProjection({ type: 'globe' }))
    const mounted = mountMapGraph(created, {
      definition,
      ariaLabel: messages.graphLabel(spots.length, areas.length),
    })
    map.current = created
    graph.current = mounted
    assign(ref, mounted)
    mounted.on('pointerenter', ({ target }) => {
      setStatus(target.kind === 'edge' ? '' : target.datum.label)
    })
    mounted.on('pointerleave', () => setStatus(''))
    mounted.on('selectionchange', ({ selection }) => {
      mounted.states.set('chosen', { nodes: selection.nodes, shapes: selection.shapes })
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
    const chosen = projection === 'globe' ? 'mercator' : 'globe'
    map.current?.setProjection({ type: chosen })
    setProjection(chosen)
  }

  const frame = () => {
    graph.current?.view.fit({ shapes: crossing, padding: 60, duration: 600 })
  }

  return (
    <div className="example-graph">
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div className="example-actions">
        <button className="example-button" type="button" onClick={project}>
          {messages.projection(messages.projections[projection])}
        </button>
        <button className="example-button" type="button" onClick={frame}>
          {messages.frame}
        </button>
      </div>
      <output className="example-status" aria-live="polite">
        {status}
      </output>
    </div>
  )
}
