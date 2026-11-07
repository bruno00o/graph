import { defineGraph, edges, type GraphInstance, nodes } from '@bruno00o/graph'
import { mountMapGraph } from '@bruno00o/graph/map'
import { createTimeline, mountTimeline } from '@bruno00o/graph/timeline'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { type Ref, useLayoutEffect, useRef } from 'react'
import { messages } from './messages'
import '../shared/overlays.css'

setWorkerUrl(workerUrl)

interface Site {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly longitude: number
  readonly latitude: number
  readonly from: number
  readonly until: number | null
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly since: number
}

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

const day = 86_400_000
const start = Date.UTC(2020, 0, 1)
const span = 6 * 365 * day
const next = random(28)
const sites: Site[] = []
const links: Link[] = []
for (let region = 0; region < 7; region++) {
  const longitude = -140 + region * 45 + next() * 15
  const latitude = -30 + next() * 75
  const opened = start + next() * span * 0.5
  const local: Site[] = []
  for (let index = 0; index < 22; index++) {
    const from = Math.floor((opened + (index / 22) ** 1.4 * (start + span - opened)) / day) * day
    const until = from + Math.floor(400 + next() * 900) * day
    const site: Site = {
      id: `s${sites.length}`,
      label: messages.node(sites.length + 1),
      group: String.fromCharCode(65 + region),
      longitude: longitude + (next() - 0.5) * 26,
      latitude: latitude + (next() - 0.5) * 16,
      from,
      until: next() < 0.6 || until >= start + span ? null : until,
    }
    const open = local.filter((other) => other.until === null || other.until > from)
    const anchor = open[Math.floor(next() * open.length)]
    if (anchor) links.push({ id: `l${links.length}`, from: anchor.id, to: site.id, since: from })
    local.push(site)
    sites.push(site)
  }
}

const definition = defineGraph({
  marks: [
    edges<Link>(links, {
      source: 'from',
      target: 'to',
      width: () => 2,
      stroke: 'var(--graph-ink)',
      time: (link) => ({ start: link.since }),
    }),
    nodes<Site>(sites, {
      longitude: 'longitude',
      latitude: 'latitude',
      color: 'group',
      size: () => 12,
      time: (site) => ({ start: site.from, end: site.until }),
    }),
  ],
  scales: { size: (value) => value, width: (value) => value },
  time: { fade: 60 * day },
})

function assign(ref: Ref<GraphInstance | null>, value: GraphInstance | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const host = useRef<HTMLDivElement>(null)
  const footer = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const container = host.current
    const below = footer.current
    if (!container || !below) return
    const map = new MapLibreMap({
      container,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [10, 10],
      zoom: 1.1,
    })
    const graph = mountMapGraph(map, {
      definition,
      initialTime: { start, end: start + span * 0.45 },
      ariaLabel: messages.graphLabel(sites.length, links.length),
    })
    const timeline = createTimeline(graph, { mode: 'grow', loop: true, speed: span / 20 })
    const view = mountTimeline(timeline, {
      ariaLabel: messages.timeline,
      labels: messages.timelineLabels,
    })
    below.append(view.element)
    graph.view.fit(undefined, { padding: 40 })
    assign(ref, graph)
    return () => {
      view.destroy()
      timeline.destroy()
      graph.destroy()
      map.remove()
      assign(ref, null)
    }
  }, [ref])

  return (
    <div className="example-graph">
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div ref={footer} className="example-timeline" style={{ bottom: 40 }} />
    </div>
  )
}
