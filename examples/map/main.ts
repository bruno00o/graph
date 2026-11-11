import { type Badge, defineGraph, edges, geoToWorld, groups, hull, nodes } from '@bruno00o/graph'
import { exportMapPng, mountMapGraph } from '@bruno00o/graph/map'
import { shapes } from '@bruno00o/graph/shapes'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { messages } from '../shared/messages'
import { button, choice, createPage, download, status, themeToggle } from '../shared/page'
import {
  createPlaces,
  createStacks,
  type Place,
  placeCount,
  type Route,
  windingPath,
} from './places'
import { createZones, type Zone } from './zones'

setWorkerUrl(workerUrl)

const params = new URLSearchParams(location.search)
const counts = [placeCount, 10_000, 100_000]
const count = Number(params.get('nodes') ?? placeCount)
const edgeCount = Number(params.get('edges') ?? count * 2)
const style = params.get('style') ?? 'https://demotiles.maplibre.org/style.json'
const projection = params.get('projection') === 'mercator' ? 'mercator' : 'globe'
const boxes = params.get('shape') === 'box'
const stack = params.has('stack')
const winding = params.has('waypoints')
const zones = params.has('shapes') ? createZones(Number(params.get('shapes') || 0)) : []
const crowded = zones.length > 100
const generated = stack ? createStacks() : createPlaces(count, edgeCount)
const places = generated.places
const routes = winding ? withCrossing(generated.routes) : generated.routes
const small = stack || count <= placeCount
const placeOf = new Map(places.map((place) => [place.id, place]))
const paths = new Map<string, { longitude: number; latitude: number }[]>()

type FarMode = 'geodesic' | 'straight' | 'winding'

function withCrossing(list: Route[]): Route[] {
  const nearest = (longitude: number, latitude: number) =>
    places.reduce((best, place) =>
      Math.hypot(place.longitude - longitude, place.latitude - latitude) <
      Math.hypot(best.longitude - longitude, best.latitude - latitude)
        ? place
        : best,
    )
  const from = nearest(174.76, -36.85)
  const to = nearest(-118.24, 34.05)
  return [...list, { id: 'crossing', from: from.id, to: to.id, far: true }]
}

function pathOf(route: Route) {
  const known = paths.get(route.id)
  if (known) return known
  const from = placeOf.get(route.from)
  const to = placeOf.get(route.to)
  if (!from || !to) return null
  const seed = [...route.id].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const path = windingPath(from, to, route.far ? 40 : 12, seed)
  paths.set(route.id, path)
  return path
}

function definitionOf(mode: FarMode) {
  const geodesic = mode === 'geodesic'
  return defineGraph({
    marks: [
      shapes(zones, {
        name: 'zones',
        fill: (zone: Zone) => `color-mix(in srgb, ${zone.tone} 28%, transparent)`,
        stroke: (zone: Zone) => zone.tone,
        strokeWidth: (zone: Zone) => (crowded ? 1 : zone.line ? 3 : 1.5),
        dash: (zone: Zone) => (zone.line ? 'dashed' : 'solid'),
      }),
      edges<Route>(routes, {
        source: 'from',
        target: 'to',
        width: (route) => (small ? (route.far ? 1.5 : 2) : 1),
        geodesic: (route) => geodesic && route.far,
        ...(mode === 'winding' ? { waypoints: pathOf } : {}),
        dash: (route) => (route.far ? 'dashed' : 'solid'),
        arrow: (route) => (small && route.far ? 'target' : 'none'),
      }),
      nodes<Place>(places, {
        longitude: 'longitude',
        latitude: 'latitude',
        color: 'group',
        size: (place) => (small ? 10 + place.weight / 8 : 4 + place.weight / 10),
        shape: boxes ? 'box' : 'circle',
        label: { text: 'label', background: small && !boxes },
        badges: {
          topRight: (place): Badge | null =>
            small && place.weight > 90 ? { text: String(place.weight) } : null,
        },
      }),
      ...(stack
        ? [
            groups(places, {
              by: 'site',
              name: 'sites',
              min: 2,
              size: 18,
              label: (site) => messages.places(site.count),
            }),
          ]
        : []),
    ],
    states: { muted: { opacity: 0.2, label: false }, active: { flow: true } },
    hulls: [hull({ state: 'selected', color: 'var(--graph-accent)', padding: 12 })],
    interaction: { lasso: true },
  })
}

const { header, main } = createPage(messages.map)
const container = document.createElement('div')
container.style.cssText = 'position:absolute;inset:0'
main.append(container)

const map = new MapLibreMap({ container, style, center: [10, 48], zoom: small ? 2 : 1.6 })
map.on('style.load', () => map.setProjection({ type: projection }))
const graph = mountMapGraph(map, {
  definition: definitionOf(winding ? 'winding' : 'geodesic'),
  ariaLabel: messages.mapLabel(places.length, routes.length),
})

async function showSite(value: string, zoom: number): Promise<void> {
  await graph.drawn()
  const site = graph.groups.keyOf('sites', value)
  const home = graph.positions.get(site)
  if (!home) return
  graph.groups.unfold([site])
  graph.view.set({ ...home, zoom })
  for (let frame = 0; frame < 10 && graph.view.get().zoom !== zoom; frame++) await graph.drawn()
  const first = graph.positions.snapshot().get(value)
  if (first) graph.view.set({ ...first, zoom })
}

if (stack) void showSite('p0', 2 ** 5)

const hovered = status()
hovered.textContent = messages.mapHint
graph.on('pointerenter', ({ target }) => {
  if (target.kind === 'edge')
    hovered.textContent = messages.link(target.datum.from, target.datum.to)
  else if (target.kind === 'shape') hovered.textContent = target.datum.label
  else if (target.mark === 'sites') hovered.textContent = messages.places(target.datum.count)
  else hovered.textContent = target.datum.label
})
graph.on('pointerleave', () => {
  hovered.textContent = messages.mapHint
})

const selection = status()
graph.on(
  'selectionchange',
  ({ selection: { nodes: selected, edges: selectedEdges, shapes: selectedShapes } }) => {
    selection.textContent = messages.selection(
      selected.length,
      selectedEdges.length + selectedShapes.length,
    )
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
  },
)

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
    messages.projection,
    (['globe', 'mercator'] as const).map((value) => ({
      value,
      text: messages.projections[value],
    })),
    projection,
    (value) => {
      map.setProjection({ type: value })
      params.set('projection', value)
      history.replaceState(null, '', `?${params}`)
    },
  ),
  choice(
    messages.farRoutes,
    (['geodesic', 'straight', 'winding'] as const).map((value) => ({
      value,
      text: messages.farRouteModes[value],
    })),
    winding ? 'winding' : 'geodesic',
    (value) => graph.update({ definition: definitionOf(value as FarMode) }),
  ),
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
  button(messages.fit, () => graph.view.fit({ duration: 400 })),
  exporting,
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph, map, exportMapPng, pathOf, routes, geoToWorld })
