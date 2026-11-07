import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

const batchSize = 50_000
const batchCount = 8
const { items, links } = createSample(100_000, batchSize * batchCount, 8, 3, 0.02)
const itemMark = nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight' })

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', onClick)
  return element
}

function afterFrame(): Promise<void> {
  return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
}

export function mount(container: HTMLElement): GraphInstance {
  let shown = 1
  const define = () =>
    defineGraph({
      marks: [
        edges<Link>(links.slice(0, shown * batchSize), {
          source: 'from',
          target: 'to',
          opacity: 0.35,
        }),
        itemMark,
      ],
    })
  const graph = mountGraph(container, {
    definition: define(),
    ariaLabel: messages.graphLabel(items.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  status.textContent = messages.total(shown * batchSize)

  const append = async () => {
    if (shown >= batchCount) return
    shown += 1
    const start = performance.now()
    graph.update({ definition: define() })
    await afterFrame()
    const time = performance.now() - start
    status.textContent = `${messages.added(batchSize, time)} ${messages.total(shown * batchSize)}`
  }

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.append(batchSize), () => void append()),
    button(messages.reset, () => {
      shown = 1
      graph.update({ definition: define() })
      status.textContent = messages.total(batchSize)
    }),
  )
  container.append(actions, status)

  return graph
}
