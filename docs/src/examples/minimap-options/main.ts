import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { createMinimap, type MinimapOptions } from '@bruno00o/graph/minimap'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

type Size = keyof typeof messages.sizes
type Colors = keyof typeof messages.colorModes
type Corner = (typeof corners)[number]

const corners = ['bottomRight', 'bottomLeft', 'topRight'] as const
const sizes: Record<Size, { width: number; height: number }> = {
  small: { width: 160, height: 120 },
  large: { width: 300, height: 220 },
}
const { items, links } = createSample(3_000, 3_600, 8, 17, 0.03)

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', opacity: 0.4 }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
  interaction: { lasso: true },
})

function cycle<T>(values: readonly T[], value: T): T {
  return values[(values.indexOf(value) + 1) % values.length] ?? value
}

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(items.length, links.length),
  })
  let corner: Corner = 'bottomRight'
  let size: Size = 'large'
  let withEdges = true
  let colors: Colors = 'graph'

  const options = (): MinimapOptions => ({
    corner,
    ...sizes[size],
    maxEdges: withEdges ? 20_000 : 0,
    nodeColor: colors === 'graph' ? null : 'var(--graph-ink-muted)',
    selectionColor: colors === 'graph' ? 'var(--graph-accent)' : 'var(--graph-cat-1)',
    viewColor: colors === 'graph' ? 'var(--graph-ink)' : 'var(--graph-accent)',
  })
  const minimap = createMinimap(graph, options())
  const refresh = () => minimap.update(options())

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.corner(messages.corners[corner]), (element) => {
      corner = cycle(corners, corner)
      element.textContent = messages.corner(messages.corners[corner])
      refresh()
    }),
    button(messages.size(messages.sizes[size]), (element) => {
      size = size === 'large' ? 'small' : 'large'
      element.textContent = messages.size(messages.sizes[size])
      refresh()
    }),
    button(messages.edges(withEdges), (element) => {
      withEdges = !withEdges
      element.textContent = messages.edges(withEdges)
      refresh()
    }),
    button(messages.colors(messages.colorModes[colors]), (element) => {
      colors = colors === 'graph' ? 'single' : 'graph'
      element.textContent = messages.colors(messages.colorModes[colors])
      refresh()
    }),
  )
  container.append(actions)

  return graph
}
