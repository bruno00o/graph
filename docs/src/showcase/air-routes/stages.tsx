import type { GraphInstance, GraphPointerEvent, View } from '@bruno00o/graph'
import { MapGraph } from '@bruno00o/graph/map/react'
import { Graph, useGraph } from '@bruno00o/graph/react'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { type JSX, type ReactNode, useEffect, useRef, useState } from 'react'
import { mapCamera } from './camera'
import type { definitionOf } from './definition'
import { type Basemap, messages } from './messages'

setWorkerUrl(workerUrl)

type AirDefinition = ReturnType<typeof definitionOf>

export type Report = (graph: GraphInstance | null) => void

interface StageProps {
  readonly definition: AirDefinition
  readonly label: string
  readonly report: Report
  readonly fit: boolean
  readonly onDoubleClick: (event: GraphPointerEvent) => void
  readonly children?: ReactNode
}

function Expose({ report, fit }: { readonly report: Report; readonly fit: boolean }): null {
  const graph = useGraph()
  const latest = useRef(report)
  latest.current = report
  useEffect(() => {
    latest.current(graph)
    if (fit) graph.view.fit({ padding: 56 })
    return () => latest.current(null)
  }, [graph, fit])
  return null
}

export function ClassicStage({
  definition,
  label,
  report,
  fit,
  onDoubleClick,
  initialView,
  children,
}: StageProps & { readonly initialView: View | undefined }): JSX.Element {
  return (
    <Graph
      definition={definition}
      ariaLabel={label}
      initialView={initialView}
      onDoubleClick={onDoubleClick as never}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Expose report={report} fit={fit && !initialView} />
      {children}
    </Graph>
  )
}

export function MapStage({
  definition,
  label,
  report,
  fit,
  onDoubleClick,
  basemap,
  camera,
  onMapError,
  children,
}: StageProps & {
  readonly basemap: Basemap
  readonly camera: View
  readonly onMapError: (message: string | null) => void
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const first = useRef({ basemap, camera, onMapError })
  useEffect(() => {
    const container = host.current
    if (!container) return
    const { basemap: initial, camera: start, onMapError: notify } = first.current
    const created = new MapLibreMap({
      container,
      style: initial.style,
      minZoom: 0,
      maxZoom: 18,
      ...mapCamera(start),
    })
    created.on('error', () => notify(messages.map.failed))
    created.on('styledata', () => notify(null))
    setMap(created)
    return () => created.remove()
  }, [])
  const loaded = useRef(basemap)
  useEffect(() => {
    if (!map || loaded.current === basemap) return
    loaded.current = basemap
    map.setStyle(basemap.style)
  }, [map, basemap])
  return (
    <>
      <div ref={host} className="air-map" />
      {map ? (
        <MapGraph
          map={map}
          definition={definition}
          ariaLabel={label}
          onDoubleClick={onDoubleClick as never}
        >
          <Expose report={report} fit={fit} />
          {children}
        </MapGraph>
      ) : null}
    </>
  )
}
