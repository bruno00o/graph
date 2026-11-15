import type { Map as MapLibreMap } from 'maplibre-gl'
import { type ReactNode, useEffect, useLayoutEffect, useState } from 'react'
import { type GraphInstance, type GraphSurface, mountGraph } from '../host/mount-graph'
import { GraphContext, useLatest } from '../react/context'
import { type GraphProps, sharedOptions, useGraphBinding } from '../react/graph'
import type { Mark } from '../types'
import { type MapSurfaceOptions, mapSurface } from './index'

/**
 * Props of `<MapGraph>`: those of `<Graph>` without the view, which the map owns, without
 * `surface`, and without `className` and `style`, since it renders no element of its own. `S` and
 * `M` come from the definition.
 */
export interface MapGraphProps<S extends string = string, M extends Mark = Mark>
  extends Omit<
    GraphProps<S, M>,
    'initialView' | 'view' | 'onViewChange' | 'className' | 'style' | 'surface'
  > {
  /** MapLibre map to draw the graph in. Another map mounts the graph again. */
  readonly map: MapLibreMap
  /**
   * Id of the custom layer added to the map style. Another id mounts the graph again.
   * @default 'graph'
   */
  readonly id?: string | undefined
  /**
   * Id of the style layer to draw the graph under, such as the place labels of the basemap.
   * Defaults to the top of the style. Another id mounts the graph again.
   */
  readonly beforeId?: string | undefined
}

interface HeldSurface {
  readonly map: MapLibreMap
  readonly id: string | undefined
  readonly beforeId: string | undefined
  readonly surface: GraphSurface
}

/**
 * Makes a surface on a MapLibre map with `mapSurface`, for the `surface` prop of `<Graph>`, and
 * releases it on unmount. It returns `null` while `map` is `null` or `undefined`, and the same
 * surface until `map`, `id` or `beforeId` change: another value releases the surface and makes a
 * new one, which a graph on the old one moves to.
 */
export function useMapSurface(
  map: MapLibreMap | null | undefined,
  options: MapSurfaceOptions = {},
): GraphSurface | null {
  const { id, beforeId } = options
  const [held, setHeld] = useState<HeldSurface | null>(null)
  let current = held
  if (!map) current = null
  else if (!held || held.map !== map || held.id !== id || held.beforeId !== beforeId) {
    current = { map, id, beforeId, surface: mapSurface(map, { id, beforeId }) }
  }
  if (current !== held) setHeld(current)
  const surface = current?.surface ?? null

  useEffect(() => {
    if (!surface) return
    return () => surface.release()
  }, [surface])

  return surface
}

/**
 * Mounts a graph inside a MapLibre map, on a `mapSurface` released with the graph, and destroys it
 * on unmount. Its children render where the component stands, with the graph in context: the
 * hooks, `<Anchor>`, `<Legend>` and `<Timeline>` work inside it as inside `<Graph>`.
 */
export function MapGraph<S extends string = string, M extends Mark = Mark>(
  props: MapGraphProps<S, M>,
): ReactNode {
  const { map, id, beforeId, children } = props
  const [graph, setGraph] = useState<GraphInstance<S, M> | null>(null)
  const latest = useLatest(props)

  useLayoutEffect(() => {
    const instance = mountGraph(map.getContainer(), {
      ...sharedOptions(latest),
      surface: mapSurface(map, { id, beforeId }),
    })
    setGraph(instance)
    return () => {
      instance.destroy()
      setGraph(null)
    }
  }, [map, id, beforeId, latest])

  useGraphBinding(graph, props, latest, undefined)

  return graph ? <GraphContext value={graph}>{children}</GraphContext> : null
}
