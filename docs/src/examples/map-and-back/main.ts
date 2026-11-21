import {
  defineGraph,
  edges,
  type GraphInstance,
  geoToWorld,
  mountGraph,
  nodes,
  type View,
} from '@bruno00o/graph'
import { geo } from '@bruno00o/graph/layouts'
import { mapSurface } from '@bruno00o/graph/map'
import { mountMinimap } from '@bruno00o/graph/minimap'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
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
  readonly longitude: number | null
  readonly latitude: number | null
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const center = { longitude: 6, latitude: 47 }
const scale = 160
const origin = geoToWorld(center)

const next = random(41)
const spots: Spot[] = []
const links: Link[] = []
const hubs: string[] = []
for (let area = 0; area < 6; area++) {
  const longitude = center.longitude + (next() - 0.5) * 9
  const latitude = center.latitude + (next() - 0.5) * 5
  const hub = `s${spots.length}`
  hubs.push(hub)
  const count = 10 + Math.floor(next() * 14)
  for (let index = 0; index < count; index++) {
    const spread = () => (next() + next() + next() - 1.5) * 0.5
    spots.push({
      id: `s${spots.length}`,
      label: index === 0 ? messages.hub(String.fromCharCode(65 + area)) : null,
      area: String.fromCharCode(65 + area),
      weight: index === 0 ? 60 : Math.round(4 + next() ** 2 * 30),
      longitude: longitude + (index === 0 ? 0 : spread() * 1.4),
      latitude: latitude + (index === 0 ? 0 : spread()),
    })
    if (index > 0) links.push({ id: `l${links.length}`, from: hub, to: `s${spots.length - 1}` })
  }
}
for (let index = 0; index < 3; index++) {
  const hub = hubs[index * 2] ?? 's0'
  spots.push({
    id: `s${spots.length}`,
    label: null,
    area: '?',
    weight: 12,
    longitude: null,
    latitude: null,
  })
  links.push({ id: `l${links.length}`, from: hub, to: `s${spots.length - 1}` })
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
  scales: { size: { range: [8, 26] } },
  layout: geo<Spot>({ center, scale, spacing: 2 }),
})

const onMap = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', opacity: 0.4 }),
    nodes<Spot>(spots, { ...style, longitude: 'longitude', latitude: 'latitude' }),
  ],
  scales: { size: { range: [8, 26] } },
})

const toMap = (view: View): View => ({
  x: view.x / scale + origin.x,
  y: view.y / scale + origin.y,
  zoom: view.zoom * scale,
})

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', onClick)
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const holder = document.createElement('div')
  holder.style.position = 'absolute'
  holder.style.inset = '0'
  container.append(holder)
  const showMap = (shown: boolean) => {
    holder.style.opacity = shown ? '1' : '0'
    holder.style.pointerEvents = shown ? 'auto' : 'none'
  }
  showMap(false)
  const map = new MapLibreMap({ container: holder, style: siteBasemap(), center: [6, 47], zoom: 4 })
  const surface = mapSurface(map)
  const unfollow = followSiteBasemap(map)

  const graph = mountGraph(container, {
    definition: plain,
    ariaLabel: messages.graphLabel(spots.length),
  })
  mountMinimap(graph, { width: 160, height: 110 })

  const toggle = button(messages.toMap, () => {
    const leaving = graph.store.state.surface === 'map'
    if (leaving) {
      graph.update({ surface: null, definition: plain })
    } else {
      showMap(true)
      graph.update({ surface, definition: onMap, view: toMap(graph.view.get()) })
    }
  })
  graph.on('surfacechange', ({ surface: name }) => {
    showMap(name === 'map')
    toggle.textContent = name === 'map' ? messages.toCanvas : messages.toMap
  })
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(toggle)
  container.append(actions)

  graph.signal.addEventListener(
    'abort',
    () => {
      unfollow()
      map.remove()
      holder.remove()
    },
    { once: true },
  )
  return graph
}
