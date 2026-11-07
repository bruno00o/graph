import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { radial } from '@bruno00o/graph/layouts'
import { messages } from './messages'
import { type Branch, createTree, type Twig } from './tree'
import '../shared/overlays.css'

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createTree()
  let root: Key = 't0'

  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Twig>(links, { source: 'from', target: 'to', opacity: 0.6 }),
        nodes<Branch>(items, {
          color: 'branch',
          size: (item) => 22 - item.depth * 3,
          label: 'label',
        }),
      ],
      states: { root: { outline: 'var(--graph-accent)', outlineWidth: 3, raise: true } },
      layout: radial({ root }),
      interaction: { select: false },
    }),
    ariaLabel: messages.graphLabel(items.length),
  })
  graph.states.set('root', { nodes: [root] })

  const status = document.createElement('output')
  status.className = 'example-status'
  status.textContent = messages.root(items[0]?.label ?? '')
  container.append(status)

  graph.on('click', ({ target }) => {
    if (target?.kind !== 'node' || target.key === root) return
    root = target.key
    graph.states.set('root', { nodes: [root] })
    status.textContent = messages.root(target.datum.label)
    void graph.layout.run(radial({ root }), { fit: true, duration: 600 })
  })

  return graph
}
