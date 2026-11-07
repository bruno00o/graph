import {
  type AggregateEdge,
  defineGraph,
  edges,
  type GraphInstance,
  groups,
  mountGraph,
  type NodeGroup,
  nodes,
  raw,
} from '@bruno00o/graph'
import { createLegend, mountLegend } from '@bruno00o/graph/legend'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

interface Item {
  readonly id: string
  readonly label: string
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
      label: messages.itemName(index),
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

const names = new Map(items.map((item) => [item.id, item.label]))

function dominant(group: NodeGroup<Item>): string {
  const counts = families.map((value) => group.data.filter((item) => item.family === value).length)
  return familyColors[counts.indexOf(Math.max(...counts))] ?? ''
}

const endLabel = (count: (aggregate: AggregateEdge<Exchange>) => number) => ({
  text: (aggregate: AggregateEdge<Exchange>) =>
    count(aggregate) > 0 ? String(count(aggregate)) : null,
  background: true,
})

const sectorMark = groups(items, {
  by: 'sector',
  name: 'sectors',
  size: raw((group) => 30 + Math.sqrt(group.count) * 8),
  fill: dominant,
  label: (group) => messages.sectorName(String(group.value)),
  container: { padding: 18 },
})

function define(merged: boolean, grouped: boolean) {
  return defineGraph({
    marks: [
      edges(exchanges, {
        source: 'from',
        target: 'to',
        name: 'exchanges',
        arrow: 'target',
        merge: merged ? { directed: false } : false,
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
        label: 'label',
      }),
      ...(grouped ? [sectorMark] : []),
    ],
    scales: {
      color: { domain: families, range: familyColors },
      width: { domain: [1, 5], range: [1.5, 7] },
    },
    states: { off: { hide: true } },
    interaction: { select: 'multiple' },
  })
}

export function mount(container: HTMLElement): GraphInstance {
  let merged = true
  let grouped = false
  const graph = mountGraph(container, {
    definition: define(merged, grouped),
    ariaLabel: messages.transformsLabel(items.length, exchanges.length),
  })
  const redraw = () => graph.update({ definition: define(merged, grouped) })

  const legend = createLegend(graph, { hidden: 'off' })
  const view = mountLegend(legend, {
    sections: ['color'],
    titles: { color: messages.familiesTitle },
    format: (value) => messages.familyName(String(value)),
    ariaLabel: messages.familiesLabel,
  })
  view.element.classList.add('example-scale-legend', 'example-scale-legend-right')
  container.append(view.element)

  const button = (text: () => string, onClick: () => void) => {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'example-button'
    element.textContent = text()
    element.addEventListener('click', () => {
      onClick()
      element.textContent = text()
    })
    return element
  }
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(
      () => messages.mergeToggle(merged),
      () => {
        merged = !merged
        redraw()
      },
    ),
    button(
      () => messages.sectorToggle(grouped),
      () => {
        grouped = !grouped
        redraw()
      },
    ),
  )
  container.append(actions)

  const status = document.createElement('output')
  status.className = 'example-status'
  status.textContent = messages.transformsHint
  container.append(status)
  graph.on('pointerenter', ({ target }) => {
    if (target.mark === 'sectors') {
      status.textContent = messages.sectorStatus(String(target.datum.value), target.datum.count)
    } else if (target.mark === 'items') {
      status.textContent = target.datum.label
    } else if (target.kind === 'edge') {
      const merge = target.aggregate
      const name = (key: string | number) =>
        names.get(String(key)) ?? messages.sectorName(String(key).slice(-1))
      status.textContent = merge
        ? messages.mergedStatus(
            name(merge.source),
            name(merge.target),
            merge.forward.count,
            merge.backward.count,
          )
        : messages.route(name(target.datum.from), name(target.datum.to))
    }
  })
  graph.on('pointerleave', () => {
    status.textContent = messages.transformsHint
  })
  return graph
}
