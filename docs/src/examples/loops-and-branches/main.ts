import { defineGraph, edges, type GraphInstance, mountGraph, nodes, raw } from '@bruno00o/graph'
import { placed } from '@bruno00o/graph/layouts'
import { messages } from './messages'
import { petals } from './petals'
import { createLoops, type Link, type Spot } from './sample'
import { findWays, type Way } from './ways'
import '../shared/overlays.css'

const { spots, links } = createLoops(11)
const ways = findWays(spots, links)
const byId = new Map(spots.map((spot) => [spot.id, spot]))

const colors = {
  base: 'var(--graph-ink)',
  two: 'var(--graph-cat-3)',
  one: 'var(--graph-cat-9)',
} as const
const kindOf = (spot: Spot): keyof typeof colors =>
  spot.base ? 'base' : ways.twoWays.has(spot.id) ? 'two' : 'one'

const way = (color: string) => ({
  nodes: { outline: color, outlineWidth: 3 },
  edges: { stroke: color, strokeWidth: 3 },
})

const definition = defineGraph({
  marks: [
    edges<Link>(links, {
      source: 'from',
      target: 'to',
      dash: (link) => (ways.sharedEdges.has(link.id) ? 'solid' : 'dashed'),
    }),
    nodes<Spot>(spots, {
      shape: (spot) => (spot.base ? 'square' : 'circle'),
      size: raw((spot) => (spot.base ? 26 : 14)),
      fill: (spot) => colors[kindOf(spot)],
      label: 'label',
    }),
  ],
  states: {
    route: { raise: true, label: 'always', others: { opacity: 0.2, label: false } },
    first: way('var(--graph-cat-1)'),
    second: way('var(--graph-cat-7)'),
    single: way('var(--graph-cat-9)'),
  },
  layout: placed(petals(spots, links)),
  view: { padding: { top: 64, right: 32, bottom: 64, left: 32 } },
})

const labelOf = (key: string) => byId.get(key)?.label ?? key
const steps = (path: Way) => path.nodes.length - 1
const ends = (path: Way) => labelOf(path.nodes[path.nodes.length - 1] as string)

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(spots.length),
  })

  const legend = document.createElement('div')
  legend.className = 'example-legend'
  for (const kind of ['base', 'two', 'one'] as const) {
    const swatch = document.createElement('i')
    swatch.style.background = colors[kind]
    if (kind === 'base') swatch.style.borderRadius = '2px'
    const item = document.createElement('span')
    item.append(swatch, messages.legend[kind])
    legend.append(item)
  }
  const line = document.createElement('i')
  Object.assign(line.style, {
    width: '18px',
    height: '0',
    borderRadius: '0',
    background: 'none',
    borderTop: '2px dashed var(--graph-edge)',
  })
  const dashed = document.createElement('span')
  dashed.append(line, messages.legend.dashed)
  legend.append(dashed)
  container.append(legend)

  const two = ways.twoWays.size
  const summary = messages.summary(two, spots.filter((spot) => !spot.base).length - two)
  const status = document.createElement('output')
  status.className = 'example-status example-status-top'
  status.textContent = summary
  container.append(status)

  const show = (key: string) => {
    graph.states.clear()
    const spot = byId.get(key)
    if (!spot) return
    if (spot.base) {
      status.textContent = messages.base(spot.label)
      return
    }
    const routeNodes: string[] = []
    const routeEdges: string[] = []
    const mark = (name: 'first' | 'second' | 'single', path: Way) => {
      graph.states.set(name, { nodes: path.nodes, edges: path.edges })
      routeNodes.push(...path.nodes)
      routeEdges.push(...path.edges)
    }
    const pair = ways.pair(key)
    const join = ways.joins.get(key)
    if (pair) {
      const [first, second] = pair
      mark('first', first)
      mark('second', second)
      status.textContent = messages.two(
        spot.label,
        { base: ends(first), steps: steps(first) },
        { base: ends(second), steps: steps(second) },
      )
    } else if (join) {
      const single = graph.paths.shortest(key, join)
      if (single) {
        mark('single', {
          nodes: single.nodes.map(String),
          edges: single.edges.map(String),
        })
      }
      const after = ways.pair(join)
      if (after) {
        mark('first', after[0])
        mark('second', after[1])
      }
      status.textContent = byId.get(join)?.base
        ? messages.oneBase(spot.label, labelOf(join))
        : messages.one(spot.label, labelOf(join))
    } else {
      status.textContent = messages.none(spot.label)
    }
    graph.states.set('route', { nodes: routeNodes, edges: routeEdges })
  }

  graph.on('click', ({ target }) => {
    if (target?.kind === 'node') {
      show(String(target.key))
      return
    }
    graph.states.clear()
    status.textContent = summary
  })

  return graph
}
