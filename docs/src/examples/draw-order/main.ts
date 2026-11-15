import { defineGraph, edges, type GraphInstance, mountGraph, nodes, raw } from '@bruno00o/graph'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

interface Place {
  readonly id: string
  readonly stack: number
  readonly level: number
  readonly x: number
  readonly y: number
  readonly count: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const next = random(11)
const places: Place[] = []
const links: Link[] = []
for (let stack = 0; stack < 12; stack++) {
  const x = (stack % 4) * 170 - 255 + (next() - 0.5) * 50
  const y = Math.floor(stack / 4) * 160 - 160 + (next() - 0.5) * 50
  const height = 2 + Math.floor(next() * 4)
  for (let level = 0; level < height; level++) {
    places.push({
      id: `p${stack}-${level}`,
      stack,
      level,
      x,
      y,
      count: 5 + Math.round(next() * 95),
    })
  }
  if (stack > 0) links.push({ id: `l${stack}`, from: `p${stack - 1}-0`, to: `p${stack}-0` })
}

const size = raw((place: Place) => 12 + Math.sqrt(place.count) * 5)
const fill = (place: Place) => `var(--graph-cat-${place.level + 1})`
const bigUnder = (place: Place) => -place.count
const bigOver = (place: Place) => place.count

const define = (bigFirst: boolean) =>
  defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Place>(places, {
        x: 'x',
        y: 'y',
        size,
        fill,
        order: bigFirst ? bigUnder : bigOver,
      }),
    ],
  })

export function mount(container: HTMLElement): GraphInstance {
  let bigFirst = true
  const graph = mountGraph(container, {
    definition: define(bigFirst),
    ariaLabel: messages.graphLabel(places.length, 12),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  status.textContent = messages.empty

  graph.on('selectionchange', ({ selection }) => {
    const key = selection.nodes[0]
    const place = places.find((candidate) => candidate.id === key)
    const below = place ? places.filter((other) => other.stack === place.stack).length : 0
    status.textContent = place ? messages.picked(place.count, below) : messages.empty
  })

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-button'
  button.textContent = messages.order(bigFirst)
  button.addEventListener('click', () => {
    bigFirst = !bigFirst
    button.textContent = messages.order(bigFirst)
    graph.update({ definition: define(bigFirst) })
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions, status)
  return graph
}
