import { defineGraph, edges, type GraphInstance, nodes } from '@bruno00o/graph'
import { MapGraph } from '@bruno00o/graph/map/react'
import { Legend, Timeline } from '@bruno00o/graph/react'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { type Ref, useCallback, useEffect, useRef, useState } from 'react'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

setWorkerUrl(workerUrl)

interface Item {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly longitude: number
  readonly latitude: number
  readonly since: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly since: number
}

const day = 86_400_000
const start = Date.UTC(2021, 0, 1)
const span = 4 * 365 * day
const next = random(61)
const groups = ['A', 'B', 'C', 'D', 'E']
const items: Item[] = []
const links: Link[] = []
groups.forEach((group, index) => {
  const longitude = -120 + index * 60 + next() * 20
  const latitude = -20 + next() * 60
  const local: Item[] = []
  for (let rank = 0; rank < 18; rank++) {
    const since = start + Math.floor((next() * span) / day) * day
    const item: Item = {
      id: `n${items.length}`,
      label: messages.node(items.length + 1),
      group,
      longitude: longitude + (next() - 0.5) * 40,
      latitude: latitude + (next() - 0.5) * 24,
      since,
    }
    const anchor = local[Math.floor(next() * local.length)]
    if (anchor) {
      links.push({
        id: `l${links.length}`,
        from: anchor.id,
        to: item.id,
        since: Math.max(anchor.since, since),
      })
    }
    local.push(item)
    items.push(item)
  }
})

const definition = defineGraph({
  marks: [
    edges<Link>(links, {
      source: 'from',
      target: 'to',
      width: 1.5,
      time: (link) => ({ start: link.since }),
    }),
    nodes<Item>(items, {
      longitude: 'longitude',
      latitude: 'latitude',
      color: 'group',
      size: 12,
      label: 'label',
      time: (item) => ({ start: item.since }),
    }),
  ],
  scales: { color: { domain: groups } },
  states: {
    match: { outline: 'var(--graph-accent)', label: true },
    off: { hide: true },
  },
})

type Shown = GraphInstance<'match' | 'off', (typeof definition.marks)[number]>

function assign(ref: Ref<GraphInstance | null>, value: GraphInstance | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const host = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [graph, setGraph] = useState<Shown | null>(null)

  useEffect(() => {
    const container = host.current
    if (!container) return
    const created = new MapLibreMap({
      container,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [0, 20],
      zoom: 1.1,
    })
    setMap(created)
    return () => created.remove()
  }, [])

  const keep = useCallback(
    (instance: Shown | null) => {
      setGraph(instance)
      assign(ref, instance)
    },
    [ref],
  )

  return (
    <div className="example-graph">
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {map ? (
        <MapGraph
          map={map}
          definition={definition}
          initialTime={{ start, end: start + span * 0.6 }}
          ariaLabel={messages.graphLabel(items.length, links.length)}
          ref={keep}
        >
          <div className="example-timeline" style={{ bottom: 40 }}>
            <Timeline
              mode="grow"
              speed={span / 16}
              ariaLabel={messages.timeline}
              labels={messages.timelineLabels}
            />
          </div>
        </MapGraph>
      ) : null}
      {graph ? (
        <div className="example-scale-legend example-scale-legend-right">
          <Legend
            graph={graph}
            highlight="match"
            hidden="off"
            sections={['color']}
            titles={{ color: messages.legendTitle }}
            ariaLabel={messages.legendLabel}
          />
        </div>
      ) : null}
    </div>
  )
}
