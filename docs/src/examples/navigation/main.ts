import {
  defineGraph,
  edges,
  type GraphInstance,
  mountGraph,
  nodes,
  type ViewBounds,
  type WheelMode,
} from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

type BoundsMode = keyof typeof messages.boundsModes

const wheelModes = Object.keys(messages.wheelModes) as WheelMode[]
const boundsModes = Object.keys(messages.boundsModes) as BoundsMode[]
const areas: Record<BoundsMode, ViewBounds | null> = { nodes: { margin: 80 }, none: null }
const hintDuration = 1500

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createSample(600, 1_200)
  let wheel: WheelMode = 'page'
  let bounds: BoundsMode = 'nodes'

  const define = () =>
    defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
        nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
      ],
      interaction: { wheel, lasso: true },
      view: { minZoom: 0.2, maxZoom: 6, bounds: areas[bounds] },
    })

  const graph = mountGraph(container, {
    definition: define(),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const hint = document.createElement('div')
  hint.className = 'example-hint'
  hint.hidden = true
  let timer: ReturnType<typeof setTimeout> | undefined
  graph.on('zoomhint', ({ key }) => {
    hint.textContent = messages.zoomHint(key)
    hint.hidden = false
    clearTimeout(timer)
    timer = setTimeout(() => {
      hint.hidden = true
    }, hintDuration)
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  const showZoom = () => {
    status.textContent = messages.zoomLevel(graph.view.get().zoom)
  }
  showZoom()
  graph.on('viewchange', showZoom)

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.wheelMode(messages.wheelModes[wheel]), (element) => {
      wheel = wheelModes[(wheelModes.indexOf(wheel) + 1) % wheelModes.length] ?? 'page'
      element.textContent = messages.wheelMode(messages.wheelModes[wheel])
      hint.hidden = true
      graph.update({ definition: define() })
    }),
    button(messages.boundsMode(messages.boundsModes[bounds]), (element) => {
      bounds = boundsModes[(boundsModes.indexOf(bounds) + 1) % boundsModes.length] ?? 'nodes'
      element.textContent = messages.boundsMode(messages.boundsModes[bounds])
      graph.update({ definition: define() })
    }),
  )
  container.append(actions, status, hint)

  return graph
}
