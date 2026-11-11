import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
  type ShapeGeometry,
  type ShapeOptions,
} from '@bruno00o/graph'
import { radial } from '@bruno00o/graph/layouts'
import { shapes } from '@bruno00o/graph/shapes'
import { messages } from './messages'
import { createNetwork, type Place, type Tie } from './network'
import '../shared/overlays.css'

interface Band {
  readonly id: string
  readonly root: Key
  readonly hops: number
  readonly geometry: ShapeGeometry
}

const margin = 36

const bandOptions: ShapeOptions<Band> = {
  node: 'root',
  fill: (band) =>
    band.hops % 2 === 1
      ? 'color-mix(in srgb, var(--graph-ink) 7%, transparent)'
      : 'color-mix(in srgb, var(--graph-ink) 3%, transparent)',
  stroke: null,
  pick: false,
  label: { text: (band) => messages.hops(band.hops), color: 'var(--graph-ink-muted)', size: 14 },
}

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createNetwork()
  const labels = new Map<Key, string>(items.map((item) => [item.id, item.label]))
  const degrees = new Map<Key, number>()
  for (const link of links) {
    degrees.set(link.from, (degrees.get(link.from) ?? 0) + 1)
    degrees.set(link.to, (degrees.get(link.to) ?? 0) + 1)
  }
  let root: Key = items.reduce((best, item) =>
    (degrees.get(item.id) ?? 0) > (degrees.get(best.id) ?? 0) ? item : best,
  ).id

  const tieMark = edges<Tie>(links, { source: 'from', target: 'to', opacity: 0.6 })
  const placeMark = nodes<Place>(items, {
    color: 'group',
    size: 18,
    label: { text: 'label', size: 12 },
  })
  const layout = radial({ root })
  const definitionOf = (bands: readonly Band[]) =>
    defineGraph({
      marks: [shapes(bands, bandOptions), tieMark, placeMark],
      layout,
    })

  const graph = mountGraph(container, {
    definition: definitionOf([]),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })
  graph.selection.set({ nodes: [root] })

  const status = document.createElement('output')
  status.className = 'example-status'
  status.textContent = messages.root(labels.get(root) ?? String(root))
  container.append(status)

  function distances(): number[] {
    const center = graph.positions.get(root)
    const reached = graph.paths.reach(root)
    const sums: number[] = []
    const counts: number[] = []
    reached.nodes.forEach((key, at) => {
      const hops = reached.costs[at] ?? 0
      const place = graph.positions.get(key)
      if (hops === 0 || !center || !place) return
      sums[hops - 1] = (sums[hops - 1] ?? 0) + Math.hypot(place.x - center.x, place.y - center.y)
      counts[hops - 1] = (counts[hops - 1] ?? 0) + 1
    })
    return sums.map((sum, at) => sum / (counts[at] ?? 1))
  }

  function bandsAround(center: Key): Band[] {
    const radii = distances()
    return radii.map((radius, at) => {
      const before = radii[at - 1]
      const after = radii[at + 1]
      const inner = before === undefined ? radius / 2 : (before + radius) / 2
      const outer = after === undefined ? radius + margin : (radius + after) / 2
      return {
        id: `ring-${at + 1}`,
        root: center,
        hops: at + 1,
        geometry: { center: { x: 0, y: 0 }, radius: outer, inner },
      }
    })
  }

  graph.on('layoutend', ({ completed }) => {
    if (completed) graph.update({ definition: definitionOf(bandsAround(root)) })
  })

  graph.on('selectionchange', ({ selection }) => {
    const key = selection.nodes[0]
    if (key === undefined || key === root) return
    root = key
    status.textContent = messages.root(labels.get(key) ?? String(key))
    graph.update({ definition: definitionOf([]) })
    void graph.layout.run(radial({ root }), { fit: true, duration: 600 })
  })

  return graph
}
