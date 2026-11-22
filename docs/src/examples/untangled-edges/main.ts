import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

interface Item {
  readonly id: string
  readonly cluster: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

type Mode = keyof typeof messages.mode

const next = random(5)
const items: Item[] = []
const links: Link[] = []
const firsts: number[] = []
const link = (from: number, to: number) => {
  links.push({ id: `l${links.length}`, from: `n${from}`, to: `n${to}` })
}
for (let cluster = 0; cluster < 12; cluster++) {
  const first = items.length
  const size = 12 + Math.floor(next() * 7)
  firsts.push(first)
  for (let at = 0; at < size; at++) items.push({ id: `n${first + at}`, cluster })
  for (let at = 1; at < size; at++) link(first + Math.floor(next() * at), first + at)
  for (let at = 0; at < 2; at++) {
    const from = first + Math.floor(next() * size)
    const to = first + Math.floor(next() * size)
    if (from !== to) link(from, to)
  }
  if (cluster > 0) {
    const other = firsts[Math.floor(next() * cluster)] ?? 0
    link(other + Math.floor(next() * 3), first + Math.floor(next() * size))
  }
}

const layouts = { untangled: force(), plain: force({ untangle: false }) }

const define = (mode: Mode) =>
  defineGraph({
    marks: [
      edges(links, { source: 'from', target: 'to' }),
      nodes(items, { color: 'cluster', size: 16 }),
    ],
    layout: layouts[mode],
    view: { autoFit: 'layouts' },
  })

function crossings(graph: GraphInstance): number {
  const ends: number[] = []
  for (const link of links) {
    const a = graph.positions.get(link.from)
    const b = graph.positions.get(link.to)
    if (a && b) ends.push(a.x, a.y, b.x, b.y)
  }
  const side = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
    Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax))
  let total = 0
  for (let i = 0; i < ends.length; i += 4) {
    const [ax = 0, ay = 0, bx = 0, by = 0] = ends.slice(i, i + 4)
    for (let j = i + 4; j < ends.length; j += 4) {
      const [cx = 0, cy = 0, dx = 0, dy = 0] = ends.slice(j, j + 4)
      if (
        side(ax, ay, bx, by, cx, cy) * side(ax, ay, bx, by, dx, dy) < 0 &&
        side(cx, cy, dx, dy, ax, ay) * side(cx, cy, dx, dy, bx, by) < 0
      ) {
        total++
      }
    }
  }
  return total
}

export function mount(container: HTMLElement): GraphInstance {
  let mode: Mode = 'untangled'
  const graph = mountGraph(container, {
    definition: define(mode),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  graph.on('layoutstart', () => {
    status.textContent = messages.running
  })
  graph.on('layoutend', ({ completed }) => {
    if (completed) status.textContent = messages.crossings(crossings(graph))
  })

  const other = (): Mode => (mode === 'untangled' ? 'plain' : 'untangled')
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-button'
  button.textContent = messages.mode[other()]
  button.addEventListener('click', () => {
    mode = other()
    button.textContent = messages.mode[other()]
    graph.update({ definition: define(mode) })
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions, status)
  return graph
}
