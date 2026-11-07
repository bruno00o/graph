import {
  defineGraph,
  type EdgeMergeOptions,
  edges,
  type GraphInstance,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { messages } from './messages'
import '../shared/overlays.css'

interface Spot {
  readonly id: string
  readonly label: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly kind: string
}

type Mode = keyof typeof messages.modes

const modes = Object.keys(messages.modes) as Mode[]
const kinds = ['A', 'B', 'C']
const minimums = [2, 3, 1]

let seed = 21
function random(): number {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

const spots: Spot[] = Array.from({ length: 6 }, (_, at) => {
  const angle = (at / 6) * Math.PI * 2 - Math.PI / 2
  return {
    id: `s${at}`,
    label: messages.node(at + 1),
    x: Math.cos(angle) * 220,
    y: Math.sin(angle) * 220,
  }
})
const links: Link[] = []
for (let at = 0; at < spots.length; at++) {
  for (const step of at % 2 === 0 ? [1, 2] : [1]) {
    const from = `s${at}`
    const to = `s${(at + step) % spots.length}`
    for (const kind of kinds) {
      const count = Math.floor(random() * 4)
      for (let k = 0; k < count; k++) {
        const [source, target] = random() < 0.7 ? [from, to] : [to, from]
        links.push({ id: `e${links.length}`, from: source, to: target, kind })
      }
    }
  }
}

const labels = new Map(spots.map((spot) => [spot.id, spot.label]))

export function mount(container: HTMLElement): GraphInstance {
  let mode: Mode = 'kind'
  let min = minimums[0] ?? 2
  const merge = (): EdgeMergeOptions<Link> | false =>
    mode === 'off' ? false : { directed: false, min, ...(mode === 'kind' ? { by: 'kind' } : {}) }

  const define = () =>
    defineGraph({
      marks: [
        edges<Link>(links, {
          source: 'from',
          target: 'to',
          color: 'kind',
          merge: merge(),
          aggregate: {
            color: (aggregate) => aggregate.value,
            width: (aggregate) => aggregate.count,
            label: { text: (aggregate) => String(aggregate.count), background: true },
          },
        }),
        nodes<Spot>(spots, { x: 'x', y: 'y', size: 30, label: 'label' }),
      ],
      scales: {
        color: { domain: kinds },
        width: (value) => 1.5 + (value - 1) * 1.5,
      },
    })

  const graph = mountGraph(container, {
    definition: define(),
    ariaLabel: messages.graphLabel(spots.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)
  graph.on('pointerenter', ({ target }) => {
    if (target.kind !== 'edge') return
    const merged = target.aggregate
    const from = labels.get(target.datum.from) ?? ''
    const to = labels.get(target.datum.to) ?? ''
    status.textContent = merged
      ? messages.merged(
          merged.count,
          merged.value === undefined ? null : String(merged.value),
          from,
          to,
        )
      : messages.single(target.datum.kind, from, to)
  })
  graph.on('pointerleave', () => {
    status.textContent = ''
  })

  const button = (text: () => string, onClick: () => void) => {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'example-button'
    element.textContent = text()
    element.addEventListener('click', () => {
      onClick()
      element.textContent = text()
      graph.update({ definition: define() })
    })
    return element
  }
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(
      () => messages.mode(messages.modes[mode]),
      () => {
        mode = modes[(modes.indexOf(mode) + 1) % modes.length] ?? 'kind'
      },
    ),
    button(
      () => messages.min(min),
      () => {
        min = minimums[(minimums.indexOf(min) + 1) % minimums.length] ?? 2
      },
    ),
  )
  container.append(actions)

  return graph
}
