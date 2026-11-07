import {
  defineGraph,
  type ElementKeys,
  edges,
  type GraphEventName,
  type GraphInstance,
  type GraphTarget,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './log.css'

const { items, links } = createSample(90, 140, 4, 21)
const labels = new Map(items.map((item) => [item.id, item.label]))
const limit = 14
const merged = new Set<GraphEventName>(['viewchange', 'positionchange'])

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
})

type Marks = (typeof definition.marks)[number]

function describe(target: GraphTarget<Marks> | null): string {
  if (!target) return messages.background
  if (target.kind === 'node') return target.datum.label
  return messages.edge(labels.get(target.datum.from), labels.get(target.datum.to))
}

function counts({ nodes, edges }: ElementKeys): string {
  return messages.elements(nodes.length, edges.length)
}

export function mount(container: HTMLElement): GraphInstance {
  const layout = document.createElement('div')
  layout.className = 'event-layout'
  const host = document.createElement('div')
  host.className = 'event-graph'
  const graph = mountGraph(host, { definition, ariaLabel: messages.graphLabel })

  const panel = document.createElement('section')
  panel.className = 'event-log'
  panel.setAttribute('aria-label', messages.logLabel)
  const list = document.createElement('ol')
  panel.append(list)

  let last: { name: GraphEventName; count: number; text: HTMLSpanElement } | null = null
  const log = (name: GraphEventName, detail: string) => {
    if (merged.has(name) && last?.name === name && last.text.isConnected) {
      last.count += 1
      last.text.textContent = messages.repeated(detail, last.count)
      return
    }
    const entry = document.createElement('li')
    const code = document.createElement('code')
    code.textContent = name
    const text = document.createElement('span')
    text.textContent = detail
    entry.append(code, text)
    list.prepend(entry)
    last = { name, count: 1, text }
    while (list.children.length > limit) list.lastElementChild?.remove()
  }

  graph.on('pointerenter', ({ target }) => log('pointerenter', describe(target)))
  graph.on('pointerleave', ({ target }) => log('pointerleave', describe(target)))
  graph.on('click', ({ target, world }) => log('click', messages.at(describe(target), world)))
  graph.on('doubleclick', ({ target }) => log('doubleclick', describe(target)))
  graph.on('contextmenu', ({ target, originalEvent }) => {
    originalEvent.preventDefault()
    log('contextmenu', describe(target))
  })
  graph.on('dragstart', ({ target, keys }) =>
    log('dragstart', messages.drag(target.datum.label, keys.length)),
  )
  graph.on('dragend', ({ target, world }) => log('dragend', messages.at(target.datum.label, world)))
  graph.on('positionchange', ({ origin, positions }) =>
    log('positionchange', messages.moved(origin, positions.size)),
  )
  graph.on('selectionchange', ({ selection }) => log('selectionchange', counts(selection)))
  graph.on('focuschange', ({ target }) =>
    log('focuschange', target ? describe(target) : messages.none),
  )
  graph.on('viewchange', ({ view }) => log('viewchange', messages.view(view)))

  const clear = document.createElement('button')
  clear.type = 'button'
  clear.className = 'example-button'
  clear.textContent = messages.clear
  clear.addEventListener('click', () => list.replaceChildren())
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(clear)

  layout.append(host, panel)
  container.append(layout, actions)
  return graph
}
