import type { NodeGroup } from '@bruno00o/graph'
import { defineGraph, edges, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { Anchor, Graph, useGraph, useGraphState } from '@bruno00o/graph/react'
import { type JSX, useMemo } from 'react'
import { destinationsOf, type Network, type Place } from './data'
import type { AirGraphState, AirMark, AirState } from './definition'
import { messages } from './messages'

interface Stop {
  readonly id: number
  readonly code: string
  readonly member: boolean
}

interface Link {
  readonly id: string
  readonly from: number
  readonly to: number
  readonly count: number
}

const previewSize = { width: 280, height: 190 }
const destinationLimit = 7

function previewDefinition(network: Network, members: readonly Place[]) {
  const found = destinationsOf(network, members, destinationLimit)
  const stops: Stop[] = [
    ...members.map((place) => ({ id: place.id, code: place.code, member: true })),
    ...found.map(({ place }) => ({ id: place.id, code: place.code, member: false })),
  ]
  const links: Link[] = found.flatMap(({ links: list }) =>
    list.map((link) => ({ id: `${link.from}-${link.to}`, ...link })),
  )
  return {
    stops,
    definition: defineGraph({
      marks: [
        edges(links, { source: 'from', target: 'to', width: previewWidth, opacity: 0.6 }),
        nodes(stops, {
          size: nodeSize,
          fill: previewFill,
          label: 'code',
        }),
      ],
      scales: { width: { type: 'sqrt', domain: [1, 12], range: [1, 5] } },
      layout: force({ edgeLength: 46 }),
      interaction: { pan: false, zoom: false, select: false, drag: false, keyboard: false },
      view: { padding: 28 },
    }),
  }
}

function previewWidth(link: Link): number {
  return link.count
}

function nodeSize(stop: Stop): number {
  return stop.member ? 14 : 8
}

function previewFill(stop: Stop): string {
  return stop.member ? 'var(--graph-accent)' : 'var(--graph-ink-muted)'
}

function Preview({
  network,
  group,
}: {
  readonly network: Network
  readonly group: NodeGroup<Place>
}): JSX.Element {
  const name = group.data[0]?.areaName ?? ''
  const { definition, stops } = useMemo(
    () => previewDefinition(network, group.data),
    [network, group.data],
  )
  return (
    <div className="air-preview" style={previewSize}>
      <Graph
        definition={definition}
        ariaLabel={messages.preview.label(name)}
        style={{ position: 'absolute', inset: 0 }}
        key={stops.map((stop) => stop.id).join(',')}
      />
    </div>
  )
}

function placeLine(place: Place): string {
  return messages.details.place(place.city, place.country)
}

export function Details({
  network,
  opened,
}: {
  readonly network: Network
  readonly opened: ReadonlySet<string>
}): JSX.Element | null {
  const graph = useGraph<AirState, AirMark>()
  const hovered = useGraphState((state: AirGraphState) => state.hovered)
  if (hovered?.kind === 'edge') {
    const flight = hovered.datum
    const from = network.placeById.get(flight.from)
    const to = network.placeById.get(flight.to)
    if (!from || !to) return null
    const airlines = hovered.aggregate ? hovered.aggregate.count : 1
    const hint =
      airlines > 1 ? (opened.has(flight.pair) ? messages.details.close : messages.details.open) : ''
    return (
      <output className="air-hover">
        <strong>{messages.details.pair(from.code, to.code)}</strong>
        <span>{messages.details.airlines(airlines)}</span>
        {hint ? <span>{hint}</span> : null}
      </output>
    )
  }
  if (hovered?.kind !== 'node') return null
  if (hovered.mark === 'areas') {
    const group = hovered.datum
    const folded = graph.groups.isFolded(hovered.key)
    return (
      <Anchor node={hovered.key} side="top" align="center" offset={{ x: 0, y: -8 }}>
        <div className="air-tooltip air-tooltip-group">
          <strong>{messages.details.area(group.data[0]?.areaName ?? '', group.count)}</strong>
          {folded ? <Preview network={network} group={group} /> : null}
        </div>
      </Anchor>
    )
  }
  const place = hovered.datum
  return (
    <Anchor node={hovered.key} side="top" align="center" offset={{ x: 0, y: -4 }}>
      <div className="air-tooltip">
        <strong>{messages.details.airport(place.code, place.name)}</strong>
        <span>{placeLine(place)}</span>
        <span>{messages.details.routes(place.routes)}</span>
      </div>
    </Anchor>
  )
}
