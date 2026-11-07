import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { type LayersDirection, layers } from '@bruno00o/graph/layouts'
import { orthogonalRouting } from '@bruno00o/graph/routing'
import { createHierarchy, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

type Mode = keyof typeof messages.routingModes
type Bridge = keyof typeof messages.bridgeModes
type Corner = keyof typeof messages.cornerModes

const modes = Object.keys(messages.routingModes) as Mode[]
const bridges = Object.keys(messages.bridgeModes) as Bridge[]
const corners = Object.keys(messages.cornerModes) as Corner[]
const directions = Object.keys(messages.directions) as LayersDirection[]

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

function next<T>(values: readonly T[], value: T): T {
  return values[(values.indexOf(value) + 1) % values.length] ?? value
}

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createHierarchy(120, 170)
  let mode: Mode = 'orthogonal'
  let bridge: Bridge = 'arc'
  let corner: Corner = '6'
  let direction: LayersDirection = 'down'

  const define = () =>
    defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', arrow: 'target', opacity: 0.8 }),
        nodes<Item>(items, { color: 'group', size: 'weight', shape: 'square', label: 'label' }),
      ],
      scales: { size: { range: [10, 20] } },
      layout: layers({ direction }),
      routing:
        mode === 'orthogonal'
          ? orthogonalRouting({
              axis: direction === 'down' || direction === 'up' ? 'vertical' : 'horizontal',
              radius: Number(corner),
            })
          : null,
      bridges: bridge === 'off' ? null : { shape: bridge },
    })

  const graph = mountGraph(container, {
    definition: define(),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)

  let started = performance.now()
  let running = false
  graph.store.subscribe(() => {
    const now = graph.store.get().routing.running
    if (now === running) return
    running = now
    if (running) started = performance.now()
    status.textContent = running ? messages.routing : messages.routed(performance.now() - started)
  })

  const redraw = () => graph.update({ definition: define() })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.routingMode(messages.routingModes[mode]), (element) => {
      mode = next(modes, mode)
      element.textContent = messages.routingMode(messages.routingModes[mode])
      redraw()
    }),
    button(messages.bridgeMode(messages.bridgeModes[bridge]), (element) => {
      bridge = next(bridges, bridge)
      element.textContent = messages.bridgeMode(messages.bridgeModes[bridge])
      redraw()
    }),
    button(messages.cornerMode(messages.cornerModes[corner]), (element) => {
      corner = next(corners, corner)
      element.textContent = messages.cornerMode(messages.cornerModes[corner])
      redraw()
    }),
    button(messages.direction(messages.directions[direction]), (element) => {
      direction = next(directions, direction)
      element.textContent = messages.direction(messages.directions[direction])
      redraw()
      void graph.layout.run(undefined, { fit: true })
    }),
  )
  container.append(actions)

  return graph
}
