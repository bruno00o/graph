import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { type LayersDirection, layers } from '@bruno00o/graph/layouts'
import { orthogonalRouting } from '@bruno00o/graph/routing'
import { createHierarchy, type Item, type Link, nestHierarchy } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { button, choice, createPage, exportButtons, status, themeToggle } from '../shared/page'

type Mode = keyof typeof messages.routingModes
type Bridge = keyof typeof messages.bridgeModes
type Corner = keyof typeof messages.corners

const sizes = [100, 300, 1_000, 3_000, 10_000]
const params = new URLSearchParams(location.search)
const nodeCount = Number(params.get('nodes') ?? 300)
const grouped = params.get('groups') === 'nested'
const sample = createHierarchy(nodeCount, Math.round(nodeCount * 1.4))
const { links } = sample
const items = grouped ? nestHierarchy(sample) : sample.items
const directions = Object.keys(messages.directions) as LayersDirection[]
const corners = Object.keys(messages.corners) as Corner[]
const pick = <T extends string>(name: string, values: readonly T[], fallback: T): T =>
  values.find((value) => value === params.get(name)) ?? fallback
let direction = pick<LayersDirection>('direction', directions, 'down')
let mode = pick<Mode>('routing', ['straight', 'orthogonal'], 'orthogonal')
let bridge = pick<Bridge>('bridges', ['arc', 'gap', 'off'], 'arc')
let corner: Corner = '6'

const axisOf = (value: LayersDirection) =>
  value === 'down' || value === 'up' ? 'vertical' : 'horizontal'

const define = () =>
  defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', arrow: 'target', label: 'id' }),
      nodes<Item>(items, {
        color: 'group',
        size: 'weight',
        shape: 'square',
        label: 'label',
        parent: 'parent',
        container: { padding: 14 },
      }),
    ],
    scales: { size: { range: [10, 20] } },
    layout: layers({ direction }),
    routing:
      mode === 'orthogonal'
        ? orthogonalRouting({ axis: axisOf(direction), radius: Number(corner) })
        : null,
    bridges: bridge === 'off' ? null : { shape: bridge },
  })

const { header, main } = createPage(messages.routing)
const graph = mountGraph(main, {
  definition: define(),
  ariaLabel: messages.graphLabel(formatNumber(sample.items.length), formatNumber(links.length)),
})

const progress = status()
let started = performance.now()
let running = false
graph.store.subscribe(() => {
  const next = graph.store.get().routing.running
  if (next === running) return
  running = next
  if (running) started = performance.now()
  progress.textContent = running
    ? messages.routingRunning
    : messages.routingDone(performance.now() - started)
})
const redraw = () => {
  graph.update({ definition: define() })
}

const hint = document.createElement('span')
hint.className = 'hint'
hint.textContent = messages.routingHint

header.append(
  hint,
  progress,
  choice(
    messages.size,
    sizes.map((size) => ({ value: String(size), text: formatNumber(size) })),
    String(nodeCount),
    (value) => {
      params.set('nodes', value)
      location.search = params.toString()
    },
  ),
  choice(
    messages.direction,
    directions.map((value) => ({ value, text: messages.directions[value] })),
    direction,
    (value) => {
      direction = directions.find((option) => option === value) ?? direction
      redraw()
      void graph.layout.run(undefined, { fit: true })
    },
  ),
  choice(
    messages.routingMode,
    (['orthogonal', 'straight'] as const).map((value) => ({
      value,
      text: messages.routingModes[value],
    })),
    mode,
    (value) => {
      mode = value === 'straight' ? 'straight' : 'orthogonal'
      redraw()
    },
  ),
  choice(
    messages.corner,
    corners.map((value) => ({ value, text: messages.corners[value] })),
    corner,
    (value) => {
      corner = corners.find((option) => option === value) ?? corner
      redraw()
    },
  ),
  choice(
    messages.bridges,
    (['arc', 'gap', 'off'] as const).map((value) => ({ value, text: messages.bridgeModes[value] })),
    bridge,
    (value) => {
      bridge = value === 'gap' ? 'gap' : value === 'off' ? 'off' : 'arc'
      redraw()
    },
  ),
  button(messages.reroute, () => void graph.routing.run()),
  button(messages.fit, () => graph.view.fit({ duration: 400 })),
  ...exportButtons(graph, 'routage', { png: messages.exportPng, svg: messages.exportSvg }),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph })
