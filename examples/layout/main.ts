import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { type ForceEngine, force } from '@bruno00o/graph/layouts/force'
import { createMinimap } from '@bruno00o/graph/minimap'
import { createCommunities, type Item, type Link, nestCommunities } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { button, choice, createPage, status, themeToggle } from '../shared/page'

const sizes = [500, 2_000, 10_000, 50_000, 80_000, 200_000, 500_000]
const params = new URLSearchParams(location.search)
const nodeCount = Number(params.get('nodes') ?? 2_000)
const sample = createCommunities(
  nodeCount,
  Number(params.get('edges') ?? Math.round(nodeCount * 1.66)),
)
const grouped = params.get('groups') === 'nested'
let items: Item[] = grouped ? nestCommunities(sample, 24, 3) : sample.items
let links: Link[] = sample.links
const engines: readonly ForceEngine[] = ['auto', 'gpu', 'cpu']
const engine = engines.find((value) => value === params.get('engine')) ?? 'auto'
const layout = force({ engine })

const define = () =>
  defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(items, {
        color: 'group',
        size: 'weight',
        label: 'label',
        parent: 'parent',
        container: { padding: 16 },
      }),
    ],
    scales: { size: { range: [6, 30] } },
    layout,
  })

const { header, main } = createPage(messages.layout)
const graph = mountGraph(main, {
  definition: define(),
  ariaLabel: messages.graphLabel(formatNumber(items.length), formatNumber(links.length)),
})

const withMinimap = params.get('minimap') !== 'off'
if (withMinimap) createMinimap(graph)

const progress = status()
let started = performance.now()
graph.on('layoutstart', () => {
  started = performance.now()
})
graph.store.subscribe(() => {
  const { running, progress: value } = graph.store.get().layout
  if (running) progress.textContent = messages.layoutProgress(value)
})
graph.on('layoutend', ({ completed }) => {
  progress.textContent = completed
    ? messages.layoutDone((performance.now() - started) / 1000)
    : messages.layoutStopped
})

const grow = () => {
  const next = items.length
  const added: Item[] = []
  const joined: Link[] = []
  for (let offset = 0; offset < 10; offset++) {
    const index = next + offset
    const anchor = items[Math.floor(Math.random() * items.length)]
    if (!anchor) continue
    added.push({ ...anchor, id: `n${index}`, label: messages.node(formatNumber(index + 1)) })
    joined.push({ id: `g${index}`, from: anchor.id, to: `n${index}`, strength: 1 })
  }
  items = [...items, ...added]
  links = [...links, ...joined]
  graph.update({ definition: define() })
}

const hint = document.createElement('span')
hint.className = 'hint'
hint.textContent = messages.layoutHint

header.append(
  hint,
  progress,
  choice(
    messages.size,
    sizes.map((size) => ({ value: String(size), text: formatNumber(size) })),
    String(nodeCount),
    (value) => {
      params.set('nodes', value)
      location.search = params.toString()
    },
  ),
  choice(
    messages.engine,
    engines.map((value) => ({ value, text: messages.engines[value] })),
    engine,
    (value) => {
      params.set('engine', value)
      location.search = params.toString()
    },
  ),
  choice(
    messages.groupMode,
    (['none', 'nested'] as const).map((value) => ({ value, text: messages.groupModes[value] })),
    grouped ? 'nested' : 'none',
    (value) => {
      params.set('groups', value)
      location.search = params.toString()
    },
  ),
  choice(
    messages.minimap,
    (['on', 'off'] as const).map((value) => ({ value, text: messages.minimapModes[value] })),
    withMinimap ? 'on' : 'off',
    (value) => {
      params.set('minimap', value)
      location.search = params.toString()
    },
  ),
  button(messages.relaunch, () => void graph.layout.run()),
  button(messages.stop, () => graph.layout.stop()),
  button(messages.grow, grow),
  button(messages.fit, () => graph.view.fit({ duration: 400 })),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph })
