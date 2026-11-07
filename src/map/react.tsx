import type { Map as MapLibreMap } from 'maplibre-gl'
import { type ReactNode, useLayoutEffect, useState } from 'react'
import type { GraphInstance } from '../host/mount-graph'
import { GraphContext, useLatest } from '../react/context'
import { type GraphProps, sharedOptions, useGraphBinding } from '../react/graph'
import type { Mark } from '../types'
import { mountMapGraph } from './index'

/**
 * Props of `<MapGraph>`: those of `<Graph>` without the view, which the map owns, and without
 * `className` and `style`, since it renders no element of its own. `S` and `M` come from the
 * definition.
 */
export interface MapGraphProps<S extends string = string, M extends Mark = Mark>
  extends Omit<GraphProps<S, M>, 'initialView' | 'view' | 'onViewChange' | 'className' | 'style'> {
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

/**
 * Mounts a graph inside a MapLibre map with `mountMapGraph`, and destroys it on unmount. Its
 * children render where the component stands, with the graph in context: the hooks, `<Anchor>`,
 * `<Legend>` and `<Timeline>` work inside it as inside `<Graph>`.
 */
export function MapGraph<S extends string = string, M extends Mark = Mark>(
  props: MapGraphProps<S, M>,
): ReactNode {
  const { map, id, beforeId, children } = props
  const [graph, setGraph] = useState<GraphInstance<S, M> | null>(null)
  const latest = useLatest(props)

  useLayoutEffect(() => {
    const instance = mountMapGraph(map, { ...sharedOptions(latest), id, beforeId })
    setGraph(instance)
    return () => {
      instance.destroy()
      setGraph(null)
    }
  }, [map, id, beforeId, latest])

  useGraphBinding(graph, props, latest)

  return graph ? <GraphContext value={graph}>{children}</GraphContext> : null
}
