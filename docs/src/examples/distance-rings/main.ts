import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { radial } from '@bruno00o/graph/layouts'
import { messages } from './messages'
import { createNetwork, type Place, type Tie } from './network'
import '../shared/overlays.css'
import './rings.css'

const namespace = 'http://www.w3.org/2000/svg'
const margin = 36

function shape(tag: string, attributes: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(namespace, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value))
  return element
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

  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Tie>(links, { source: 'from', target: 'to', opacity: 0.6 }),
        nodes<Place>(items, { color: 'group', size: 18, label: { text: 'label', size: 12 } }),
      ],
      layout: radial({ root }),
    }),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })
  graph.selection.set({ nodes: [root] })

  const status = document.createElement('output')
  status.className = 'example-status'
  status.textContent = messages.root(labels.get(root) ?? String(root))
  container.append(status)

  const layer = document.createElement('div')
  layer.className = 'distance-rings'
  const rings = shape('svg', {})
  layer.append(rings)
  graph.anchors.set(layer, { node: root, scale: true })

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

  function draw(): void {
    const radii = distances()
    const outer = (radii.at(-1) ?? 0) + margin
    rings.replaceChildren(
      ...radii.flatMap((radius, at) => {
        const label = shape('text', { x: 0, y: -radius - 8 })
        label.textContent = messages.hops(at + 1)
        return [shape('circle', { cx: 0, cy: 0, r: radius }), label]
      }),
    )
    rings.setAttribute('width', String(2 * outer))
    rings.setAttribute('height', String(2 * outer))
    rings.setAttribute('viewBox', `${-outer} ${-outer} ${2 * outer} ${2 * outer}`)
    layer.style.opacity = '1'
  }

  graph.on('layoutend', ({ completed }) => {
    if (completed) draw()
  })

  graph.on('selectionchange', ({ selection }) => {
    const key = selection.nodes[0]
    if (key === undefined || key === root) return
    root = key
    status.textContent = messages.root(labels.get(key) ?? String(key))
    layer.style.opacity = '0'
    graph.anchors.set(layer, { node: root, scale: true })
    void graph.layout.run(radial({ root }), { fit: true, duration: 600 })
  })

  return graph
}
