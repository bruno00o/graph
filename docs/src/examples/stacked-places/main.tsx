import {
  defineGraph,
  type EdgesBetweenGroups,
  edges,
  type GraphInstance,
  groups,
  nodes,
} from '@bruno00o/graph'
import { mountMapGraph } from '@bruno00o/graph/map'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { type Ref, useLayoutEffect, useRef, useState } from 'react'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/controls.css'
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

interface Look {
  readonly spread: boolean
  readonly between: EdgesBetweenGroups
  readonly fill: number
}

const initial: Look = { spread: true, between: 'members', fill: 50 }

const define = ({ spread, between, fill }: Look) =>
  defineGraph({
    marks: [
      edges<Link>(links, {
        source: 'from',
        target: 'to',
        opacity: 0.6,
        arrow: 'target',
        betweenGroups: between,
      }),
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
        container: { spread, gap: 4, fillOpacity: fill / 100 },
      }),
    ],
  })

function assign(ref: Ref<GraphInstance | null>, value: GraphInstance | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const host = useRef<HTMLDivElement>(null)
  const restyle = useRef<((look: Look) => void) | null>(null)
  const [look, setLook] = useState(initial)
  const [status, setStatus] = useState('')

  useLayoutEffect(() => {
    const container = host.current
    if (!container) return
    const map = new MapLibreMap({
      container,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [10, 25],
      zoom: 1.2,
    })
    const graph = mountMapGraph(map, {
      definition: define(initial),
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
    return () => {
      graph.destroy()
      map.remove()
      restyle.current = null
      assign(ref, null)
    }
  }, [ref])

  const change = (next: Partial<Look>) => {
    const changed = { ...look, ...next }
    setLook(changed)
    restyle.current?.(changed)
  }

  return (
    <div className="example-graph">
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div className="example-actions">
        <button
          type="button"
          className="example-button"
          aria-pressed={look.spread}
          onClick={() => change({ spread: !look.spread })}
        >
          {messages.spread(look.spread)}
        </button>
        <button
          type="button"
          className="example-button"
          onClick={() => change({ between: look.between === 'groups' ? 'members' : 'groups' })}
        >
          {messages.between(look.between)}
        </button>
        <label className="example-button example-range">
          <span>{messages.fill(look.fill)}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={look.fill}
            onChange={(event) => change({ fill: Number(event.currentTarget.value) })}
          />
        </label>
      </div>
      <output className="example-status" aria-live="polite">
        {status}
      </output>
    </div>
  )
}
