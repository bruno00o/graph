import {
  defineGraph,
  type EdgeArrow,
  type EdgeDash,
  edges,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { messages } from '../shared/messages'
import { button, createPage, status, themeToggle } from '../shared/page'

interface Spot {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly x: number
  readonly y: number
}

interface Route {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly group: string
  readonly arrow: EdgeArrow
  readonly dash: EdgeDash
}

const spots: Spot[] = [
  { id: 'a', label: messages.node('A'), group: messages.group('A'), x: -260, y: -60 },
  { id: 'b', label: messages.node('B'), group: messages.group('B'), x: 0, y: -160 },
  { id: 'c', label: messages.node('C'), group: messages.group('C'), x: 260, y: -40 },
  { id: 'd', label: messages.node('D'), group: messages.group('D'), x: 60, y: 170 },
  { id: 'e', label: messages.node('E'), group: messages.group('E'), x: -200, y: 190 },
]

const pairs: ReadonlyArray<readonly [string, string, number]> = [
  ['a', 'b', 2],
  ['b', 'c', 3],
  ['c', 'd', 4],
  ['d', 'e', 1],
  ['e', 'a', 5],
  ['b', 'd', 2],
]
const arrows: readonly EdgeArrow[] = ['target', 'none', 'both', 'source']
const dashes: readonly EdgeDash[] = ['solid', 'dashed', 'solid', 'dotted']

const routes: Route[] = []
for (const [from, to, count] of pairs) {
  for (let at = 0; at < count; at++) {
    const forward = at % 2 === 0
    routes.push({
      id: `${from}${to}${at}`,
      from: forward ? from : to,
      to: forward ? to : from,
      group: messages.group(String.fromCharCode(65 + at)),
      arrow: arrows[at % arrows.length] ?? 'target',
      dash: dashes[at % dashes.length] ?? 'solid',
    })
  }
}
for (const [id, count] of [
  ['a', 1],
  ['c', 2],
  ['d', 3],
] as const) {
  for (let at = 0; at < count; at++) {
    routes.push({
      id: `${id}${id}${at}`,
      from: id,
      to: id,
      group: messages.group(String.fromCharCode(65 + at)),
      arrow: 'target',
      dash: 'solid',
    })
  }
}

const definition = defineGraph({
  marks: [
    edges<Route>(routes, {
      source: 'from',
      target: 'to',
      color: 'group',
      width: () => 2.5,
      arrow: (route) => route.arrow,
      dash: (route) => route.dash,
    }),
    nodes<Spot>(spots, { x: 'x', y: 'y', color: 'group', size: () => 34, label: 'label' }),
  ],
  scales: { size: (value) => value, width: (value) => value },
})

const { header, main } = createPage(messages.edges)
const graph = mountGraph(main, { definition, ariaLabel: messages.edgesLabel })

const hovered = status()
graph.on('pointerenter', ({ target }) => {
  if (target.kind === 'edge') {
    const route = target.datum as Route
    hovered.textContent = messages.route(route.from.toUpperCase(), route.to.toUpperCase())
  } else {
    hovered.textContent = (target.datum as Spot).label
  }
})
graph.on('pointerleave', () => {
  hovered.textContent = ''
})

header.append(
  hovered,
  button(messages.fit, () => graph.view.fit(undefined, { duration: 400 })),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph })
