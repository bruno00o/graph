import type { Map as MapLibreMap } from 'maplibre-gl'
import { internalsOf } from '../host/internals'

const maps = new WeakMap<object, MapLibreMap>()

export function bindMap(surface: object, map: MapLibreMap): void {
  maps.set(surface, map)
}

export function mapOf(graph: object): MapLibreMap {
  const map = maps.get(internalsOf(graph, 'graph').surface())
  if (!map) throw new Error('graph: the graph is not on a map')
  return map
}
