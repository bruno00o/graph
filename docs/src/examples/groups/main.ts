import {
  type AggregateEdge,
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

interface Item {
  readonly id: string
  readonly label: string
  readonly parent: string | null
  readonly tone: string
  readonly x?: number
  readonly y?: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

let seed = 7
function random(): number {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

const items: Item[] = []
const links: Link[] = []
const leaves: string[][] = []

for (const [at, name] of ['A', 'B', 'C', 'D'].entries()) {
  const group = `g${name}`
  items.push({ id: group, label: messages.group(name), parent: null, tone: name })
  const nested = at % 2 === 0 ? 2 : 1
  const centerX = at % 2 === 0 ? -300 : 300
  const centerY = at < 2 ? -200 : 200
  for (let inner = 1; inner <= nested; inner++) {
    const subgroup = `${group}${inner}`
    const parent = nested > 1 ? subgroup : group
    if (nested > 1) {
      items.push({
        id: subgroup,
        label: messages.subgroup(`${name}${inner}`),
        parent: group,
        tone: name,
      })
    }
    const members: string[] = []
    const count = 4 + Math.floor(random() * 4)
    const x = nested > 1 ? centerX + (inner === 1 ? -120 : 120) : centerX
    const radius = 30 + count * 8
    for (let index = 1; index <= count; index++) {
      const id = `${parent}-${index}`
      const angle = (index / count) * Math.PI * 2
      items.push({
        id,
        label: messages.member(`${name}${inner}-${index}`),
        parent,
        tone: name,
        x: x + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      })
      members.push(id)
    }
    for (const [index, id] of members.entries()) {
      const next = members[(index + 1) % members.length]
      if (next) links.push({ id: `${id}>${next}`, from: id, to: next })
    }
    leaves.push(members)
  }
}
for (const [at, id] of ['x', 'y'].entries()) {
  items.push({
    id,
    label: messages.member(id.toUpperCase()),
    parent: null,
    tone: 'E',
    x: 0,
    y: at === 0 ? -20 : 20,
  })
  leaves.push([id])
}
for (let at = 0; at < 12; at++) {
  const from = leaves[Math.floor(random() * leaves.length)] ?? []
  const to = leaves[Math.floor(random() * leaves.length)] ?? []
  const source = from[Math.floor(random() * from.length)]
  const target = to[Math.floor(random() * to.length)]
  if (source && target && source !== target)
    links.push({ id: `${source}~${target}~${at}`, from: source, to: target })
}

const definition = defineGraph({
  marks: [
    edges<Link>(links, {
      source: 'from',
      target: 'to',
      aggregate: {
        width: (aggregate) => aggregate.count,
        label: (aggregate) => (aggregate.count > 1 ? String(aggregate.count) : null),
      },
    }),
    nodes<Item>(items, {
      x: 'x',
      y: 'y',
      parent: 'parent',
      color: 'tone',
      label: 'label',
      container: { padding: 20 },
    }),
  ],
  scales: { width: (value) => 1 + value },
})

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', onClick)
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.groupsLabel,
    initialFolded: ['gC'],
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.foldAll, () => graph.groups.fold()),
    button(messages.unfoldAll, () => graph.groups.unfold()),
  )
  container.append(actions)

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)

  const labelOf = (key: Key) => items.find((item) => item.id === key)?.label ?? String(key)
  const showFolded = () => {
    status.textContent = messages.foldedGroups(graph.groups.folded().length)
  }
  showFolded()
  graph.on('foldchange', showFolded)
  graph.on('pointerenter', ({ target }) => {
    if (target.kind === 'node') {
      status.textContent = labelOf(target.key)
      return
    }
    const aggregate: AggregateEdge | undefined = target.aggregate
    const link = target.datum as Link
    status.textContent = aggregate
      ? messages.mergedEdges(aggregate.count, labelOf(aggregate.source), labelOf(aggregate.target))
      : messages.route(labelOf(link.from), labelOf(link.to))
  })
  graph.on('pointerleave', showFolded)

  return graph
}
