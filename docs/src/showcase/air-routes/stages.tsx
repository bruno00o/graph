import type { GraphSurface, View } from '@bruno00o/graph'
import { Graph, useGraph } from '@bruno00o/graph/react'
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { type JSX, type ReactNode, useEffect, useRef } from 'react'
import { mapCamera } from './camera'
import type { AirDefinition, AirDoubleClick, AirGraph, AirMark, AirState } from './definition'
import { type Basemap, messages } from './messages'

setWorkerUrl(workerUrl)

export type Report = (graph: AirGraph | null) => void

function Expose({ report }: { readonly report: Report }): null {
  const graph = useGraph<AirState, AirMark>()
  const latest = useRef(report)
  latest.current = report
  useEffect(() => {
    latest.current(graph)
    return () => latest.current(null)
  }, [graph])
  return null
}

interface BackdropProps {
  readonly shown: boolean
  readonly basemap: Basemap
  readonly camera: View
  readonly onMap: (map: MapLibreMap | null) => void
  readonly onMapError: (message: string | null) => void
}

function Backdrop({ shown, basemap, camera, onMap, onMapError }: BackdropProps): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const first = useRef({ basemap, camera, onMap, onMapError })
  useEffect(() => {
    const container = host.current
    if (!container) return
    const { basemap: initial, camera: start, onMap: report, onMapError: notify } = first.current
    const created = new MapLibreMap({
      container,
      style: initial.style,
      minZoom: 0,
      maxZoom: 18,
      ...mapCamera(start),
    })
    created.on('error', () => notify(messages.map.failed))
    created.on('styledata', () => notify(null))
    map.current = created
    report(created)
    return () => {
      map.current = null
      report(null)
      created.remove()
    }
  }, [])
  const loaded = useRef(basemap)
  useEffect(() => {
    if (!map.current || loaded.current === basemap) return
    loaded.current = basemap
    map.current.setStyle(basemap.style)
  }, [basemap])
  return (
    <div
      ref={host}
      className="air-map"
      style={{ opacity: shown ? 1 : 0, pointerEvents: shown ? 'auto' : 'none' }}
    />
  )
}

interface StageProps {
  readonly definition: AirDefinition
  readonly surface: GraphSurface | null
  readonly label: string
  readonly report: Report
  readonly onDoubleClick: AirDoubleClick
  readonly map: Omit<BackdropProps, 'shown'> | null
  readonly children?: ReactNode
}

export function Stage({
  definition,
  surface,
  label,
  report,
  onDoubleClick,
  map,
  children,
}: StageProps): JSX.Element {
  return (
    <Graph
      definition={definition}
      surface={surface}
      ariaLabel={label}
      onDoubleClick={onDoubleClick}
      style={{ position: 'absolute', inset: 0 }}
    >
      <Expose report={report} />
      {map ? <Backdrop shown={surface !== null} {...map} /> : null}
      {children}
    </Graph>
  )
}
