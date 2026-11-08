import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { MapGraph } from '@bruno00o/graph/map/react'
import type { GraphInstance } from '@bruno00o/graph/react'
import { Map as MapLibreMap, type StyleSpecification, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { type Ref, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { openFreeMapUrl, type Scheme, siteScheme, watchScheme } from '../shared/basemap'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'
import './basemaps.css'

setWorkerUrl(workerUrl)

interface Place {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly weight: number
  readonly longitude: number
  readonly latitude: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const centers: ReadonlyArray<readonly [number, number]> = [
  [2.4, 48.9],
  [13.4, 52.5],
  [-3.7, 40.4],
  [12.5, 41.9],
  [16.4, 48.2],
  [21, 52.2],
  [-0.1, 51.5],
]

const next = random(31)
const places: Place[] = []
const links: Link[] = []
centers.forEach(([longitude, latitude], index) => {
  const group = String.fromCharCode(65 + index)
  const local: Place[] = []
  for (let rank = 0; rank < 9; rank++) {
    const place: Place = {
      id: `p${places.length}`,
      label: messages.place(places.length + 1),
      group,
      weight: 1 + Math.floor(next() * 4),
      longitude: longitude + (next() - 0.5) * 4,
      latitude: latitude + (next() - 0.5) * 2.4,
    }
    const anchor = local[Math.floor(next() * local.length)]
    if (anchor) links.push({ id: `l${links.length}`, from: anchor.id, to: place.id })
    local.push(place)
    places.push(place)
  }
})
for (let index = 0; index < centers.length; index++) {
  const from = places[index * 9]
  const to = places[((index + 1) % centers.length) * 9]
  if (from && to) links.push({ id: `l${links.length}`, from: from.id, to: to.id })
}

const satelliteStyle: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: [
        'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg',
      ],
      tileSize: 256,
      maxzoom: 13,
      attribution:
        '<a href="https://cloudless.eox.at" target="_blank" rel="noopener">EOxCloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016), <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>',
    },
  },
  layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
}

interface Look {
  readonly edge: string | undefined
  readonly outline: string | null
}

const onLight: Look = { edge: '#3d4350', outline: null }
const onDark: Look = { edge: '#d8dbe2', outline: '#eef0f5' }
const onImagery: Look = { edge: '#ffffff', outline: '#14171c' }

interface Basemap {
  readonly id: BasemapId
  readonly style: string | StyleSpecification
  readonly look: Look
}

const ids = ['positron', 'liberty', 'bright', 'dark', 'fiord', 'satellite'] as const

type BasemapId = (typeof ids)[number]

const basemaps: readonly Basemap[] = [
  { id: 'positron', style: openFreeMapUrl('positron'), look: onLight },
  { id: 'liberty', style: openFreeMapUrl('liberty'), look: onLight },
  { id: 'bright', style: openFreeMapUrl('bright'), look: onLight },
  { id: 'dark', style: openFreeMapUrl('dark'), look: onDark },
  { id: 'fiord', style: openFreeMapUrl('fiord'), look: onDark },
  {
    id: 'satellite',
    style: satelliteStyle,
    look: onImagery,
  },
]

function byId(id: BasemapId): Basemap {
  return basemaps.find((basemap) => basemap.id === id) ?? (basemaps[0] as Basemap)
}

function basemapFor(scheme: Scheme): Basemap {
  const id: BasemapId = scheme === 'dark' ? 'dark' : 'positron'
  return byId(id)
}

function definitionOf(look: Look) {
  return defineGraph({
    marks: [
      edges<Link>(links, {
        source: 'from',
        target: 'to',
        width: 2,
        stroke: look.edge,
        opacity: 0.85,
      }),
      nodes<Place>(places, {
        longitude: 'longitude',
        latitude: 'latitude',
        color: 'group',
        size: (place) => 10 + place.weight * 3,
        outline: look.outline,
        outlineWidth: 1.5,
        label: { text: 'label', background: true },
      }),
    ],
    view: { padding: 40 },
  })
}

function assign(ref: Ref<GraphInstance | null>, value: GraphInstance | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const host = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [scheme, setScheme] = useState(siteScheme)
  const [chosen, setChosen] = useState<BasemapId | null>(null)
  const basemap = chosen ? byId(chosen) : basemapFor(scheme)
  const first = useRef(basemap)

  useEffect(() => watchScheme(setScheme), [])

  useEffect(() => {
    const container = host.current
    if (!container) return
    const created = new MapLibreMap({
      container,
      style: first.current.style,
      center: [8, 47.5],
      zoom: 4.2,
      maxZoom: 13,
    })
    setMap(created)
    return () => created.remove()
  }, [])

  const loaded = useRef(basemap)
  useEffect(() => {
    if (!map || loaded.current === basemap) return
    loaded.current = basemap
    map.setStyle(basemap.style, { diff: false })
  }, [map, basemap])

  const keep = useCallback((instance: GraphInstance | null) => assign(ref, instance), [ref])

  const definition = useMemo(() => definitionOf(basemap.look), [basemap.look])

  return (
    <div className="example-graph">
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {map ? (
        <MapGraph
          map={map}
          definition={definition}
          ariaLabel={messages.graphLabel(places.length, links.length)}
          ref={keep}
        />
      ) : null}
      <div className="example-actions basemaps-picker">
        {basemaps.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            className="example-button"
            aria-pressed={candidate.id === basemap.id}
            onClick={() => setChosen(candidate.id)}
          >
            {messages.basemaps[candidate.id]}
          </button>
        ))}
      </div>
    </div>
  )
}
