import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { messages } from './messages'
import '../shared/overlays.css'

interface Point {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly fixed: boolean
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

type Shape = keyof typeof messages.shapes

const shapes = Object.keys(messages.shapes) as Shape[]
const anchorCount = 6
const perAnchor = 16

let seed = 3
function random(): number {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

const points: Point[] = []
const links: Link[] = []
const link = (from: string, to: string) => links.push({ id: `${from}>${to}`, from, to })
for (let anchor = 0; anchor < anchorCount; anchor++) {
  const group = String.fromCharCode(65 + anchor)
  points.push({ id: `a${anchor}`, label: messages.anchor(group), group, fixed: true })
  for (let at = 0; at < perAnchor; at++) {
    const id = `a${anchor}-${at}`
    points.push({ id, label: messages.node(points.length + 1), group, fixed: false })
    link(at < 4 ? `a${anchor}` : `a${anchor}-${at % 4}`, id)
  }
}
for (let at = 0; at < 8; at++) {
  const from = Math.floor(random() * anchorCount)
  const to = (from + 1) % anchorCount
  link(`a${from}-${4 + Math.floor(random() * 12)}`, `a${to}-${4 + Math.floor(random() * 12)}`)
}

const places: Record<Shape, (anchor: number) => { x: number; y: number }> = {
  ring: (anchor) => {
    const angle = (anchor / anchorCount) * Math.PI * 2 - Math.PI / 2
    return { x: Math.cos(angle) * 300, y: Math.sin(angle) * 300 }
  },
  row: (anchor) => ({ x: (anchor - (anchorCount - 1) / 2) * 220, y: 0 }),
  corners: (anchor) => ({
    x: anchor % 2 === 0 ? -360 : 360,
    y: (Math.floor(anchor / 2) - 1) * 220,
  }),
}

export function mount(container: HTMLElement): GraphInstance {
  let shape: Shape = 'ring'
  const place = (point: Point) => (point.fixed ? places[shape](Number(point.id.slice(1))) : null)

  const define = () =>
    defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', opacity: 0.5 }),
        nodes<Point>(points, {
          x: (point) => place(point)?.x,
          y: (point) => place(point)?.y,
          color: 'group',
          size: (point) => (point.fixed ? 30 : 14),
          shape: (point) => (point.fixed ? 'square' : 'circle'),
          label: (point) => (point.fixed ? point.label : null),
        }),
      ],
      scales: { size: (value) => value },
      layout: force({ edgeLength: 16, repulsion: 30 }),
    })

  const graph = mountGraph(container, {
    definition: define(),
    ariaLabel: messages.graphLabel(anchorCount, points.length - anchorCount),
  })

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
    button(messages.shape(messages.shapes[shape]), (element) => {
      shape = shapes[(shapes.indexOf(shape) + 1) % shapes.length] ?? 'ring'
      element.textContent = messages.shape(messages.shapes[shape])
      graph.update({ definition: define() })
      void graph.layout.run(undefined, { fit: true })
    }),
    button(messages.settle, () => void graph.layout.run(undefined, { fit: true })),
  )
  container.append(actions)

  return graph
}
