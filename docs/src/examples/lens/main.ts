import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createSample(20_000, 40_000)
  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', opacity: 0.5 }),
        nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
      ],
      interaction: { lens: { radius: 110, zoom: 4 } },
    }),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)
  const describe = () => {
    const lens = graph.lens.get()
    status.textContent = lens ? messages.lensShown(lens.zoom) : messages.lensHint
  }
  graph.on('lenschange', describe)
  describe()

  const button = (text: string, onClick: () => void) => {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'example-button'
    element.textContent = text
    element.addEventListener('click', onClick)
    return element
  }
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.lensFixed, () => {
      const { width, height } = graph.store.get()
      graph.lens.set({ at: { x: width / 2, y: height / 2 } })
    }),
    button(messages.lensHide, () => graph.lens.set(null)),
  )
  container.append(actions)

  return graph
}
