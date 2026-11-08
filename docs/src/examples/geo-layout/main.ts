import {
  defineGraph,
  edges,
  type GraphInstance,
  geoToWorld,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { geo } from '@bruno00o/graph/layouts'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

interface Spot {
  readonly id: string
  readonly label: string | null
  readonly area: string
  readonly weight: number
  readonly longitude: number | null
  readonly latitude: number | null
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const center = { longitude: 4, latitude: 46.5 }
const scale = 300
const origin = geoToWorld(center)
const spacings = [2, 6, 12]

const next = random(23)
const spots: Spot[] = []
const links: Link[] = []
const hubs: string[] = []
for (let area = 0; area < 7; area++) {
  const longitude = center.longitude + (next() - 0.5) * 3.2
  const latitude = center.latitude + (next() - 0.5) * 2
  const letter = String.fromCharCode(65 + area)
  const hub = `s${spots.length}`
  hubs.push(hub)
  const first = spots.length
  const count = 18 + Math.floor(next() * 30)
  for (let index = 0; index < count; index++) {
    const shared = index > 1 && next() < 0.35 ? spots[first + Math.floor(next() * index)] : null
    const spread = () => (next() + next() + next() - 1.5) * 0.12
    spots.push({
      id: `s${spots.length}`,
      label: index === 0 ? messages.hub(letter) : null,
      area: letter,
      weight: index === 0 ? 60 : Math.round(4 + next() ** 2 * 30),
      longitude: shared ? shared.longitude : longitude + (index === 0 ? 0 : spread() * 1.4),
      latitude: shared ? shared.latitude : latitude + (index === 0 ? 0 : spread()),
    })
    if (index > 0) links.push({ id: `l${links.length}`, from: hub, to: `s${spots.length - 1}` })
  }
}
for (let index = 0; index < 4; index++) {
  const hub = hubs[index * 2] ?? 's0'
  spots.push({
    id: `s${spots.length}`,
    label: null,
    area: '?',
    weight: 10,
    longitude: null,
    latitude: null,
  })
  links.push({ id: `l${links.length}`, from: hub, to: `s${spots.length - 1}` })
}
hubs.forEach((hub, index) => {
  links.push({ id: `l${links.length}`, from: hub, to: hubs[(index + 1) % hubs.length] ?? hub })
})

function pinned(spot: Spot, axis: 'x' | 'y'): number | null {
  if (spot.longitude === null || spot.latitude === null) return null
  const point = geoToWorld({ longitude: spot.longitude, latitude: spot.latitude })
  return (point[axis] - origin[axis]) * scale
}

function definitionOf(spread: boolean, spacing: number) {
  return defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', opacity: 0.25 }),
      nodes<Spot>(spots, {
        color: 'area',
        size: 'weight',
        label: { text: 'label', background: true },
        ...(spread
          ? {}
          : { x: (spot: Spot) => pinned(spot, 'x'), y: (spot: Spot) => pinned(spot, 'y') }),
      }),
    ],
    scales: { size: { range: [10, 30] } },
    layout: geo<Spot>({ center, scale, spacing, order: (a, b) => b.weight - a.weight }),
  })
}

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  let spread = true
  let spacing = spacings[0] ?? 2
  const graph = mountGraph(container, {
    definition: definitionOf(spread, spacing),
    ariaLabel: messages.graphLabel(spots.length),
  })
  const apply = () => graph.update({ definition: definitionOf(spread, spacing) })

  const spacingButton = button(messages.spacing(spacing), (element) => {
    spacing = spacings[(spacings.indexOf(spacing) + 1) % spacings.length] ?? 2
    element.textContent = messages.spacing(spacing)
    apply()
  })
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.spread, (element) => {
      spread = !spread
      element.textContent = spread ? messages.spread : messages.pinned
      spacingButton.disabled = !spread
      apply()
    }),
    spacingButton,
  )
  container.append(actions)

  return graph
}
