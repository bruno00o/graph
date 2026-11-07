import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

interface Zone {
  readonly id: string
  readonly label: string
  readonly tone: number
  readonly size: number
  readonly x: number
  readonly y: number
}

interface Marker {
  readonly id: string
  readonly zone: string
  readonly tone: number
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

type Units = 'screen' | 'world'

const next = random(5)
const zones: Zone[] = Array.from({ length: 5 }, (_, index) => {
  const angle = (index / 4) * Math.PI * 2 - Math.PI / 4
  return {
    id: `z${index}`,
    label: messages.zone(index + 1),
    tone: index + 1,
    size: index === 0 ? 300 : 220 + index * 20,
    x: index === 0 ? 0 : Math.cos(angle) * 330,
    y: index === 0 ? 0 : Math.sin(angle) * 330,
  }
})

const markers: Marker[] = zones.flatMap((zone) =>
  Array.from({ length: 14 }, (_, index) => {
    const angle = next() * Math.PI * 2
    const distance = Math.sqrt(next()) * zone.size * 0.4
    return {
      id: `${zone.id}-m${index}`,
      zone: zone.id,
      tone: zone.tone,
      x: zone.x + Math.cos(angle) * distance,
      y: zone.y + Math.sin(angle) * distance,
    }
  }),
)

const nearest = (marker: Marker, among: readonly Marker[]) =>
  among.reduce<Marker | undefined>((best, other) => {
    if (!best) return other
    const d = (other.x - marker.x) ** 2 + (other.y - marker.y) ** 2
    return d < (best.x - marker.x) ** 2 + (best.y - marker.y) ** 2 ? other : best
  }, undefined)

const links: Link[] = markers.flatMap((marker, index) => {
  const earlier = markers.slice(0, index)
  const own = nearest(
    marker,
    earlier.filter((other) => other.zone === marker.zone),
  )
  const across =
    marker.zone === 'z0'
      ? undefined
      : nearest(
          marker,
          earlier.filter((other) => other.zone === 'z0'),
        )
  const list: Link[] = []
  if (own) list.push({ id: `${marker.id}:${own.id}`, from: own.id, to: marker.id })
  if (across && index % 14 === 13) {
    list.push({ id: `${marker.id}:${across.id}`, from: across.id, to: marker.id })
  }
  return list
})

const tone = (value: number, share: number) =>
  `color-mix(in oklab, var(--graph-cat-${value}) ${share}%, transparent)`

const define = (units: Units) =>
  defineGraph({
    marks: [
      nodes(zones, {
        name: 'zones',
        x: 'x',
        y: 'y',
        size: 'size',
        fill: (zone) => tone(zone.tone, 14),
        stroke: (zone) => tone(zone.tone, 60),
        label: { text: 'label', placement: 'center', size: 16, weight: 'bold' },
      }),
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes(markers, {
        name: 'markers',
        x: 'x',
        y: 'y',
        size: () => 12,
        fill: (marker) => `var(--graph-cat-${marker.tone})`,
        units,
      }),
    ],
    scales: { size: (value) => value },
  })

export function mount(container: HTMLElement): GraphInstance {
  let units: Units = 'screen'
  const graph = mountGraph(container, { definition: define(units), ariaLabel: messages.graphLabel })

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-button'
  button.textContent = messages.units(units)
  button.addEventListener('click', () => {
    units = units === 'screen' ? 'world' : 'screen'
    button.textContent = messages.units(units)
    graph.update({ definition: define(units) })
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  const show = () => {
    status.textContent = messages.zoom(graph.view.get().zoom)
  }
  show()
  graph.on('viewchange', show)

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions, status)
  return graph
}
