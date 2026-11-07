import {
  defineGraph,
  type EdgeArrow,
  type EdgeDash,
  edges,
  type GraphInstance,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { messages } from './messages'
import '../shared/overlays.css'

interface Point {
  readonly id: string
  readonly x: number
  readonly y: number
}

interface Sample {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly arrow: EdgeArrow
  readonly dash: EdgeDash
}

const arrows: readonly EdgeArrow[] = ['none', 'target', 'source', 'both']
const dashes: readonly EdgeDash[] = ['solid', 'dashed', 'dotted']
const widths: readonly number[] = [1.5, 3, 5]

const points: Point[] = []
const samples: Sample[] = []
arrows.forEach((arrow, row) => {
  dashes.forEach((dash, column) => {
    const id = `${arrow}-${dash}`
    const x = (column - 1) * 240
    const y = (row - 1.5) * 110
    points.push({ id: `${id}-from`, x: x - 85, y }, { id: `${id}-to`, x: x + 85, y })
    samples.push({ id, from: `${id}-from`, to: `${id}-to`, arrow, dash })
  })
})

const define = (width: number) =>
  defineGraph({
    marks: [
      edges<Sample>(samples, {
        source: 'from',
        target: 'to',
        color: 'dash',
        width,
        arrow: (sample) => sample.arrow,
        dash: (sample) => sample.dash,
        label: (sample) => messages.sample(sample.dash, sample.arrow),
      }),
      nodes<Point>(points, { x: 'x', y: 'y', size: 14 }),
    ],
  })

export function mount(container: HTMLElement): GraphInstance {
  let width = widths[1] ?? 3
  const graph = mountGraph(container, {
    definition: define(width),
    ariaLabel: messages.graphLabel(samples.length),
  })

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-button'
  button.textContent = messages.width(width)
  button.addEventListener('click', () => {
    width = widths[(widths.indexOf(width) + 1) % widths.length] ?? width
    button.textContent = messages.width(width)
    graph.update({ definition: define(width) })
  })
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions)

  return graph
}
