import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { messages } from './messages'
import '../shared/overlays.css'

interface Spot {
  readonly id: string
  readonly label: string
  readonly cluster: string
  readonly longitude: number
  readonly latitude: number
}

interface Arc {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly far: boolean
}

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

const centers: ReadonlyArray<readonly [number, number]> = [
  [-145, 48],
  [-62, -22],
  [8, 52],
  [38, -12],
  [118, 34],
  [158, -38],
]

const next = random(12)
const spots: Spot[] = centers.flatMap(([longitude, latitude], cluster) =>
  Array.from({ length: 6 }, (_, index) => ({
    id: `s${cluster}-${index}`,
    label: messages.node(cluster * 6 + index + 1),
    cluster: String.fromCharCode(65 + cluster),
    longitude: longitude + (next() - 0.5) * 24,
    latitude: latitude + (next() - 0.5) * 16,
  })),
)

const arcs: Arc[] = []
centers.forEach((_, cluster) => {
  for (let index = 1; index < 6; index++) {
    const from = `s${cluster}-${Math.floor(next() * index)}`
    arcs.push({ id: `n${arcs.length}`, from, to: `s${cluster}-${index}`, far: false })
  }
  for (let link = 0; link < 3; link++) {
    const other = (cluster + 1 + Math.floor(next() * (centers.length - 1))) % centers.length
    const from = `s${cluster}-${Math.floor(next() * 6)}`
    arcs.push({ id: `f${arcs.length}`, from, to: `s${other}-${Math.floor(next() * 6)}`, far: true })
  }
})

const define = (geodesic: boolean) =>
  defineGraph({
    marks: [
      edges<Arc>(arcs, {
        source: 'from',
        target: 'to',
        stroke: (arc) => (arc.far ? 'var(--graph-accent)' : 'var(--graph-edge)'),
        width: (arc) => (arc.far ? 2 : 1.5),
        arrow: (arc) => (arc.far ? 'target' : 'none'),
        geodesic: (arc) => geodesic && arc.far,
      }),
      nodes<Spot>(spots, {
        longitude: 'longitude',
        latitude: 'latitude',
        color: 'cluster',
        size: () => 10,
        units: 'screen',
        label: 'label',
      }),
    ],
    scales: { size: (value) => value, width: (value) => value },
  })

export function mount(container: HTMLElement): GraphInstance {
  let geodesic = true
  const graph = mountGraph(container, {
    definition: define(geodesic),
    ariaLabel: messages.graphLabel(spots.length, arcs.length),
  })

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-button'
  button.textContent = messages.farEdges(geodesic)
  button.addEventListener('click', () => {
    geodesic = !geodesic
    button.textContent = messages.farEdges(geodesic)
    graph.update({ definition: define(geodesic) })
  })
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions)

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)
  graph.on('pointerenter', ({ target }) => {
    status.textContent =
      target.kind === 'node'
        ? messages.place(target.datum.label, target.datum.longitude, target.datum.latitude)
        : ''
  })
  graph.on('pointerleave', () => {
    status.textContent = ''
  })

  return graph
}
