import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { densityBundling } from '@bruno00o/graph/bundling'
import { force } from '@bruno00o/graph/layouts/force'
import { createCommunities, type Item, type Link } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { button, choice, createPage, exportButtons, status, themeToggle } from '../shared/page'

type Strength = keyof typeof messages.strengths
type Reach = keyof typeof messages.reaches

const strengths: readonly Strength[] = ['0.5', '0.85', '1']
const reaches: readonly Reach[] = ['0.03', '0.06', '0.12']

const sizes = [1_000, 3_000, 10_000, 30_000, 60_000]
const params = new URLSearchParams(location.search)
const nodeCount = Number(params.get('nodes') ?? 3_000)
const { items, links } = createCommunities(nodeCount, Math.round(nodeCount * 1.66))
const layout = force()
let bundled = params.get('bundling') !== 'off'
let strength: Strength = '0.85'
let reach: Reach = '0.06'

const define = () =>
  defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', opacity: 0.45 }),
      nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
    ],
    scales: { size: { range: [4, 18] } },
    layout,
    bundling: bundled
      ? densityBundling({ strength: Number(strength), radius: Number(reach) })
      : null,
  })

const { header, main } = createPage(messages.bundling)
const graph = mountGraph(main, {
  definition: define(),
  ariaLabel: messages.graphLabel(formatNumber(items.length), formatNumber(links.length)),
})

const progress = status()
let started = performance.now()
let running = false
graph.store.subscribe(() => {
  const next = graph.store.get().bundling.running
  if (next === running) return
  running = next
  if (running) started = performance.now()
  progress.textContent = running
    ? messages.bundlingRunning
    : messages.bundlingDone(performance.now() - started)
})
const redraw = () => {
  graph.update({ definition: define() })
}

const hint = document.createElement('span')
hint.className = 'hint'
hint.textContent = messages.bundlingHint

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
    messages.bundlingMode,
    (['on', 'off'] as const).map((value) => ({ value, text: messages.bundlingModes[value] })),
    bundled ? 'on' : 'off',
    (value) => {
      bundled = value === 'on'
      redraw()
    },
  ),
  choice(
    messages.strength,
    strengths.map((value) => ({ value, text: messages.strengths[value] })),
    strength,
    (value) => {
      strength = strengths.find((option) => option === value) ?? strength
      redraw()
    },
  ),
  choice(
    messages.reach,
    reaches.map((value) => ({ value, text: messages.reaches[value] })),
    reach,
    (value) => {
      reach = reaches.find((option) => option === value) ?? reach
      redraw()
    },
  ),
  button(messages.rebundle, () => void graph.bundling.run()),
  button(messages.relaunch, () => void graph.layout.run()),
  button(messages.fit, () => graph.view.fit({ duration: 400 })),
  ...exportButtons(graph, 'regroupement', { png: messages.exportPng, svg: messages.exportSvg }),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph })
