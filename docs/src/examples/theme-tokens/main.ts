import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './palettes.css'

type Palette = keyof typeof messages.palettes

const palettes = Object.keys(messages.palettes) as Palette[]
const classes: Record<Palette, string | null> = {
  dusk: 'palette-dusk',
  meadow: 'palette-meadow',
  library: null,
}

const { items, links } = createSample(240, 380, 6, 4)

const definition = defineGraph({
  marks: [
    edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' }),
    nodes<Item>(items, { x: 'x', y: 'y', color: 'group', size: 'weight', label: 'label' }),
  ],
})

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition,
    ariaLabel: messages.graphLabel(items.length, links.length),
  })
  graph.selection.set({ nodes: items.filter((item) => item.weight > 85).map((item) => item.id) })

  let palette: Palette = 'dusk'
  const apply = () => {
    for (const name of Object.values(classes)) {
      if (name) graph.element.classList.toggle(name, name === classes[palette])
    }
  }
  apply()

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-button'
  button.textContent = messages.palette(messages.palettes[palette])
  button.addEventListener('click', () => {
    palette = palettes[(palettes.indexOf(palette) + 1) % palettes.length] ?? 'dusk'
    button.textContent = messages.palette(messages.palettes[palette])
    apply()
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions)

  return graph
}
