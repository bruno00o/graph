import { type GraphInstance, type GraphPointerEvent, geoToWorld, type View } from '@bruno00o/graph'
import { type JSX, type Ref, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { scale, toMap, toPlain } from './camera'
import {
  type DatasetId,
  type Filters,
  type Flight,
  loadNetwork,
  type Network,
  neighborsOf,
  noFilters,
  type Place,
  visibleOf,
} from './data'
import { definitionOf, isGroup, type LayoutId, type Mode, openedOf } from './definition'
import { Details } from './details'
import { type Basemap, basemaps, messages } from './messages'
import { Panel } from './panel'
import { ClassicStage, MapStage } from './stages'
import './air-routes.css'

const startZoom: Record<DatasetId, number> = { europe: 2 ** 3.3, world: 2 ** 1.1 }
const noPairs: ReadonlySet<string> = new Set()
const noPlaces: ReadonlySet<number> = new Set()

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set)
  if (!next.delete(value)) next.add(value)
  return next
}

function assign(ref: Ref<GraphInstance | null>, value: GraphInstance | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

interface Request {
  readonly id: number
  readonly sequence: number
}

export function App({ ref }: { readonly ref: Ref<GraphInstance | null> }): JSX.Element {
  const [dataset, setDataset] = useState<DatasetId>('europe')
  const [network, setNetwork] = useState<Network | null>(null)
  const [failed, setFailed] = useState(false)
  const [mode, setMode] = useState<Mode>('classic')
  const [layout, setLayout] = useState<LayoutId>('geo')
  const [basemap, setBasemap] = useState<Basemap>(basemaps[0] as Basemap)
  const [grouped, setGrouped] = useState(true)
  const [filters, setFilters] = useState<Filters>(noFilters)
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(noPlaces)
  const [pairs, setPairs] = useState<ReadonlySet<string>>(noPairs)
  const [selected, setSelected] = useState<number | null>(null)
  const [request, setRequest] = useState<Request | null>(null)
  const [camera, setCamera] = useState<View | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [graph, setGraph] = useState<GraphInstance | null>(null)
  const graphRef = useRef<GraphInstance | null>(null)
  const sequence = useRef(0)

  const loading = useRef(0)
  const load = useCallback((id: DatasetId) => {
    loading.current += 1
    const run = loading.current
    setNetwork(null)
    setFailed(false)
    loadNetwork(id).then(
      (loaded) => {
        if (run === loading.current) setNetwork(loaded)
      },
      () => {
        if (run === loading.current) setFailed(true)
      },
    )
  }, [])

  useEffect(() => {
    load(dataset)
    return () => {
      loading.current += 1
    }
  }, [dataset, load])

  const visible = useMemo(
    () => (network ? visibleOf(network, filters, revealed) : { places: [], flights: [] }),
    [network, filters, revealed],
  )
  const drilled = useMemo(
    () => visible.flights.filter((flight) => pairs.has(flight.pair)),
    [visible, pairs],
  )
  const opened = useMemo(() => openedOf(drilled), [drilled])
  const shown = useMemo(() => new Set(visible.places.map((place) => place.id)), [visible])

  const definition = useMemo(
    () =>
      definitionOf({
        places: visible.places,
        flights: visible.flights,
        opened,
        mode,
        grouped,
        layout,
        center: network?.center ?? { longitude: 0, latitude: 0 },
        scale,
      }),
    [visible, opened, mode, grouped, layout, network],
  )

  const report = useCallback(
    (instance: GraphInstance | null) => {
      graphRef.current = instance
      setGraph(instance)
      assign(ref, instance)
    },
    [ref],
  )

  useEffect(() => {
    if (!graph) return
    graph.states.set('drilled', { edges: drilled.map((flight) => flight.id) })
  }, [graph, drilled])

  useEffect(() => {
    if (!graph) return
    return graph.on('selectionchange', ({ selection }) => {
      const key = selection.nodes[0]
      setSelected(typeof key === 'number' ? key : null)
    })
  }, [graph])

  useEffect(() => {
    if (!graph || !network) return
    if (selected === null) {
      graph.states.clear('near')
      return
    }
    graph.selection.set({ nodes: [selected] })
    graph.states.set('near', {
      nodes: [selected, ...neighborsOf(network, selected)],
      edges: (network.flightsOf.get(selected) ?? []).map((flight) => flight.id),
    })
  }, [graph, network, selected])

  useEffect(() => {
    if (!graph || !network || !request) return
    const { id } = request
    const place = network.placeById.get(id)
    if (!place) return
    const ancestors: Array<string | number> = []
    for (let key = graph.groups.parent(id); key !== undefined; key = graph.groups.parent(key)) {
      ancestors.push(key)
    }
    if (ancestors.length > 0) graph.groups.unfold(ancestors)
    graph.selection.set({ nodes: [id] })
    graph.focus.set({ kind: 'node', key: id })
    const around = neighborsOf(network, id)
    graph.view.fit({ nodes: [id, ...around], padding: 90, maxZoom: 6, duration: 700 })
  }, [graph, network, request])

  const doubleClick = useRef<(event: GraphPointerEvent) => void>(() => {})
  doubleClick.current = ({ target }) => {
    if (!target) return
    if (target.kind === 'node') {
      if (isGroup(target.datum)) return
      const place = target.datum as Place
      setRevealed((current) => toggled(current, place.id))
      return
    }
    if (target.mark === 'opened') {
      const { pair } = target.datum as Flight
      setPairs((current) => toggled(current, pair))
      return
    }
    const flights: readonly Flight[] = target.aggregate
      ? (target.aggregate.data as readonly Flight[])
      : [target.datum as Flight]
    const pair = flights[0]?.pair
    if (pair === undefined || flights.length < 2) return
    if (flights.some((flight) => flight.pair !== pair)) return
    setPairs((current) => toggled(current, pair))
  }
  const onDoubleClick = useCallback((event: GraphPointerEvent) => doubleClick.current(event), [])

  const changeMode = (next: Mode) => {
    if (next === mode) return
    const current = graphRef.current
    if (current && network && layout === 'geo') {
      const view = current.view.get()
      setCamera(next === 'map' ? toMap(view, network.center) : toPlain(view, network.center))
    } else {
      setCamera(null)
    }
    setMode(next)
  }

  const changeDataset = (next: DatasetId) => {
    if (next === dataset) return
    setDataset(next)
    setFilters(noFilters)
    setRevealed(noPlaces)
    setPairs(noPairs)
    setSelected(null)
    setRequest(null)
    setCamera(null)
  }

  const pick = (place: Place) => {
    if (!shown.has(place.id)) setRevealed((current) => new Set(current).add(place.id))
    sequence.current += 1
    setRequest({ id: place.id, sequence: sequence.current })
  }

  const clear = () => {
    setSelected(null)
    setRequest(null)
    graph?.selection.clear()
    graph?.focus.set(null)
  }

  const label = messages.graphLabel(visible.places.length, visible.flights.length)
  const startCamera = useMemo<View>(() => {
    const center = network?.center ?? { longitude: 0, latitude: 0 }
    const world = geoToWorld(center)
    return { x: world.x, y: world.y, zoom: startZoom[dataset] }
  }, [network, dataset])
  const dark = mode === 'map' && basemap.scheme === 'dark'
  const stageKey = `${dataset}-${mode}`

  return (
    <div className="air-app">
      <Panel
        network={network}
        dataset={dataset}
        onDataset={changeDataset}
        mode={mode}
        onMode={changeMode}
        layout={layout}
        onLayout={setLayout}
        basemap={basemap}
        onBasemap={setBasemap}
        grouped={grouped}
        onGrouped={setGrouped}
        filters={filters}
        onFilters={setFilters}
        onPick={pick}
        onClear={clear}
        hasFocus={selected !== null}
        counts={
          network ? { airports: visible.places.length, routes: visible.flights.length } : null
        }
        opened={revealed.size}
        mapError={mapError}
      />
      <div className={dark ? 'air-stage dark' : 'air-stage'}>
        {network ? (
          mode === 'classic' ? (
            <ClassicStage
              key={stageKey}
              definition={definition}
              label={label}
              report={report}
              fit={camera === null}
              onDoubleClick={onDoubleClick}
              initialView={camera ?? undefined}
            >
              <Details network={network} opened={pairs} />
            </ClassicStage>
          ) : (
            <MapStage
              key={stageKey}
              definition={definition}
              label={label}
              report={report}
              fit={camera === null}
              onDoubleClick={onDoubleClick}
              basemap={basemap}
              camera={camera ?? startCamera}
              onMapError={setMapError}
            >
              <Details network={network} opened={pairs} />
            </MapStage>
          )
        ) : (
          <div className="air-loading" role="status">
            {failed ? (
              <>
                <span>{messages.failed}</span>
                <button className="air-button" type="button" onClick={() => load(dataset)}>
                  {messages.retry}
                </button>
              </>
            ) : (
              messages.loading
            )}
          </div>
        )}
        {network ? (
          <div className="air-tools">
            <button
              className="air-button air-button-small"
              type="button"
              onClick={() => graph?.view.fit({ padding: 56, duration: 500 })}
            >
              {messages.actions.fit}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
