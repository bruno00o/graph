import {
  type AggregateEdge,
  type Badge,
  defineGraph,
  edges,
  type GraphDefinition,
  type GraphEventHandler,
  type GraphInstance,
  type GraphState,
  groups,
  type NodeGroup,
  nodes,
  raw,
} from '@bruno00o/graph'
import { geo, rings } from '@bruno00o/graph/layouts'
import { force } from '@bruno00o/graph/layouts/force'
import type { Center, Flight, Place } from './data'

export type Mode = 'classic' | 'map'
export type LayoutId = 'geo' | 'force' | 'rings'
export type Item = Place | NodeGroup<Place>

export const layoutIds: readonly LayoutId[] = ['geo', 'force', 'rings']

export interface DefinitionInput {
  readonly places: readonly Place[]
  readonly flights: readonly Flight[]
  readonly opened: readonly Flight[]
  readonly mode: Mode
  readonly grouped: boolean
  readonly layout: LayoutId
  readonly center: Center
  readonly scale: number
}

export const dimmed = { nodes: 0.14, edges: 0.05 } as const

export function isGroup(item: unknown): item is NodeGroup<Place> {
  return typeof item === 'object' && item !== null && 'data' in item && 'count' in item
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function longitudeOf(item: Item): number {
  return isGroup(item) ? mean(item.data.map((place) => place.lng)) : item.lng
}

function latitudeOf(item: Item): number {
  return isGroup(item) ? mean(item.data.map((place) => place.lat)) : item.lat
}

function weightOf(item: Item): number {
  return isGroup(item) ? item.count : item.routes
}

function byWeight(a: Item, b: Item): number {
  return weightOf(b) - weightOf(a)
}

function groupSize(group: NodeGroup<Place>): number {
  return 16 + Math.sqrt(group.count) * 6
}

function groupName(group: NodeGroup<Place>): string {
  return group.data[0]?.areaName ?? ''
}

function countBadge(group: NodeGroup<Place>): Badge {
  return { text: group.count }
}

function mergedWidth(aggregate: AggregateEdge<Flight>): number {
  return aggregate.count
}

const classicAggregate = { width: mergedWidth, opacity: 0.16 }
const mapAggregate = { width: mergedWidth, opacity: 0.32 }
const merge = { directed: false }
const groupSizeOf = raw(groupSize)
const geoOrder = { order: byWeight }

export function openedOf(drilled: readonly Flight[]): Flight[] {
  return drilled.map((flight) => ({ ...flight, id: `${flight.id}~` }))
}

function layoutOf(input: DefinitionInput) {
  if (input.mode === 'map') return null
  if (input.layout === 'force') return force({ edgeLength: 90 })
  if (input.layout === 'rings') return rings<Item>({ order: 'degree' })
  return geo<Item>({
    longitude: longitudeOf,
    latitude: latitudeOf,
    center: input.center,
    scale: input.scale,
    spacing: 3,
    ...geoOrder,
  })
}

export function definitionOf(input: DefinitionInput) {
  const onMap = input.mode === 'map'
  const placement = onMap
    ? ({ longitude: 'lng', latitude: 'lat' } as const)
    : { units: 'screen' as const }
  const groupPlacement = onMap
    ? { longitude: longitudeOf, latitude: latitudeOf }
    : { units: 'screen' as const }
  const marks = [
    edges(input.flights, {
      name: 'routes',
      source: 'from',
      target: 'to',
      width: 1,
      opacity: onMap ? 0.22 : 0.1,
      geodesic: onMap,
      merge,
      aggregate: onMap ? mapAggregate : classicAggregate,
    }),
    edges(input.opened, {
      name: 'opened',
      source: 'from',
      target: 'to',
      color: 'carrier',
      scales: { color: { type: 'categorical' } },
      width: 2,
      geodesic: onMap,
      label: { text: 'carrier', size: 11, background: true },
    }),
    nodes(input.places, {
      name: 'airports',
      color: 'routes',
      size: 'routes',
      label: 'code',
      ...placement,
    }),
    ...(input.grouped
      ? [
          groups(input.places, {
            by: 'area',
            name: 'areas',
            min: 2,
            size: groupSizeOf,
            fill: 'var(--graph-ink-muted)',
            label: groupName,
            badges: { topRight: countBadge },
            ...groupPlacement,
          }),
        ]
      : []),
  ]
  return defineGraph({
    marks,
    scales: {
      color: { type: 'sequential', domain: [1, 120] },
      size: { type: 'sqrt', domain: [1, 120], range: [5, 24] },
      width: { type: 'sqrt', domain: [1, 24], range: [1, 6] },
    },
    states: {
      near: {
        nodes: { others: { opacity: dimmed.nodes } },
        edges: { opacity: 0.85, others: { opacity: dimmed.edges } },
      },
      drilled: { hide: true },
    },
    layout: layoutOf(input),
    relayout: true,
    interaction: { select: 'single' },
    view: { padding: 56, autoFit: 'first' },
  })
}

export type AirDefinition = ReturnType<typeof definitionOf>

type Parts<D> = D extends GraphDefinition<infer S, infer M> ? { state: S; mark: M } : never

export type AirState = Parts<AirDefinition>['state']
export type AirMark = Parts<AirDefinition>['mark']
export type AirGraph = GraphInstance<AirState, AirMark>
export type AirGraphState = GraphState<AirState, AirMark>
export type AirDoubleClick = GraphEventHandler<'doubleclick', AirMark>
