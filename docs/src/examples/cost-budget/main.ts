import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { createMesh, type Link, type Spot } from './mesh'
import { messages } from './messages'
import '../shared/overlays.css'
import '../shared/controls.css'

const { spots, links } = createMesh(32, 20, 7)
const nodeKeys = spots.map((spot) => spot.id)
const edgeKeys = links.map((link) => link.id)
const lines = edges<Link>(links, { source: 'from', target: 'to', width: 'cost' })

export function mount(container: HTMLElement): GraphInstance {
  let costs = new Map<Key, number>()

  const define = (budget: number) =>
    defineGraph({
      marks: [
        lines,
        nodes<Spot>(spots, {
          x: 'x',
          y: 'y',
          label: 'label',
          size: () => 16,
          color: (spot) => costs.get(spot.id),
        }),
      ],
      scales: {
        color: {
          type: 'sequential',
          domain: [0, budget],
          range: ['var(--graph-accent)', 'var(--graph-cat-1)'],
        },
        width: { range: [0.6, 3] },
      },
      states: { muted: { opacity: 0.25, label: false } },
      interaction: { select: 'single' },
    })

  const text = document.createElement('span')
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '40'
  slider.max = '800'
  slider.step = '20'
  slider.value = '320'

  const graph = mountGraph(container, {
    definition: define(Number(slider.value)),
    ariaLabel: messages.graphLabel(spots.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  const control = document.createElement('label')
  control.className = 'example-button example-range'
  control.append(text, slider)
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(control)
  container.append(actions, status)

  function trace(): void {
    const budget = Number(slider.value)
    text.textContent = messages.budget(budget)
    const [start] = graph.selection.get().nodes
    if (start === undefined) {
      costs = new Map()
      graph.states.clear('muted')
      status.textContent = messages.hint
    } else {
      const near = graph.paths.reach(start, { weight: 'cost', maxCost: budget })
      costs = new Map(near.nodes.map((key, index) => [key, near.costs[index] ?? 0]))
      const keepEdges = new Set(near.edges)
      graph.states.set('muted', {
        nodes: nodeKeys.filter((key) => !costs.has(key)),
        edges: edgeKeys.filter((key) => !keepEdges.has(key)),
      })
      status.textContent = messages.reached(near.nodes.length - 1)
    }
    graph.update({ definition: define(budget) })
  }

  slider.addEventListener('input', trace)
  graph.on('selectionchange', trace)

  const middle = spots[Math.floor(spots.length / 2) + 16]
  if (middle) graph.selection.set({ nodes: [middle.id] })

  return graph
}
