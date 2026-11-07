import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { messages } from './messages'
import { createStream } from './stream'
import '../shared/overlays.css'

const total = 400
const batch = 10
const every = 150

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const stream = createStream(total, batch, every)
  const definition = defineGraph({
    marks: [
      edges(stream.edges, { source: 'from', target: 'to', opacity: 0.6 }),
      nodes(stream.nodes, { color: 'group', size: 'weight', label: 'label' }),
    ],
    scales: { size: { domain: [1, 30], range: [8, 40] } },
    layout: force(),
  })
  const graph = mountGraph(container, { definition, ariaLabel: messages.graphLabel })

  const status = document.createElement('output')
  status.className = 'example-status'
  const show = () => {
    status.textContent = messages.progress(stream.sent(), total, batch, every)
  }
  stream.onBatch(() => {
    show()
    if (stream.sent() === total) void graph.layout.run()
  })
  show()
  let following = true
  graph.on('dragstart', () => {
    following = false
  })
  graph.on('layoutend', ({ completed }) => {
    if (completed && following) graph.view.fit(undefined, { duration: 300 })
  })

  let paused = false
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.pause, (element) => {
      paused = !paused
      stream.pause(paused)
      element.textContent = paused ? messages.resume : messages.pause
    }),
    button(messages.restart, () => {
      following = true
      stream.restart()
    }),
  )
  container.append(actions, status)

  return graph
}
