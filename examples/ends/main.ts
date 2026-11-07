import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { orthogonalRouting } from '@bruno00o/graph/routing'
import { messages } from '../shared/messages'
import { button, choice, createPage, exportButtons, status, themeToggle } from '../shared/page'

interface Spot {
  readonly id: string
  readonly label: string
  readonly x: number
  readonly y: number
}

interface Exchange {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly forward: number
  readonly backward: number
}

const ring = ['a', 'b', 'c', 'd', 'e', 'f']
const spots: Spot[] = ring.map((id, at) => ({
  id,
  label: messages.node(id.toUpperCase()),
  x: Math.cos((at / ring.length) * Math.PI * 2 - Math.PI / 2) * 240,
  y: Math.sin((at / ring.length) * Math.PI * 2 - Math.PI / 2) * 240,
}))

const exchanges: Exchange[] = [
  { id: 'ab', from: 'a', to: 'b', forward: 82, backward: 14 },
  { id: 'bc', from: 'b', to: 'c', forward: 35, backward: 61 },
  { id: 'cd', from: 'c', to: 'd', forward: 48, backward: 47 },
  { id: 'de', from: 'd', to: 'e', forward: 9, backward: 93 },
  { id: 'ef', from: 'e', to: 'f', forward: 70, backward: 28 },
  { id: 'fa', from: 'f', to: 'a', forward: 22, backward: 54 },
  { id: 'ad', from: 'a', to: 'd', forward: 66, backward: 31 },
  { id: 'da', from: 'd', to: 'a', forward: 18, backward: 40 },
  { id: 'cf', from: 'c', to: 'f', forward: 57, backward: 12 },
  { id: 'cc', from: 'c', to: 'c', forward: 25, backward: 75 },
]

type Split = keyof typeof messages.endSplits
type Labels = keyof typeof messages.endLabelModes

const endLabel = (labels: Labels, value: (exchange: Exchange) => number) =>
  labels === 'none'
    ? {}
    : {
        label: {
          text: (exchange: Exchange) => messages.units(value(exchange)),
          background: labels === 'plated',
        },
      }

const define = (split: Split, labels: Labels, flowing: boolean, routed: boolean) =>
  defineGraph({
    marks: [
      edges<Exchange>(exchanges, {
        source: 'from',
        target: 'to',
        arrow: () => 'both',
        ...(flowing ? { flow: () => 30 } : {}),
        ends: {
          split:
            split === 'half'
              ? () => 0.5
              : (exchange) => exchange.forward / (exchange.forward + exchange.backward),
          source: {
            color: 'forward',
            width: 'forward',
            ...endLabel(labels, (exchange) => exchange.forward),
          },
          target: {
            color: 'backward',
            width: 'backward',
            ...endLabel(labels, (exchange) => exchange.backward),
          },
        },
      }),
      nodes<Spot>(spots, { x: 'x', y: 'y', size: () => 36, label: 'label' }),
    ],
    scales: {
      size: (value) => value,
      color: {
        type: 'sequential',
        domain: [0, 100],
        range: ['var(--graph-cat-3)', 'var(--graph-cat-2)', 'var(--graph-cat-4)'],
      },
      width: { domain: [0, 100], range: [1.5, 9] },
    },
    routing: routed ? orthogonalRouting({ spacing: 12 }) : null,
    bridges: routed,
  })

const params = new URLSearchParams(location.search)
let split: Split = params.get('split') === 'share' ? 'share' : 'half'
let labels: Labels = params.get('labels') === 'plated' ? 'plated' : 'plain'
let flowing = params.has('flow')
let routed = params.get('routing') === 'orthogonal'

const { header, main } = createPage(messages.ends)
const graph = mountGraph(main, {
  definition: define(split, labels, flowing, routed),
  ariaLabel: messages.endsLabel,
})
const redraw = () => graph.update({ definition: define(split, labels, flowing, routed) })

const hovered = status()
hovered.textContent = messages.endsHint
graph.on('pointerenter', ({ target }) => {
  if (target.kind === 'node') {
    hovered.textContent = target.datum.label
    return
  }
  const exchange = target.datum
  const first = target.end === 'source'
  hovered.textContent = messages.sent(
    messages.node((first ? exchange.from : exchange.to).toUpperCase()),
    first ? exchange.forward : exchange.backward,
  )
})
graph.on('pointerleave', () => {
  hovered.textContent = messages.endsHint
})

header.append(
  hovered,
  choice(
    messages.endSplit,
    Object.entries(messages.endSplits).map(([value, text]) => ({ value, text })),
    split,
    (value) => {
      split = value === 'share' ? 'share' : 'half'
      redraw()
    },
  ),
  choice(
    messages.endLabels,
    Object.entries(messages.endLabelModes).map(([value, text]) => ({ value, text })),
    labels,
    (value) => {
      labels = value === 'none' || value === 'plated' ? value : 'plain'
      redraw()
    },
  ),
  choice(
    messages.routingMode,
    (['straight', 'orthogonal'] as const).map((value) => ({
      value,
      text: messages.routingModes[value],
    })),
    routed ? 'orthogonal' : 'straight',
    (value) => {
      routed = value === 'orthogonal'
      redraw()
    },
  ),
  button(messages.flows, () => {
    flowing = !flowing
    redraw()
  }),
  button(messages.fit, () => graph.view.fit({ duration: 400 })),
  ...exportButtons(graph, 'ends', { png: messages.exportPng, svg: messages.exportSvg }),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph })
