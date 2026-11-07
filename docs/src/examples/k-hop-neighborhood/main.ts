import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createCommunities, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './range.css'

const { items, links } = createCommunities(300, 460, 47)
const nodeKeys = items.map((item) => item.id)
const edgeKeys = links.map((link) => link.id)
const rings = ['hop1', 'hop2', 'hop3', 'hop4'] as const

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Item>(items, { size: 'weight', label: 'label', units: 'screen' }),
  ],
  scales: { size: { range: [6, 26] } },
  states: {
    hop1: { fill: 'var(--graph-cat-1)', label: true, raise: true },
    hop2: { fill: 'var(--graph-cat-2)', raise: true },
    hop3: { fill: 'var(--graph-cat-3)' },
    hop4: { fill: 'var(--graph-cat-4)' },
    muted: { opacity: 0.12, label: false },
  },
  interaction: { select: 'single' },
  layout: force(),
})

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  const text = document.createElement('span')
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '1'
  slider.max = String(rings.length)
  slider.value = '2'
  const control = document.createElement('label')
  control.className = 'example-button example-range'
  control.append(text, slider)
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(control)
  container.append(actions, status)

  function trace(): void {
    const hops = Number(slider.value)
    text.textContent = messages.hops(hops)
    const [start] = graph.selection.get().nodes
    if (start === undefined) {
      graph.states.clear()
      status.textContent = messages.hint
      return
    }
    const near = graph.paths.reach(start, { maxCost: hops })
    const byHop = rings.map((): Key[] => [])
    for (const [index, key] of near.nodes.entries()) {
      byHop[(near.costs[index] ?? 0) - 1]?.push(key)
    }
    for (const [index, ring] of rings.entries()) {
      graph.states.set(ring, { nodes: byHop[index] ?? [] })
    }
    const keepNodes = new Set(near.nodes)
    const keepEdges = new Set(near.edges)
    graph.states.set('muted', {
      nodes: nodeKeys.filter((key) => !keepNodes.has(key)),
      edges: edgeKeys.filter((key) => !keepEdges.has(key)),
    })
    status.textContent = messages.reached(byHop.slice(0, hops).map((ring) => ring.length))
  }

  slider.addEventListener('input', trace)
  graph.on('selectionchange', trace)

  const hub = items.reduce((best, item) => (item.weight > best.weight ? item : best))
  graph.selection.set({ nodes: [hub.id] })

  return graph
}
