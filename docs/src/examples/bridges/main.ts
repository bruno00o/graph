import {
  type BridgeShape,
  defineGraph,
  edges,
  type GraphInstance,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { messages } from './messages'
import '../shared/overlays.css'

interface Post {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Wire {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly axis: 'horizontal' | 'vertical'
}

interface Shortcut {
  readonly id: string
  readonly from: string
  readonly to: string
}

const lines = 5
const half = 240
const offsets = Array.from(
  { length: lines },
  (_, index) => ((index + 0.5) / lines - 0.5) * 2 * half,
)

const posts: Post[] = offsets.flatMap((offset, index) => [
  { id: `top${index}`, x: offset, y: -half },
  { id: `bottom${index}`, x: offset, y: half },
  { id: `left${index}`, x: -half, y: offset },
  { id: `right${index}`, x: half, y: offset },
])

const wires: Wire[] = offsets.flatMap((_, index): Wire[] => [
  { id: `v${index}`, from: `top${index}`, to: `bottom${index}`, axis: 'vertical' },
  { id: `h${index}`, from: `left${index}`, to: `right${index}`, axis: 'horizontal' },
])

const shortcuts: Shortcut[] = [
  { id: 'd0', from: 'left0', to: 'bottom3' },
  { id: 'd1', from: 'top1', to: 'right4' },
  { id: 'd2', from: 'left4', to: 'top4' },
]

type Shape = BridgeShape | 'off'
const shapes: readonly Shape[] = ['arc', 'gap', 'off']
const sizes: readonly number[] = [8, 14]

const define = (shape: Shape, size: number) =>
  defineGraph({
    marks: [
      edges<Wire>(wires, { source: 'from', target: 'to', color: 'axis', width: () => 2.5 }),
      edges<Shortcut>(shortcuts, {
        source: 'from',
        target: 'to',
        dash: 'dashed',
        stroke: 'var(--graph-ink-muted)',
        width: () => 1.5,
        bridge: false,
      }),
      nodes<Post>(posts, { x: 'x', y: 'y', shape: 'square', size: () => 12 }),
    ],
    scales: { size: (value) => value, width: (value) => value },
    bridges: shape === 'off' ? null : { shape, size },
    view: { padding: 64 },
  })

export function mount(container: HTMLElement): GraphInstance {
  let shape: Shape = 'arc'
  let size = sizes[1] ?? 14
  const graph = mountGraph(container, {
    definition: define(shape, size),
    ariaLabel: messages.graphLabel(wires.length + shortcuts.length),
  })
  const redraw = () => graph.update({ definition: define(shape, size) })

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
    button(messages.shape(shape), (element) => {
      shape = shapes[(shapes.indexOf(shape) + 1) % shapes.length] ?? 'arc'
      element.textContent = messages.shape(shape)
      redraw()
    }),
    button(messages.size(size), (element) => {
      size = sizes[(sizes.indexOf(size) + 1) % sizes.length] ?? 8
      element.textContent = messages.size(size)
      redraw()
    }),
  )
  container.append(actions)

  return graph
}
