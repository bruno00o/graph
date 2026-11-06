import { defineGraph, edges, mountGraph, nodes, type WheelMode } from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { button, choice, createPage, status, themeToggle } from '../shared/page'

type BoundsMode = keyof typeof messages.boundsModes

const sizes = [1_000, 10_000, 50_000]
const params = new URLSearchParams(location.search)
const nodeCount = Number(params.get('nodes') ?? 1_000)
const edgeCount = Number(params.get('edges') ?? nodeCount * 2)
const { items, links } = createSample(nodeCount, edgeCount)
const wheelModes = Object.keys(messages.wheelModes) as WheelMode[]
const boundsModes = Object.keys(messages.boundsModes) as BoundsMode[]
let wheel = wheelModes.find((mode) => mode === params.get('wheel')) ?? 'zoom'
let bounds = boundsModes.find((mode) => mode === params.get('bounds')) ?? 'none'

const define = () =>
  defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
      nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
    ],
    states: {
      muted: { opacity: 0.15, label: false },
    },
    interaction: { lasso: true, wheel },
    view: { bounds: bounds === 'nodes' ? { margin: 80 } : null },
  })

const { header, main } = createPage(messages.vanilla)
const graph = mountGraph(main, {
  definition: define(),
  ariaLabel: messages.graphLabel(formatNumber(items.length), formatNumber(links.length)),
})

const zoomHint = document.createElement('div')
zoomHint.className = 'zoom-hint'
zoomHint.hidden = true
main.append(zoomHint)
let hintTimer: ReturnType<typeof setTimeout> | undefined
graph.on('zoomhint', ({ key }) => {
  zoomHint.textContent = messages.zoomHint(key)
  zoomHint.hidden = false
  clearTimeout(hintTimer)
  hintTimer = setTimeout(() => {
    zoomHint.hidden = true
  }, 1500)
})

const selectionStatus = status()
const showSelection = () => {
  const { nodes: selectedNodes, edges: selectedEdges } = graph.selection.get()
  selectionStatus.textContent = messages.selection(selectedNodes.length, selectedEdges.length)
}
showSelection()

graph.on('selectionchange', ({ nodes: selected }) => {
  showSelection()
  if (selected.length === 0) {
    graph.states.clear('muted')
    return
  }
  const keepNodes = new Set<string | number>(selected)
  const keepEdges = new Set<string | number>()
  for (const key of selected) {
    for (const neighbor of graph.neighbors(key)) keepNodes.add(neighbor)
    for (const edge of graph.edgesOf(key)) keepEdges.add(edge)
  }
  graph.states.set('muted', {
    nodes: items.filter((item) => !keepNodes.has(item.id)).map((item) => item.id),
    edges: links.filter((link) => !keepEdges.has(link.id)).map((link) => link.id),
  })
})

const hint = document.createElement('span')
hint.className = 'hint'
hint.textContent = messages.vanillaHint

header.append(
  hint,
  selectionStatus,
  choice(
    messages.size,
    [...new Set([...sizes, nodeCount])].map((size) => ({
      value: String(size),
      text: formatNumber(size),
    })),
    String(nodeCount),
    (value) => {
      location.search = `?nodes=${value}&edges=${Number(value) * 2}`
    },
  ),
  choice(
    messages.wheel,
    wheelModes.map((mode) => ({ value: mode, text: messages.wheelModes[mode] })),
    wheel,
    (value) => {
      wheel = wheelModes.find((mode) => mode === value) ?? 'zoom'
      zoomHint.hidden = true
      graph.update({ definition: define() })
    },
  ),
  choice(
    messages.bounds,
    boundsModes.map((mode) => ({ value: mode, text: messages.boundsModes[mode] })),
    bounds,
    (value) => {
      bounds = boundsModes.find((mode) => mode === value) ?? 'none'
      graph.update({ definition: define() })
    },
  ),
  button(messages.fit, () => graph.view.fit(undefined, { duration: 400 })),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph })
