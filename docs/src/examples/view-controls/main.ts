import {
  defineGraph,
  edges,
  type GraphInstance,
  mountGraph,
  nodes,
  type Point,
} from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './view.css'

const { items, links } = createSample(400, 700, 6, 31)
const groups = [...new Set(items.map((item) => item.group))].sort()
const duration = 400

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
  view: { minZoom: 0.05, maxZoom: 12 },
})

function button(text: string, onClick: (element: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  let next = 0
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.fitGroup(groups[next] ?? ''), (element) => {
      const group = groups[next]
      const keys = items.filter((item) => item.group === group).map((item) => item.id)
      graph.view.fit({ nodes: keys, padding: 48, duration })
      next = (next + 1) % groups.length
      element.textContent = messages.fitGroup(groups[next] ?? '')
    }),
    button(messages.fitSelection, () => {
      const { nodes } = graph.selection.get()
      graph.view.fit({ nodes: nodes.length > 0 ? nodes : undefined, padding: 80, duration })
    }),
    button(messages.reset, () => graph.view.set({ x: 0, y: 0, zoom: 1 }, { duration })),
  )

  const zoom = document.createElement('div')
  zoom.className = 'view-zoom'
  const level = document.createElement('output')
  zoom.append(
    button(messages.zoomOut, () => graph.view.zoomBy(1 / 1.5, { duration })),
    level,
    button(messages.zoomIn, () => graph.view.zoomBy(1.5, { duration })),
  )
  zoom.firstElementChild?.setAttribute('aria-label', messages.zoomOutLabel)
  zoom.lastElementChild?.setAttribute('aria-label', messages.zoomInLabel)

  const origin = document.createElement('div')
  origin.className = 'view-origin'
  origin.setAttribute('aria-hidden', 'true')
  const originText = document.createElement('span')
  originText.textContent = messages.origin
  origin.append(originText)

  const status = document.createElement('output')
  status.className = 'example-status'
  let pointer: Point | null = null
  const show = () => {
    const view = graph.view.get()
    level.textContent = messages.zoom(view.zoom)
    status.textContent = pointer ? messages.pointer(pointer) : messages.center(view)
    const { x, y } = graph.view.toScreen({ x: 0, y: 0 })
    origin.style.transform = `translate(${x}px, ${y}px)`
  }

  let last = graph.store.get()
  graph.store.subscribe(() => {
    const state = graph.store.get()
    if (state.view !== last.view || state.width !== last.width || state.height !== last.height) {
      show()
    }
    last = state
  })
  graph.element.addEventListener('pointermove', (event) => {
    const frame = graph.element.getBoundingClientRect()
    pointer = graph.view.toWorld({ x: event.clientX - frame.left, y: event.clientY - frame.top })
    show()
  })
  graph.element.addEventListener('pointerleave', () => {
    pointer = null
    show()
  })
  show()

  graph.element.append(origin)
  container.append(actions, zoom, status)
  return graph
}
