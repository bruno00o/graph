import { defineGraph, edges, type GraphInstance, groups, nodes } from '@bruno00o/graph'
import { mountMapGraph } from '@bruno00o/graph/map'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { type Ref, useLayoutEffect, useRef, useState } from 'react'
import { followSiteBasemap, siteBasemap } from '../shared/basemap'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

setWorkerUrl(workerUrl)

interface Spot {
  readonly id: string
  readonly label: string
  readonly site: string
  readonly kind: string
  readonly longitude: number
  readonly latitude: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const places: ReadonlyArray<readonly [number, number]> = [
  [-125, 45],
  [-80, 10],
  [-55, -25],
  [-10, 30],
  [25, 55],
  [20, -15],
  [65, 25],
  [105, 55],
  [115, 5],
  [150, -28],
]

const next = random(23)
const spots: Spot[] = []
const links: Link[] = []
places.forEach(([longitude, latitude], place) => {
  const site = String.fromCharCode(65 + place)
  const count = 2 + Math.floor(next() * 7)
  for (let index = 0; index < count; index++) {
    spots.push({
      id: `${site}${index}`,
      label: messages.node(site, index + 1),
      site,
      kind: String.fromCharCode(97 + Math.floor(next() * 4)),
      longitude,
      latitude,
    })
  }
  if (place > 0) {
    links.push({
      id: `l${links.length}`,
      from: `${String.fromCharCode(64 + place)}0`,
      to: `${site}0`,
    })
  }
})

const define = (spread: boolean) =>
  defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', opacity: 0.6 }),
      nodes<Spot>(spots, {
        name: 'spots',
        longitude: 'longitude',
        latitude: 'latitude',
        color: 'kind',
        size: 14,
      }),
      groups(spots, {
        by: 'site',
        name: 'sites',
        min: 2,
        folded: false,
        size: 22,
        label: (site) => messages.site(site.count),
        container: { spread, gap: 4 },
      }),
    ],
  })

function assign(ref: Ref<GraphInstance | null>, value: GraphInstance | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const host = useRef<HTMLDivElement>(null)
  const restyle = useRef<((spread: boolean) => void) | null>(null)
  const [spread, setSpread] = useState(true)
  const [status, setStatus] = useState('')

  useLayoutEffect(() => {
    const container = host.current
    if (!container) return
    const map = new MapLibreMap({
      container,
      style: siteBasemap(),
      center: [10, 25],
      zoom: 1.2,
    })
    const graph = mountMapGraph(map, {
      definition: define(true),
      ariaLabel: messages.graphLabel(spots.length, places.length),
    })
    graph.view.fit({ padding: 48 })
    restyle.current = (value) => graph.update({ definition: define(value) })
    assign(ref, graph)
    graph.on('pointerenter', ({ target }) => {
      if (target.kind === 'node' && target.mark === 'spots') {
        setStatus(messages.hovered(target.datum.label, target.datum.site))
      }
    })
    graph.on('pointerleave', () => setStatus(''))
    const unfollow = followSiteBasemap(map)
    return () => {
      unfollow()
      graph.destroy()
      map.remove()
      restyle.current = null
      assign(ref, null)
    }
  }, [ref])

  const toggle = () => {
    setSpread(!spread)
    restyle.current?.(!spread)
  }

  return (
    <div className="example-graph">
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div className="example-actions">
        <button type="button" className="example-button" aria-pressed={spread} onClick={toggle}>
          {messages.spread(spread)}
        </button>
      </div>
      <output className="example-status" aria-live="polite">
        {status}
      </output>
    </div>
  )
}
