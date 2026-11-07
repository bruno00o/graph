import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { createLegend, type LegendCategory } from '@bruno00o/graph/legend'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './legend.css'

const { items, links } = createSample(900, 1_300, 6, 23, 0.04)

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', opacity: 0.5 }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
  states: {
    match: { outline: 'var(--graph-ink)', outlineWidth: 2, raise: true },
    off: { hide: true },
  },
})

interface Row {
  readonly button: HTMLButtonElement
  readonly swatch: HTMLElement
  readonly name: HTMLElement
  readonly bar: HTMLElement
  readonly count: HTMLElement
}

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(items.length),
  })
  const legend = createLegend(graph, { highlight: 'match', hidden: 'off' })

  const panel = document.createElement('section')
  panel.className = 'legend-panel'
  panel.setAttribute('aria-label', messages.legendLabel)
  const title = document.createElement('h2')
  title.textContent = messages.title
  const list = document.createElement('div')
  list.className = 'legend-list'
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'legend-reset'
  reset.textContent = messages.reset
  reset.addEventListener('click', () => legend.reset())
  panel.append(title, list, reset)
  container.append(panel)

  const rows = new Map<string, Row>()
  const rowOf = (item: LegendCategory): Row => {
    const known = rows.get(item.id)
    if (known) return known
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'legend-row'
    const swatch = document.createElement('i')
    const name = document.createElement('span')
    const track = document.createElement('span')
    track.className = 'legend-track'
    const bar = document.createElement('span')
    track.append(bar)
    const count = document.createElement('span')
    count.className = 'legend-count'
    button.append(swatch, name, track, count)
    button.addEventListener('pointerenter', () => legend.hover(item.id))
    button.addEventListener('pointerleave', () => legend.hover(null))
    button.addEventListener('click', (event) => {
      const { color } = legend.store.state
      if (!event.altKey || color?.type !== 'categories') return legend.toggle(item.id)
      for (const other of color.items) legend.toggle(other.id, other.id !== item.id)
    })
    const row = { button, swatch, name, bar, count }
    rows.set(item.id, row)
    return row
  }

  const render = () => {
    const { color, off } = legend.store.state
    const categories = color?.type === 'categories' ? [...color.items] : []
    categories.sort((a, b) => String(a.value).localeCompare(String(b.value)))
    const most = Math.max(1, ...categories.map((item) => item.nodes))
    const buttons = categories.map((item) => {
      const row = rowOf(item)
      row.swatch.style.background = item.color
      row.name.textContent = messages.group(String(item.value))
      row.bar.style.width = `${(100 * item.nodes) / most}%`
      row.bar.style.background = item.color
      row.count.textContent = messages.count(item.nodes)
      row.button.setAttribute('aria-pressed', String(!item.off))
      return row.button
    })
    const moved = buttons.some((button, index) => list.children[index] !== button)
    if (moved || list.children.length !== buttons.length) list.replaceChildren(...buttons)
    reset.disabled = off.length === 0
  }
  legend.store.subscribe(render)
  render()

  return graph
}
