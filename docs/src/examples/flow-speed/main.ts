import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { messages } from './messages'
import '../shared/overlays.css'

interface Station {
  readonly id: string
  readonly label: string
  readonly x: number
  readonly y: number
}

interface Pipe {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly rate: number
}

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

const next = random(31)
const columns = [4, 6, 4]
const stations: Station[] = columns.flatMap((count, column) =>
  Array.from({ length: count }, (_, row) => ({
    id: `s${column}-${row}`,
    label: messages.node(column * 10 + row + 1),
    x: (column - 1) * 320,
    y: (row - (count - 1) / 2) * 90,
  })),
)
const pipes: Pipe[] = []
for (let column = 0; column < columns.length - 1; column++) {
  const here = stations.filter((station) => station.id.startsWith(`s${column}-`))
  const there = stations.filter((station) => station.id.startsWith(`s${column + 1}-`))
  for (const station of here) {
    const picks = new Set([Math.floor(next() * there.length), Math.floor(next() * there.length)])
    for (const pick of picks) {
      const target = there[pick]
      if (!target) continue
      const speed = Math.round(15 + next() * 105)
      pipes.push({
        id: `p${pipes.length}`,
        from: station.id,
        to: target.id,
        rate: next() < 0.25 ? -speed : speed,
      })
    }
  }
}

const factors: readonly number[] = [0.5, 1, 2]

export function mount(container: HTMLElement): GraphInstance {
  let direction = 1
  let factor = 1
  let running = true

  const define = () =>
    defineGraph({
      marks: [
        edges<Pipe>(pipes, {
          source: 'from',
          target: 'to',
          width: (pipe) => Math.abs(pipe.rate),
          color: (pipe) => (pipe.rate * direction > 0 ? 'forward' : 'back'),
          arrow: (pipe) => (pipe.rate * direction > 0 ? 'target' : 'source'),
          flow: (pipe) => (running ? pipe.rate * direction * factor : false),
          label: (pipe) => messages.speed(Math.abs(pipe.rate) * factor),
        }),
        nodes<Station>(stations, { x: 'x', y: 'y', size: () => 22, label: 'label' }),
      ],
      scales: {
        size: (value) => value,
        width: { range: [1.5, 5] },
        color: { domain: ['forward', 'back'], range: ['var(--graph-cat-1)', 'var(--graph-cat-3)'] },
      },
    })

  const graph = mountGraph(container, {
    definition: define(),
    ariaLabel: messages.graphLabel(stations.length, pipes.length),
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
    button(messages.reverse, () => {
      direction = -direction
      redraw()
    }),
    button(messages.factor(factor), (element) => {
      factor = factors[(factors.indexOf(factor) + 1) % factors.length] ?? 1
      element.textContent = messages.factor(factor)
      redraw()
    }),
    button(messages.pause, (element) => {
      running = !running
      element.textContent = running ? messages.pause : messages.resume
      redraw()
    }),
  )
  container.append(actions)

  return graph
}
