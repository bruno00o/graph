import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createCommunities, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

const all = createCommunities(600, 900, 37)
const byId = new Map(all.items.map((item) => [item.id, item]))
const around = new Map<string, string[]>()
const connect = (from: string, to: string) => {
  const list = around.get(from)
  if (list) list.push(to)
  else around.set(from, [to])
}
for (const { from, to } of all.links) {
  connect(from, to)
  connect(to, from)
}
const root = all.items.reduce((best, item) => (item.weight > best.weight ? item : best))
const layout = force()

export function mount(container: HTMLElement): GraphInstance {
  const shown = new Set<string>()

  const unseen = (id: string) => (around.get(id) ?? []).filter((other) => !shown.has(other)).length

  const define = () =>
    defineGraph({
      marks: [
        edges<Link>(
          all.links.filter((link) => shown.has(link.from) && shown.has(link.to)),
          { source: 'from', target: 'to' },
        ),
        nodes<Item>(
          [...shown].flatMap((id) => byId.get(id) ?? []),
          {
            color: 'group',
            size: 'weight',
            label: 'label',
            badges: {
              topRight: (item) => {
                const count = unseen(item.id)
                return count > 0 ? { text: count } : null
              },
            },
          },
        ),
      ],
      scales: { size: { range: [12, 36] } },
      layout,
    })

  const graph = mountGraph(container, {
    definition: define(),
    ariaLabel: messages.graphLabel,
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)

  function expand(...ids: string[]): void {
    for (const id of ids) {
      shown.add(id)
      for (const other of around.get(id) ?? []) shown.add(other)
    }
    graph.update({ definition: define() })
    status.textContent = messages.shown(shown.size, all.items.length)
  }

  graph.on('doubleclick', ({ target }) => {
    if (target?.kind === 'node') expand(target.datum.id)
  })

  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'example-button'
  reset.textContent = messages.reset
  reset.addEventListener('click', () => {
    shown.clear()
    expand(root.id)
  })
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(reset)
  container.append(actions)

  expand(root.id, ...(around.get(root.id) ?? []).slice(0, 2))

  return graph
}
