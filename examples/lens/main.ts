import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { button, choice, createPage, status, themeToggle } from '../shared/page'

const sizes = [2_000, 20_000, 100_000, 500_000]
const zooms = [2, 3, 5, 8]
const params = new URLSearchParams(location.search)
const nodeCount = Number(params.get('nodes') ?? 20_000)
const edgeCount = Number(params.get('edges') ?? nodeCount * 2)
const { items, links } = createSample(nodeCount, edgeCount)
let zoom = 3

const define = () =>
  defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to', opacity: 0.5 }),
      nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
    ],
    interaction: { lens: { zoom } },
  })

const { header, main } = createPage(messages.lens)
const graph = mountGraph(main, {
  definition: define(),
  ariaLabel: messages.graphLabel(formatNumber(items.length), formatNumber(links.length)),
})

const lensStatus = status()
const describe = () => {
  const lens = graph.lens.get()
  lensStatus.textContent = lens ? messages.lensStatus(lens.zoom) : messages.lensOff
}
graph.on('lenschange', describe)
describe()

const hint = document.createElement('span')
hint.className = 'hint'
hint.textContent = messages.lensHint

header.append(
  hint,
  lensStatus,
  button(messages.lensFixed, () => {
    const { width, height } = graph.store.get()
    graph.lens.set({ at: { x: width / 2, y: height / 2 } })
  }),
  button(messages.lensHide, () => graph.lens.set(null)),
  choice(
    messages.lensZoom,
    zooms.map((value) => ({ value: String(value), text: messages.lensFactor(value) })),
    String(zoom),
    (value) => {
      zoom = Number(value)
      graph.update({ definition: define() })
      if (graph.lens.get()) graph.lens.set({ zoom })
    },
  ),
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
  button(messages.fit, () => graph.view.fit({ duration: 400 })),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph })
