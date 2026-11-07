import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { persistPositions } from '@bruno00o/graph/db'
import { debounceStrategy } from '@tanstack/db'
import { createSample, type Link } from '../shared/data'
import { messages } from './messages'
import { createServer } from './server'
import '../shared/overlays.css'

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createSample(36, 48, 4, 5, 0.04)
  const server = createServer(
    items.map(({ id, label, group, weight, x, y }) => ({
      id,
      label,
      group,
      weight,
      x: x * 2.5,
      y: y * 2.5,
    })),
    900,
  )

  const definition = defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', opacity: 0.6 }),
      nodes(server.spots, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
    ],
    scales: { size: { range: [12, 30] } },
    states: { saving: { outline: 'var(--graph-accent)', outlineWidth: 3 } },
    transitions: { positions: 400 },
  })
  const graph = mountGraph(container, { definition, ariaLabel: messages.graphLabel })

  const status = document.createElement('output')
  status.className = 'example-status'
  status.setAttribute('aria-live', 'polite')
  status.textContent = messages.idle

  persistPositions(graph, {
    collection: server.spots,
    strategy: debounceStrategy({ wait: 150 }),
    pendingState: 'saving',
    mutationFn: async ({ transaction }) => {
      const rows = transaction.mutations.map((mutation) => mutation.modified)
      const names = rows.map((row) => row.label)
      status.textContent = messages.saving(names)
      try {
        await server.save(rows)
        status.textContent = messages.saved(names)
      } catch (error) {
        status.textContent = messages.refused(names)
        throw error
      }
    },
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.server(server.refuse), (element) => {
      server.refuse = !server.refuse
      element.textContent = messages.server(server.refuse)
    }),
  )
  container.append(actions, status)

  return graph
}
