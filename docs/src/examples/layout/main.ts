import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { type ForceEngine, force } from '@bruno00o/graph/layouts/force'
import { createCommunities, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

const sizes = [1_000, 5_000, 20_000, 80_000]
const engines: readonly ForceEngine[] = ['auto', 'gpu', 'cpu']

const generate = (count: number) => createCommunities(count, Math.round(count * 1.66))

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  let size = sizes[1] ?? 5_000
  let engine: ForceEngine = 'auto'
  let layout = force({ engine })
  let { items, links } = generate(size)

  const define = () =>
    defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', opacity: 0.5 }),
        nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
      ],
      scales: { size: { range: [6, 30] } },
      layout,
    })
  const ariaLabel = () => messages.graphLabel(items.length, links.length)

  const graph = mountGraph(container, { definition: define(), ariaLabel: ariaLabel() })

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)

  let started = performance.now()
  graph.on('layoutstart', () => {
    started = performance.now()
  })
  graph.store.subscribe(() => {
    const { running, progress } = graph.store.get().layout
    if (running) status.textContent = messages.layoutProgress(progress)
  })
  graph.on('layoutend', ({ completed }) => {
    status.textContent = completed
      ? messages.layoutDone((performance.now() - started) / 1000)
      : messages.layoutStopped
  })

  const grow = () => {
    const added: Item[] = []
    const joined: Link[] = []
    for (let offset = 0; offset < 10; offset++) {
      const index = items.length + offset
      const anchor = items[Math.floor(Math.random() * items.length)]
      if (!anchor) continue
      added.push({ ...anchor, id: `n${index}`, label: messages.node(index + 1) })
      joined.push({ id: `g${index}`, from: anchor.id, to: `n${index}` })
    }
    items = [...items, ...added]
    links = [...links, ...joined]
    graph.update({ definition: define(), ariaLabel: ariaLabel() })
  }

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.runAgain, () => void graph.layout.run()),
    button(messages.stop, () => graph.layout.stop()),
    button(messages.grow, grow),
    button(messages.nodeCount(size), (element) => {
      size = sizes[(sizes.indexOf(size) + 1) % sizes.length] ?? size
      element.textContent = messages.nodeCount(size)
      const sample = generate(size)
      items = sample.items
      links = sample.links
      graph.update({ definition: define(), ariaLabel: ariaLabel() })
      void graph.layout.run().then((completed) => {
        if (completed) graph.view.fit(undefined, { duration: 400 })
      })
    }),
    button(messages.engine(messages.engines[engine]), (element) => {
      engine = engines[(engines.indexOf(engine) + 1) % engines.length] ?? 'auto'
      element.textContent = messages.engine(messages.engines[engine])
      layout = force({ engine })
      graph.update({ definition: define() })
    }),
  )
  container.append(actions)

  return graph
}
