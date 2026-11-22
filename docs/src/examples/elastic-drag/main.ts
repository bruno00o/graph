import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createCommunities, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

const { items, links } = createCommunities(220, 330, 41)

const define = (elastic: boolean) =>
  defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
    ],
    scales: { size: { range: [10, 30] } },
    layout: force(),
    interaction: { drag: elastic ? 'elastic' : true },
  })

export function mount(container: HTMLElement): GraphInstance {
  let elastic = true
  const graph = mountGraph(container, {
    definition: define(elastic),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-button'
  button.setAttribute('aria-pressed', 'true')
  button.textContent = messages.mode(elastic)
  button.addEventListener('click', () => {
    elastic = !elastic
    button.setAttribute('aria-pressed', String(elastic))
    button.textContent = messages.mode(elastic)
    graph.update({ definition: define(elastic) })
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  let dragged = new Set<string | number>()
  graph.on('dragstart', ({ keys }) => {
    dragged = new Set(keys)
  })
  graph.on('positionchange', ({ origin, positions }) => {
    if (origin !== 'drag') return
    const followed = [...positions.keys()].filter((key) => !dragged.has(key))
    if (followed.length > 0) status.textContent = messages.followed(followed.length)
  })
  status.textContent = messages.followed(0)

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions, status)
  return graph
}
