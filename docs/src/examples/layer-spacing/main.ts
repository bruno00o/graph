import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { type LayersDirection, layers } from '@bruno00o/graph/layouts'
import { createHierarchy, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import '../shared/controls.css'

const directions = Object.keys(messages.directions) as LayersDirection[]

function slider(
  text: (value: number) => string,
  value: number,
  max: number,
  onInput: (value: number) => void,
): HTMLLabelElement {
  const label = document.createElement('label')
  const caption = document.createElement('span')
  caption.textContent = text(value)
  const input = document.createElement('input')
  input.type = 'range'
  input.min = '0'
  input.max = String(max)
  input.value = String(value)
  input.addEventListener('input', () => {
    caption.textContent = text(input.valueAsNumber)
    onInput(input.valueAsNumber)
  })
  label.append(caption, input)
  return label
}

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createHierarchy(48, 64)
  let direction: LayersDirection = 'right'
  let layerSpacing = 80
  let nodeSpacing = 12
  const layout = () => layers({ direction, layerSpacing, nodeSpacing })

  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', arrow: 'target', opacity: 0.6 }),
        nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
      ],
      scales: { size: { range: [10, 30] } },
      layout: layout(),
    }),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })
  const arrange = (duration = 400) => void graph.layout.run(layout(), { fit: true, duration })

  const turn = document.createElement('button')
  turn.type = 'button'
  turn.className = 'example-button'
  turn.textContent = messages.direction(messages.directions[direction])
  turn.addEventListener('click', () => {
    direction = directions[(directions.indexOf(direction) + 1) % directions.length] ?? 'down'
    turn.textContent = messages.direction(messages.directions[direction])
    arrange()
  })
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(turn)

  const panel = document.createElement('div')
  panel.className = 'example-panel example-sliders'
  panel.append(
    slider(messages.layerSpacing, layerSpacing, 240, (value) => {
      layerSpacing = value
      arrange(150)
    }),
    slider(messages.nodeSpacing, nodeSpacing, 80, (value) => {
      nodeSpacing = value
      arrange(150)
    }),
  )
  container.append(actions, panel)

  return graph
}
