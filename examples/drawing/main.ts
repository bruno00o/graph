import {
  defineGraph,
  edges,
  type Hull,
  type HullShape,
  hull,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createSample, type Item, type Link } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { button, choice, createPage, exportButtons, themeToggle } from '../shared/page'

type Background = keyof typeof messages.backgrounds
type HullMode = keyof typeof messages.hullModes

const { items, links } = createSample(150, 330, 5, 3, 0.01)
const byId = new Map(items.map((item) => [item.id, item]))
const itemMark = nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' })
const linkMark = edges<Link>(links, { source: 'from', target: 'to' })
const layout = force()

let background: Background = 'lines'
let mode: HullMode = 'groups'
let shape: HullShape = 'rounded'

function hulls(): Hull<'selected'>[] {
  if (mode === 'groups') return [hull<Item>({ nodes: itemMark, by: 'group', shape })]
  if (mode === 'selection') {
    return [hull({ state: 'selected', shape, color: 'var(--graph-accent)', padding: 12 })]
  }
  return []
}

const define = () =>
  defineGraph({
    marks: [linkMark, itemMark],
    scales: { size: { range: [8, 22] } },
    layout,
    background: background === 'none' ? null : { grid: background },
    hulls: hulls(),
    interaction: { lasso: true },
  })

const { header, main } = createPage(messages.drawing)
const graph = mountGraph(main, {
  definition: define(),
  ariaLabel: messages.graphLabel(formatNumber(items.length), formatNumber(links.length)),
})
const redraw = () => graph.update({ definition: define() })

const count = document.createElement('span')
const toolbar = document.createElement('div')
toolbar.className = 'toolbar'
toolbar.append(
  count,
  button(messages.frameSelection, () =>
    graph.view.fit(graph.selection.get().nodes, { duration: 400 }),
  ),
  button(messages.clearSelection, () => graph.selection.clear()),
)
graph.anchors.set(toolbar, {
  state: 'selected',
  side: 'top',
  offset: { x: 0, y: -8 },
  interactive: true,
})
graph.on('selectionchange', ({ nodes: selected }) => {
  count.textContent = messages.selectionCount(selected.length)
})

const tooltip = document.createElement('div')
tooltip.className = 'tooltip'
const title = document.createElement('strong')
const detail = document.createElement('span')
tooltip.append(title, detail)
graph.on('pointerenter', ({ target }) => {
  if (target.kind === 'node') {
    const item = target.datum as Item
    title.textContent = item.label
    detail.textContent = messages.tooltipWeight(item.group, item.weight)
    graph.anchors.set(tooltip, { node: target.key, side: 'right', align: 'start', when: 'hovered' })
    return
  }
  const link = target.datum as Link
  title.textContent = messages.link(
    byId.get(link.from)?.label ?? '',
    byId.get(link.to)?.label ?? '',
  )
  detail.textContent = ''
  graph.anchors.set(tooltip, { edge: target.key, side: 'top', when: 'hovered' })
})

const groups = new Map<string, Key[]>()
for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item.id])
const names = [...groups].map(([group, keys]) => {
  const name = document.createElement('div')
  name.className = 'group-name'
  name.textContent = group
  return { name, keys }
})
const showNames = () => {
  for (const { name, keys } of names) {
    if (mode === 'groups') {
      graph.anchors.set(name, {
        nodes: keys,
        side: 'top',
        align: 'start',
        offset: { x: 0, y: -18 },
      })
    } else graph.anchors.remove(name)
  }
}
showNames()

const backgrounds = Object.keys(messages.backgrounds) as Background[]
const modes = Object.keys(messages.hullModes) as HullMode[]
const shapes = Object.keys(messages.hullShapes) as HullShape[]
const hint = document.createElement('span')
hint.className = 'hint'
hint.textContent = messages.drawingHint

header.append(
  hint,
  choice(
    messages.background,
    backgrounds.map((value) => ({ value, text: messages.backgrounds[value] })),
    background,
    (value) => {
      background = backgrounds.find((candidate) => candidate === value) ?? 'lines'
      redraw()
    },
  ),
  choice(
    messages.hulls,
    modes.map((value) => ({ value, text: messages.hullModes[value] })),
    mode,
    (value) => {
      mode = modes.find((candidate) => candidate === value) ?? 'groups'
      showNames()
      redraw()
    },
  ),
  choice(
    messages.hullShape,
    shapes.map((value) => ({ value, text: messages.hullShapes[value] })),
    shape,
    (value) => {
      shape = shapes.find((candidate) => candidate === value) ?? 'rounded'
      redraw()
    },
  ),
  button(messages.fit, () => graph.view.fit(undefined, { duration: 400 })),
  ...exportButtons(graph, 'drawing', { png: messages.exportPng, svg: messages.exportSvg }),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph })
