import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { messages } from './messages'
import '../shared/overlays.css'

interface Cell {
  readonly id: string
  readonly diagonal: number
}

interface Side {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly diagonal: number
}

type Mode = keyof typeof messages.mode

const width = 48
const cells: Cell[] = []
const sides: Side[] = []
for (let row = 0; row < width; row++) {
  for (let column = 0; column < width; column++) {
    const id = `${row}:${column}`
    const diagonal = row + column
    cells.push({ id, diagonal })
    if (column + 1 < width) {
      sides.push({ id: `${id}>`, from: id, to: `${row}:${column + 1}`, diagonal })
    }
    if (row + 1 < width) {
      sides.push({ id: `${id}v`, from: id, to: `${row + 1}:${column}`, diagonal })
    }
  }
}

const layouts = { levels: force(), single: force({ multilevel: false }) }

const define = (mode: Mode) =>
  defineGraph({
    marks: [
      edges<Side>(sides, { source: 'from', target: 'to', color: 'diagonal', width: 2 }),
      nodes<Cell>(cells, { color: 'diagonal', size: 14 }),
    ],
    scales: {
      color: {
        type: 'sequential',
        range: ['var(--graph-cat-6)', 'var(--graph-cat-2)', 'var(--graph-cat-4)'],
      },
    },
    layout: layouts[mode],
    view: { autoFit: 'layouts' },
  })

export function mount(container: HTMLElement): GraphInstance {
  let mode: Mode = 'levels'
  const graph = mountGraph(container, {
    definition: define(mode),
    ariaLabel: messages.graphLabel(cells.length, sides.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  let started = performance.now()
  graph.on('layoutstart', () => {
    started = performance.now()
  })
  graph.store.subscribe(() => {
    const { running, progress } = graph.store.get().layout
    if (running) status.textContent = messages.progress(progress)
  })
  graph.on('layoutend', ({ completed }) => {
    status.textContent = completed
      ? messages.done((performance.now() - started) / 1000)
      : messages.stopped
  })

  const other = (): Mode => (mode === 'levels' ? 'single' : 'levels')
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
