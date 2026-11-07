import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
  type Point,
} from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createCommunities, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './menu.css'

const { items, links } = createCommunities(120, 180, 13)
const duration = 400

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
  ],
  scales: { size: { range: [10, 36] } },
  states: {
    marked: { outline: 'var(--graph-accent)', outlineWidth: 3, label: true },
    off: { hide: true },
  },
  layout: force(),
})

type Entry = readonly [text: string, run: () => void]

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const menu = document.createElement('div')
  menu.className = 'example-menu'
  menu.setAttribute('role', 'menu')
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close()
  })

  function close(): void {
    graph.anchors.remove(menu)
  }

  function open(
    title: string,
    entries: readonly Entry[],
    where: { readonly node: Key } | { readonly point: Point },
  ): void {
    const heading = document.createElement('strong')
    heading.textContent = title
    const buttons = entries.map(([text, run]) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'menuitem')
      button.textContent = text
      button.addEventListener('click', () => {
        run()
        close()
      })
      return button
    })
    menu.replaceChildren(heading, ...buttons)
    graph.anchors.set(menu, { ...where, side: 'right', align: 'start', interactive: true })
  }

  function nodeMenu(key: Key, label: string): void {
    const marked = graph.states.has('marked', { kind: 'node', key })
    open(
      label,
      [
        [
          messages.selectNeighbors,
          () => graph.selection.set({ nodes: [key, ...graph.neighbors(key)] }),
        ],
        [messages.frame, () => graph.view.fit({ nodes: [key, ...graph.neighbors(key)], duration })],
        marked
          ? [messages.unmark, () => graph.states.remove('marked', { nodes: [key] })]
          : [messages.mark, () => graph.states.add('marked', { nodes: [key] })],
        [messages.hide, () => graph.states.add('off', { nodes: [key] })],
      ],
      { node: key },
    )
  }

  graph.on('contextmenu', ({ target, world, originalEvent }) => {
    originalEvent.preventDefault()
    if (target?.kind === 'node') nodeMenu(target.key, target.datum.label)
    else if (!target) {
      open(
        messages.graph,
        [
          [messages.showHidden, () => graph.states.clear('off')],
          [messages.clearMarks, () => graph.states.clear('marked')],
          [messages.fit, () => graph.view.fit({ duration })],
        ],
        { point: world },
      )
    }
  })
  graph.on('click', close)
  graph.on('dragstart', close)

  const hub = items.reduce((best, item) => (item.weight > best.weight ? item : best))
  graph.states.add('marked', { nodes: [hub.id] })
  nodeMenu(hub.id, hub.label)

  return graph
}
