import { defineGraph, edges, type GraphInstance, nodes } from '@bruno00o/graph'
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

const next = random(17)
const spots: Spot[] = []
const links: Link[] = []
for (let group = 0; group < 6; group++) {
  const longitude = -150 + group * 58 + next() * 20
  const latitude = -35 + next() * 85
  const first = spots.length
  for (let index = 0; index < 14; index++) {
    spots.push({
      id: `s${spots.length}`,
      label: messages.node(spots.length + 1),
      group: String.fromCharCode(65 + group),
      weight: index === 0 ? 100 : Math.round(5 + next() ** 2 * 60),
      longitude: longitude + (index === 0 ? 0 : (next() - 0.5) * 22),
      latitude: latitude + (index === 0 ? 0 : (next() - 0.5) * 14),
    })
    if (index > 0) {
      links.push({ id: `l${links.length}`, from: `s${first}`, to: `s${spots.length - 1}` })
    }
  }
  if (group > 0) links.push({ id: `l${links.length}`, from: `s${first - 14}`, to: `s${first}` })
}

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', opacity: 0.7 }),
    nodes<Spot>(spots, {
      longitude: 'longitude',
      latitude: 'latitude',
      color: 'group',
      size: 'weight',
      label: { text: 'label', background: true },
    }),
  ],
  scales: { size: { range: [8, 26] } },
  interaction: { lasso: true },
})

function assign(ref: Ref<GraphInstance | null>, value: GraphInstance | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function Example({ ref }: { readonly ref: Ref<GraphInstance | null> }) {
  const host = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('')

  useLayoutEffect(() => {
    const container = host.current
    if (!container) return
    const map = new MapLibreMap({
      container,
      style: siteBasemap(),
      center: [10, 15],
      zoom: 1.1,
    })
    const graph = mountMapGraph(map, {
      definition,
      ariaLabel: messages.graphLabel(spots.length, links.length),
    })
    graph.view.fit({ padding: 40 })
    assign(ref, graph)
    graph.on('pointerenter', ({ target }) => {
      if (target.kind !== 'node') return
      const { label, longitude, latitude } = target.datum
      setStatus(messages.place(label, longitude, latitude))
    })
    graph.on('pointerleave', () => setStatus(''))
    const unfollow = followSiteBasemap(map)
    return () => {
      unfollow()
      graph.destroy()
      map.remove()
      assign(ref, null)
    }
  }, [ref])

  return (
    <div className="example-graph">
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <output className="example-status" aria-live="polite">
        {status}
      </output>
    </div>
  )
}
