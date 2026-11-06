import {
  type AggregateEdge,
  defineGraph,
  edges,
  type Key,
  type Layout,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { grid, layers, radial, rings } from '@bruno00o/graph/layouts'
import { force } from '@bruno00o/graph/layouts/force'
import { messages } from '../shared/messages'
import { button, choice, createPage, exportButtons, status, themeToggle } from '../shared/page'

type Kind = keyof typeof messages.layoutKinds

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
const tones = ['A', 'B', 'C', 'D']

for (const [at, name] of tones.entries()) {
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
      items.push({ id, label: messages.node(`${name}${inner}-${index}`), parent, tone: name })
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
  items.push({ id, label: messages.node(id.toUpperCase()), parent: null, tone: 'E' })
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

const layouts: Record<Kind, Layout> = {
  force: force(),
  layers: layers(),
  grid: grid(),
  rings: rings(),
  radial: radial(),
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
  layout: layouts.force,
})

const { header, main } = createPage(messages.groups)
const graph = mountGraph(main, {
  definition,
  ariaLabel: messages.groupsLabel,
  initialFolded: ['gC'],
})

const labelOf = (key: Key) => items.find((item) => item.id === key)?.label ?? String(key)
const hovered = status()
const folded = status()
const showFolded = (keys: readonly Key[]) => {
  folded.textContent = messages.foldedGroups(keys.length)
}
showFolded(graph.groups.folded())
graph.on('foldchange', ({ folded }) => showFolded(folded))
graph.on('pointerenter', ({ target }) => {
  if (target.kind === 'node') {
    hovered.textContent = labelOf(target.key)
    return
  }
  const aggregate: AggregateEdge | undefined = target.aggregate
  const link = target.datum
  hovered.textContent = aggregate
    ? messages.mergedEdges(aggregate.count, labelOf(aggregate.source), labelOf(aggregate.target))
    : messages.route(labelOf(link.from), labelOf(link.to))
})
graph.on('pointerleave', () => {
  hovered.textContent = ''
})

const hint = status()
hint.textContent = messages.groupsHint

const kinds = Object.keys(messages.layoutKinds) as Kind[]

header.append(
  hint,
  hovered,
  folded,
  choice(
    messages.layoutKind,
    kinds.map((value) => ({ value, text: messages.layoutKinds[value] })),
    'force',
    (value) => {
      const kind = kinds.find((candidate) => candidate === value) ?? 'force'
      void graph.layout.run(layouts[kind], { fit: true })
    },
  ),
  button(messages.foldAll, () => graph.groups.fold()),
  button(messages.unfoldAll, () => graph.groups.unfold()),
  button(messages.fit, () => graph.view.fit(undefined, { duration: 400 })),
  ...exportButtons(graph, 'groups', { png: messages.exportPng, svg: messages.exportSvg }),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph })
