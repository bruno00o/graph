import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
  type Point,
} from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './snap.css'

const spacings = [40, 60]
const { items, links } = createSample(32, 40, 4, 11, 0.05)

class Cells {
  readonly #taken = new Map<string, Key>()
  constructor(readonly spacing: number) {}

  #id(i: number, j: number): string {
    return `${i},${j}`
  }

  free(key: Key): void {
    for (const [cell, owner] of this.#taken) if (owner === key) this.#taken.delete(cell)
  }

  nearest(point: Point, key?: Key): Point {
    const i0 = Math.round(point.x / this.spacing)
    const j0 = Math.round(point.y / this.spacing)
    for (let ring = 0; ring < 64; ring += 1) {
      let best: Point | null = null
      let distance = Infinity
      for (let i = i0 - ring; i <= i0 + ring; i += 1) {
        for (let j = j0 - ring; j <= j0 + ring; j += 1) {
          if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== ring) continue
          const owner = this.#taken.get(this.#id(i, j))
          if (owner !== undefined && owner !== key) continue
          const cell = { x: i * this.spacing, y: j * this.spacing }
          const d = Math.hypot(cell.x - point.x, cell.y - point.y)
          if (d < distance) [best, distance] = [cell, d]
        }
      }
      if (best) return best
    }
    return point
  }

  take(key: Key, point: Point): Point {
    const cell = this.nearest(point, key)
    this.#taken.set(this.#id(cell.x / this.spacing, cell.y / this.spacing), key)
    return cell
  }
}

const startCells = new Cells(spacings[0] ?? 40)
const spots = items.map((item) => ({
  ...item,
  ...startCells.take(item.id, { x: item.x * 1.6, y: item.y * 1.6 }),
}))
const marks = [
  edges<Link>(links, { source: 'from', target: 'to' }),
  nodes<Item>(spots, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
]
const define = (spacing: number) =>
  defineGraph({
    marks,
    scales: { size: { range: [12, 24] } },
    background: { grid: 'lines', spacing, adaptive: false },
  })

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  let cells = startCells
  container.classList.add('snap-stage')
  const graph = mountGraph(container, {
    definition: define(cells.spacing),
    ariaLabel: messages.graphLabel,
  })
  const ghost = document.createElement('div')
  ghost.className = 'snap-ghost'

  const place = (keys: readonly Key[], duration: number) => {
    for (const key of keys) cells.free(key)
    const moves = keys.flatMap((key) => {
      const point = graph.positions.get(key)
      return point ? [[key, cells.take(key, point)] as const] : []
    })
    graph.positions.set(moves, { duration })
  }

  graph.on('drag', ({ target }) => {
    const point = graph.positions.get(target.key)
    if (!point) return
    const size = cells.spacing * 0.7
    ghost.style.width = ghost.style.height = `${size}px`
    graph.anchors.set(ghost, { point: cells.nearest(point, target.key), scale: true })
  })
  graph.on('dragend', ({ keys }) => {
    graph.anchors.remove(ghost)
    place(keys, 160)
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.spacing(cells.spacing), (element) => {
      const spacing = spacings[(spacings.indexOf(cells.spacing) + 1) % spacings.length] ?? 40
      cells = new Cells(spacing)
      element.textContent = messages.spacing(spacing)
      graph.update({ definition: define(spacing) })
      place(
        spots.map((spot) => spot.id),
        400,
      )
    }),
  )
  container.append(actions)

  return graph
}
