import type { Map as MapLibreMap } from 'maplibre-gl'

const maps = new WeakMap<object, MapLibreMap>()

export function bindMap(graph: object, map: MapLibreMap): void {
  maps.set(graph, map)
}

export function unbindMap(graph: object): void {
  maps.delete(graph)
}

export function mapOf(graph: object): MapLibreMap {
  const map = maps.get(graph)
  if (!map) throw new Error('graph: the graph was not mounted by mountMapGraph')
  return map
}
