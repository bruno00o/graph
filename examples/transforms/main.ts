import {
  type AggregateEdge,
  defineGraph,
  edges,
  groups,
  mountGraph,
  type NodeGroup,
  nodes,
  raw,
} from '@bruno00o/graph'
import { createLegend, mountLegend } from '@bruno00o/graph/legend'
import { orthogonalRouting } from '@bruno00o/graph/routing'
import { messages } from '../shared/messages'
import { button, choice, createPage, exportButtons, status, themeToggle } from '../shared/page'

interface Item {
  readonly id: string
  readonly index: number
  readonly sector: string
  readonly family: string
  readonly x: number
  readonly y: number
}

interface Exchange {
  readonly id: string
  readonly from: string
  readonly to: string
}

const halves = new URLSearchParams(location.search).has('halves')
const sectors = ['A', 'B', 'C', 'D']
const families = ['1', '2', '3']
const familyColors = ['var(--graph-cat-1)', 'var(--graph-cat-3)', 'var(--graph-cat-5)']
const perSector = 9
const centers = [
  { x: -260, y: -170 },
  { x: 260, y: -170 },
  { x: -260, y: 170 },
  { x: 260, y: 170 },
]

const items: Item[] = sectors.flatMap((sector, s) =>
  Array.from({ length: perSector }, (_, at) => {
    const index = s * perSector + at + 1
    const angle = (at / perSector) * Math.PI * 2
    const center = centers[s] ?? { x: 0, y: 0 }
    return {
      id: `n${index}`,
      index,
      sector,
      family: families[(s + (at % 4 === 0 ? 1 : 0) + (at % 7 === 0 ? 1 : 0)) % 3] ?? '1',
      x: center.x + Math.cos(angle) * 95,
      y: center.y + Math.sin(angle) * 95,
    }
  }),
)

const exchanges: Exchange[] = []
const link = (from: number, to: number, times = 1) => {
  for (let time = 0; time < times; time++) {
    exchanges.push({ id: `e${exchanges.length + 1}`, from: `n${from}`, to: `n${to}` })
  }
}
for (let s = 0; s < sectors.length; s++) {
  const first = s * perSector + 1
  for (let at = 0; at < perSector; at++) link(first + at, first + ((at + 1) % perSector))
  link(first, first + 4, 2)
  link(first + 2, first + 6)
}
link(1, 14, 3)
link(14, 1, 2)
link(3, 21, 2)
link(12, 32, 1)
link(32, 12, 1)
link(25, 34, 4)
link(30, 7, 1)
link(17, 26, 2)

const family = new Map(items.map((item) => [item.id, item.family]))
const label = new Map(items.map((item) => [item.id, messages.item(item.index)]))

function dominant(group: NodeGroup<Item>): string {
  const counts = families.map((value) => group.data.filter((item) => item.family === value).length)
  const best = counts.indexOf(Math.max(...counts))
  return familyColors[best] ?? familyColors[0] ?? ''
}

const endLabel = (count: (aggregate: AggregateEdge<Exchange>) => number) => ({
  text: (aggregate: AggregateEdge<Exchange>) =>
    count(aggregate) > 0 ? messages.count(count(aggregate)) : null,
  background: true,
})

type Merge = keyof typeof messages.mergeModes
type Sectors = keyof typeof messages.sectorModes

const sectorMark = groups(items, {
  by: 'sector',
  name: 'sectors',
  size: raw((group) => 30 + Math.sqrt(group.count) * 8),
  fill: dominant,
  label: (group) => messages.sector(String(group.value)),
  container: { padding: 18 },
})

