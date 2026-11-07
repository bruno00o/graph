import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { messages } from './messages'
import { createScatter, type Link, type Spot } from './scatter'
import '../shared/overlays.css'
import './stops.css'

const { spots, links } = createScatter(260, 4, 19)
const nodeKeys = spots.map((spot) => spot.id)
const edgeKeys = links.map((link) => link.id)

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Spot>(spots, { x: 'x', y: 'y', label: 'label', size: () => 14 }),
  ],
  states: {
    route: { stroke: 'var(--graph-accent)', strokeWidth: 3, flow: true, raise: true },
    muted: { opacity: 0.3, label: false },
  },
})

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(spots.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)

  let markers: (() => void)[] = []

  function trace(): void {
    for (const remove of markers) remove()
    graph.states.clear()
    const stops = graph.selection.get().nodes
    markers = stops.map((key, index) => {
      const marker = document.createElement('span')
      marker.className = 'example-stop'
      marker.textContent = messages.stop(index + 1)
      return graph.anchors.set(marker, { node: key, side: 'top' })
    })
    if (stops.length < 2) {
      status.textContent = messages.hint
      return
    }
    const onRoute = new Set<Key>()
    const onRouteEdges = new Set<Key>()
    let length = 0
    for (let index = 1; index < stops.length; index++) {
      const from = stops[index - 1]
      const to = stops[index]
      const leg =
        from !== undefined && to !== undefined
          ? graph.paths.shortest(from, to, { weight: 'length' })
          : null
      if (!leg) {
        status.textContent = messages.broken(index, index + 1)
        return
      }
      for (const key of leg.nodes) onRoute.add(key)
      for (const key of leg.edges) onRouteEdges.add(key)
      length += leg.cost
    }
    graph.states.set('route', { nodes: onRoute, edges: onRouteEdges })
    graph.states.set('muted', {
      nodes: nodeKeys.filter((key) => !onRoute.has(key)),
      edges: edgeKeys.filter((key) => !onRouteEdges.has(key)),
    })
    status.textContent = messages.route(stops.length - 1, length)
  }

  graph.on('selectionchange', trace)
  graph.selection.set({ nodes: ['s190', 's33', 's64', 's112'] })

  return graph
}
