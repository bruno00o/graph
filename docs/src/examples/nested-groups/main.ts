import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { layers } from '@bruno00o/graph/layouts'
import { force } from '@bruno00o/graph/layouts/force'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

interface Item {
  readonly id: string
  readonly label: string
  readonly parent: string | null
  readonly tone: string
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
    for (let index = 1; index <= count; index++) {
      const id = `${parent}-${index}`
      items.push({ id, label: messages.member(`${name}${inner}-${index}`), parent, tone: name })
      members.push(id)
    }
    for (const [index, id] of members.entries()) {
      const next = members[(index + 1) % members.length]
      if (next) links.push({ id: `${id}>${next}`, from: id, to: next })
    }
    leaves.push(members)
  }
}
for (const id of ['x', 'y']) {
  items.push({ id, label: messages.member(id.toUpperCase()), parent: null, tone: 'E' })
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
      parent: 'parent',
      color: 'tone',
      label: 'label',
      container: { padding: 20 },
    }),
  ],
  scales: { width: (value) => 1 + value },
  layout: force(),
})

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

const arrangements = {
  force: force(),
  layers: layers(),
}

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.groupsLabel,
    initialFolded: ['gC'],
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  let kind: keyof typeof arrangements = 'force'
  actions.append(
    button(messages.layoutKind(messages.layoutKinds.force), (element) => {
      kind = kind === 'force' ? 'layers' : 'force'
      element.textContent = messages.layoutKind(messages.layoutKinds[kind])
      void graph.layout.run(arrangements[kind], { fit: true })
    }),
    button(messages.foldAll, () => graph.groups.fold()),
    button(messages.unfoldAll, () => graph.groups.unfold()),
  )
  container.append(actions)

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)

  const labelOf = (key: Key) => graph.datumOf({ kind: 'node', key })?.label ?? String(key)
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
    const { aggregate, endpoints } = target
    const from = labelOf(endpoints.source)
    const to = labelOf(endpoints.target)
    status.textContent = aggregate
      ? messages.mergedEdges(aggregate.count, from, to)
      : messages.route(from, to)
  })
  graph.on('pointerleave', showFolded)

  return graph
}