function define(merge: Merge, grouped: Sectors, routed: boolean) {
  return defineGraph({
    marks: [
      edges(exchanges, {
        source: 'from',
        target: 'to',
        name: 'exchanges',
        arrow: 'target',
        merge: merge === 'merged' ? { directed: false, halves } : false,
        aggregate: {
          width: (aggregate) => aggregate.count,
          ends: {
            target: {
              stroke: (aggregate) =>
                aggregate.forward.count > 0 ? 'var(--graph-cat-2)' : 'var(--graph-cat-4)',
              label: endLabel((aggregate) => aggregate.forward.count),
            },
            source: {
              stroke: (aggregate) =>
                aggregate.backward.count > 0 ? 'var(--graph-cat-4)' : 'var(--graph-cat-2)',
              label: endLabel((aggregate) => aggregate.backward.count),
            },
          },
        },
      }),
      nodes(items, {
        name: 'items',
        x: 'x',
        y: 'y',
        color: 'family',
        size: 18,
        label: (item) => label.get(item.id) ?? item.id,
      }),
      ...(grouped === 'grouped' ? [sectorMark] : []),
    ],
    scales: {
      color: { domain: families, range: familyColors },
      width: { domain: [1, 5], range: [1.5, 7] },
    },
    states: { off: { hide: true } },
    interaction: { select: 'multiple' },
    routing: routed ? orthogonalRouting({ spacing: 10 }) : null,
    bridges: routed,
  })
}

const params = new URLSearchParams(location.search)
let merge: Merge = params.get('merge') === 'split' ? 'split' : 'merged'
let grouped: Sectors = params.get('sectors') === 'grouped' ? 'grouped' : 'items'
let routed = params.get('routing') === 'orthogonal'

const { header, main } = createPage(messages.transforms)
const graph = mountGraph(main, {
  definition: define(merge, grouped, routed),
  ariaLabel: messages.transformsLabel(items.length, exchanges.length),
})
const redraw = () => graph.update({ definition: define(merge, grouped, routed) })

const legend = createLegend(graph, { hidden: 'off' })
const legendView = mountLegend(legend, {
  sections: ['color'],
  titles: { color: messages.familiesTitle },
  format: (value) => messages.family(String(value)),
  ariaLabel: messages.familiesLabel,
})
legendView.element.classList.add('legend')
main.append(legendView.element)

const hovered = status()
hovered.textContent = messages.transformsHint
graph.on('pointerenter', ({ target }) => {
  if (target.mark === 'sectors') {
    hovered.textContent = messages.sectorStatus(String(target.datum.value), target.datum.count)
    return
  }
  if (target.mark === 'items') {
    hovered.textContent = label.get(target.datum.id) ?? target.datum.id
    return
  }
  if (target.kind !== 'edge') return
  const merged = target.aggregate
  const name = (key: string | number) =>
    label.get(String(key)) ?? messages.sector(String(key).slice(-1))
  hovered.textContent = merged
    ? messages.exchanges(
        name(merged.source),
        name(merged.target),
        merged.forward.count,
        merged.backward.count,
      )
    : messages.exchange(name(target.datum.from), name(target.datum.to))
})
graph.on('pointerleave', () => {
  hovered.textContent = messages.transformsHint
})

header.append(
  hovered,
  choice(
    messages.mergeMode,
    Object.entries(messages.mergeModes).map(([value, text]) => ({ value, text })),
    merge,
    (value) => {
      merge = value === 'split' ? 'split' : 'merged'
      redraw()
    },
  ),
  choice(
    messages.sectorMode,
    Object.entries(messages.sectorModes).map(([value, text]) => ({ value, text })),
    grouped,
    (value) => {
      grouped = value === 'grouped' ? 'grouped' : 'items'
      redraw()
    },
  ),
  choice(
    messages.routingMode,
    Object.entries(messages.routingModes).map(([value, text]) => ({ value, text })),
    routed ? 'orthogonal' : 'straight',
    (value) => {
      routed = value === 'orthogonal'
      redraw()
    },
  ),
  button(messages.foldAll, () => graph.groups.fold()),
  button(messages.unfoldAll, () => graph.groups.unfold()),
  button(messages.fit, () => graph.view.fit({ duration: 400 })),
  ...exportButtons(graph, 'transforms', { png: messages.exportPng, svg: messages.exportSvg }),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph, legend, family })
