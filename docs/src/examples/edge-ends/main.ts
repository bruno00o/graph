import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

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
  label: `Node ${id.toUpperCase()}`,
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

type Split = keyof typeof messages.endSplitModes
type Labels = keyof typeof messages.edgeLabelModes
const splits: readonly Split[] = ['half', 'share']
const labelModes: readonly Labels[] = ['plain', 'plated', 'none']

const endLabel = (labels: Labels, value: (exchange: Exchange) => number) =>
  labels === 'none'
    ? {}
    : {
        label: {
          text: (exchange: Exchange) => String(value(exchange)),
          background: labels === 'plated',
        },
      }

const define = (split: Split, labels: Labels) =>
  defineGraph({
    marks: [
      edges<Exchange>(exchanges, {
        source: 'from',
        target: 'to',
        arrow: 'both',
        ends: {
          split:
            split === 'half'
              ? 0.5
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
  })

function cycle<T>(values: readonly T[], current: T): T {
  return values[(values.indexOf(current) + 1) % values.length] ?? current
}

export function mount(container: HTMLElement): GraphInstance {
  let split: Split = 'half'
  let labels: Labels = 'plain'
  const graph = mountGraph(container, {
    definition: define(split, labels),
    ariaLabel: messages.endsLabel,
  })
  const redraw = () => graph.update({ definition: define(split, labels) })

  const splitButton = document.createElement('button')
  splitButton.type = 'button'
  splitButton.className = 'example-button'
  splitButton.textContent = messages.endSplit(messages.endSplitModes[split])
  splitButton.addEventListener('click', () => {
    split = cycle(splits, split)
    splitButton.textContent = messages.endSplit(messages.endSplitModes[split])
    redraw()
  })
  const labelButton = document.createElement('button')
  labelButton.type = 'button'
  labelButton.className = 'example-button'
  labelButton.textContent = messages.endLabels(messages.edgeLabelModes[labels])
  labelButton.addEventListener('click', () => {
    labels = cycle(labelModes, labels)
    labelButton.textContent = messages.endLabels(messages.edgeLabelModes[labels])
    redraw()
  })
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(splitButton, labelButton)
  container.append(actions)

  const hovered = document.createElement('output')
  hovered.className = 'example-status'
  hovered.textContent = messages.endsHint
  container.append(hovered)

  graph.on('pointerenter', ({ target }) => {
    if (target.kind === 'node') {
      hovered.textContent = target.datum.label
      return
    }
    const exchange = target.datum
    const first = target.end === 'source'
    hovered.textContent = messages.sent(
      (first ? exchange.from : exchange.to).toUpperCase(),
      first ? exchange.forward : exchange.backward,
    )
  })
  graph.on('pointerleave', () => {
    hovered.textContent = messages.endsHint
  })

  return graph
}
