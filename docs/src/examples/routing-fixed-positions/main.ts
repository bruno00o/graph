import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { orthogonalRouting, type RouteAxis } from '@bruno00o/graph/routing'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

interface Box {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly x: number
  readonly y: number
}

interface Wire {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly direct: boolean
}

const next = random(21)
const columns = 5
const rows = 4
const boxes: Box[] = Array.from({ length: columns * rows }, (_, index) => ({
  id: `b${index}`,
  label: messages.node(index + 1),
  group: String.fromCharCode(65 + ((index % columns) >> 1)),
  x: ((index % columns) - (columns - 1) / 2) * 150 + (next() - 0.5) * 60,
  y: (Math.floor(index / columns) - (rows - 1) / 2) * 130 + (next() - 0.5) * 50,
}))
const wires: Wire[] = []
const wire = (from: number, to: number, direct = false) =>
  wires.push({ id: `w${wires.length}`, from: `b${from}`, to: `b${to}`, direct })
boxes.forEach((_, index) => {
  const column = index % columns
  if (column + 1 < columns && next() < 0.6) wire(index, index + 1)
  if (index + columns < boxes.length && next() < 0.5) wire(index, index + columns)
  if (column + 2 < columns && index + columns < boxes.length && next() < 0.35) {
    wire(index, index + columns + 2)
  }
})
wire(6, 8)
wire(6, 8)
wire(0, 19, true)
wire(15, 4, true)

const axes: readonly RouteAxis[] = ['auto', 'horizontal', 'vertical']
const spacings: readonly number[] = [6, 14]

export function mount(container: HTMLElement): GraphInstance {
  let axis: RouteAxis = 'auto'
  let spacing = spacings[0] ?? 6

  const define = () =>
    defineGraph({
      marks: [
        edges<Wire>(wires, {
          source: 'from',
          target: 'to',
          arrow: 'target',
          route: (wire) => !wire.direct,
          dash: (wire) => (wire.direct ? 'dashed' : 'solid'),
        }),
        nodes<Box>(boxes, {
          x: 'x',
          y: 'y',
          color: 'group',
          shape: 'square',
          size: () => 34,
          label: { text: 'label', placement: 'center', size: 13, color: 'var(--graph-paper)' },
        }),
      ],
      scales: { size: (value) => value },
      routing: orthogonalRouting({ axis, spacing, gap: 12 }),
      bridges: true,
      view: { padding: 56 },
    })

  const graph = mountGraph(container, {
    definition: define(),
    ariaLabel: messages.graphLabel(boxes.length, wires.length),
  })
  const redraw = () => graph.update({ definition: define() })

  const button = (text: string, onClick: (element: HTMLButtonElement) => void) => {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'example-button'
    element.textContent = text
    element.addEventListener('click', () => onClick(element))
    return element
  }
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.axis(axis), (element) => {
      axis = axes[(axes.indexOf(axis) + 1) % axes.length] ?? 'auto'
      element.textContent = messages.axis(axis)
      redraw()
    }),
    button(messages.spacing(spacing), (element) => {
      spacing = spacings[(spacings.indexOf(spacing) + 1) % spacings.length] ?? 6
      element.textContent = messages.spacing(spacing)
      redraw()
    }),
  )
  container.append(actions)

  return graph
}
