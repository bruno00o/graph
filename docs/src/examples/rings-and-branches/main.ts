import {
  createPathFinder,
  defineGraph,
  edges,
  type GraphInstance,
  type GraphPath,
  type Key,
  mountGraph,
  nodes,
  raw,
} from '@bruno00o/graph'
import { chains } from '@bruno00o/graph/layouts/chains'
import { pair, ways } from '@bruno00o/graph/ways'
import { messages } from './messages'
import { createChains, type Link, type Spot } from './sample'
import '../shared/overlays.css'

const { spots, links } = createChains()
const byId = new Map(spots.map((spot) => [spot.id, spot]))
const exits = (spot: Spot) => spot.base

const finder = createPathFinder({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to' }),
    nodes<Spot>(spots, { label: 'id' }),
  ],
})
const found = ways(finder, { exits })
const twoWays = new Set(found.two.map(String))
const joins = new Map(found.one.map((one) => [String(one.key), String(one.through)]))
const sharedEdges = new Set(found.chains.flatMap((chain) => chain.edges.map(String)))

const linkMark = edges<Link>(links, {
  name: 'links',
  source: 'from',
  target: 'to',
  dash: (link) => (sharedEdges.has(link.id) ? 'solid' : 'dashed'),
})
const nodeMark = nodes<Spot>(spots, {
  size: raw((spot) => (spot.base ? 22 : 16)),
  fill: (spot) => colors[kindOf(spot)],
  stroke: (spot) => (spot.base ? colors.base : 'var(--graph-cat-9)'),
  strokeWidth: 1.5,
  label: 'label',
})

const linked = new Set(
  links.flatMap((link) => [`${link.from}|${link.to}`, `${link.to}|${link.from}`]),
)
const closures: Link[] = found.chains
  .filter(
    (chain) => chain.ends[0] !== chain.ends[1] && !linked.has(`${chain.ends[0]}|${chain.ends[1]}`),
  )
  .map((chain) => ({
    id: `${String(chain.ends[0])}~${String(chain.ends[1])}`,
    from: String(chain.ends[0]),
    to: String(chain.ends[1]),
  }))

const colors = {
  base: 'var(--graph-cat-6)',
  two: 'var(--graph-cat-9)',
  one: 'color-mix(in srgb, var(--graph-cat-9) 35%, var(--graph-paper))',
} as const
const kindOf = (spot: Spot): keyof typeof colors =>
  spot.base ? 'base' : twoWays.has(spot.id) ? 'two' : 'one'

const way = (color: string) => ({
  nodes: { outline: color, outlineWidth: 3 },
  edges: { stroke: color, strokeWidth: 3 },
})

const definition = defineGraph({
  marks: [
    edges<Link>(closures, {
      name: 'closures',
      source: 'from',
      target: 'to',
      dash: 'dotted',
      stroke: 'var(--graph-cat-6)',
    }),
    linkMark,
    nodeMark,
  ],
  states: {
    route: { raise: true, label: 'always', others: { opacity: 0.2, label: false } },
    first: way('var(--graph-cat-1)'),
    second: way('var(--graph-cat-7)'),
    single: way('var(--graph-cat-2)'),
  },
  layout: chains<Spot>({ exits }),
  view: { padding: { top: 64, right: 32, bottom: 64, left: 32 } },
})

const labelOf = (key: Key) => byId.get(String(key))?.label ?? String(key)
const steps = (path: GraphPath) => path.nodes.length - 1
const ends = (path: GraphPath) => labelOf(path.nodes[path.nodes.length - 1] as Key)

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(spots.length, found.chains.length),
  })

  const legend = document.createElement('div')
  legend.className = 'example-legend'
  for (const kind of ['base', 'two', 'one'] as const) {
    const swatch = document.createElement('i')
    swatch.style.background = colors[kind]
    swatch.style.boxShadow = `inset 0 0 0 1.5px ${kind === 'base' ? colors.base : 'var(--graph-cat-9)'}`
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
    borderTop: '2px dotted var(--graph-cat-6)',
  })
  const dotted = document.createElement('span')
  dotted.append(line, messages.legend.closure)
  legend.append(dotted)
  container.append(legend)

  const two = found.two.length
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
    const mark = (name: 'first' | 'second' | 'single', path: GraphPath) => {
      graph.states.set(name, { nodes: path.nodes, edges: path.edges })
      routeNodes.push(...path.nodes.map(String))
      routeEdges.push(...path.edges.map(String))
    }
    const twoWaysOut = pair(finder, key, { exits })
    const join = joins.get(key)
    if (twoWaysOut) {
      const [first, second] = twoWaysOut
      mark('first', first)
      mark('second', second)
      status.textContent = messages.two(
        spot.label,
        { base: ends(first), steps: steps(first) },
        { base: ends(second), steps: steps(second) },
      )
    } else if (join) {
      const single = graph.paths.shortest(key, join)
      if (single) mark('single', single)
      const after = pair(finder, join, { exits })
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
