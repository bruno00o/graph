import { type Badge, defineGraph, edges, nodes } from '@bruno00o/graph'
import { exportMapPng, mountMapGraph } from '@bruno00o/graph/map'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { messages } from '../shared/messages'
import { button, choice, createPage, download, status, themeToggle } from '../shared/page'
import { createPlaces, type Place, placeCount, type Route } from './places'

setWorkerUrl(workerUrl)

const params = new URLSearchParams(location.search)
const counts = [placeCount, 10_000, 100_000]
const count = Number(params.get('nodes') ?? placeCount)
const edgeCount = Number(params.get('edges') ?? count * 2)
const style = params.get('style') ?? 'https://demotiles.maplibre.org/style.json'
const { places, routes } = createPlaces(count, edgeCount)
const small = count <= placeCount

const definition = defineGraph({
  marks: [
    edges<Route>(routes, { source: 'from', target: 'to', width: () => (small ? 2 : 1) }),
    nodes<Place>(places, {
      longitude: 'longitude',
      latitude: 'latitude',
      color: 'group',
      size: (place) => (small ? 10 + place.weight / 8 : 4 + place.weight / 10),
      label: { text: 'label', background: small },
      badges: {
        topRight: (place): Badge | null =>
          small && place.weight > 90 ? { text: String(place.weight) } : null,
      },
    }),
  ],
  states: { muted: { opacity: 0.2, label: false }, active: { flow: true } },
  interaction: { lasso: true },
})

const { header, main } = createPage(messages.map)
const container = document.createElement('div')
container.style.cssText = 'position:absolute;inset:0'
main.append(container)

const map = new MapLibreMap({ container, style, center: [10, 48], zoom: small ? 3.2 : 2.5 })
const graph = mountMapGraph(map, {
  definition,
  ariaLabel: messages.mapLabel(places.length, routes.length),
})

const hovered = status()
hovered.textContent = messages.mapHint
graph.on('pointerenter', ({ target }) => {
  hovered.textContent =
    target.kind === 'node' ? target.datum.label : messages.link(target.datum.from, target.datum.to)
})
graph.on('pointerleave', () => {
  hovered.textContent = messages.mapHint
})

const selection = status()
graph.on('selectionchange', ({ nodes: selected, edges: selectedEdges }) => {
  selection.textContent = messages.selection(selected.length, selectedEdges.length)
  const chosen = new Set<string>(selected.map(String))
  const keep = new Set(chosen)
  const active: string[] = []
  for (const route of routes) {
    if (chosen.has(route.from) || chosen.has(route.to)) {
      keep.add(route.from)
      keep.add(route.to)
      active.push(route.id)
    }
  }
  graph.states.set('active', { edges: active })
  graph.states.set('muted', {
    nodes:
      selected.length === 0
        ? []
        : places.filter((place) => !keep.has(place.id)).map((place) => place.id),
  })
})

const exporting = button(messages.exportPng, () => {
  exporting.disabled = true
  exporting.textContent = messages.exporting
  void exportMapPng(graph, { pixelRatio: 2 })
    .then((blob) => download(blob, 'carte.png'))
    .finally(() => {
      exporting.disabled = false
      exporting.textContent = messages.exportPng
    })
})

header.append(
  hovered,
  selection,
  choice(
    messages.volume,
    counts.map((value) => ({ value: String(value), text: messages.places(value) })),
    String(count),
    (value) => {
      const next = new URLSearchParams(params)
      next.set('nodes', value)
      next.delete('edges')
      location.search = next.toString()
    },
  ),
  button(messages.fit, () => graph.view.fit(undefined, { duration: 400 })),
  exporting,
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph, map, exportMapPng })
