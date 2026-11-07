import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createGroups, type Member, type Tie } from './data'
import { messages } from './messages'
import '../shared/overlays.css'
import '../shared/controls.css'

type Setting = keyof typeof messages.settings

const ranges: Record<Setting, { readonly max: number; readonly step: number }> = {
  cohesion: { max: 2, step: 0.05 },
  groupSpacing: { max: 80, step: 1 },
  edgeLength: { max: 120, step: 1 },
}

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createGroups()
  const settings: Record<Setting, number> = { cohesion: 0.5, groupSpacing: 16, edgeLength: 30 }
  const define = () =>
    defineGraph({
      marks: [
        edges<Tie>(links, { source: 'from', target: 'to', opacity: 0.6 }),
        nodes<Member>(items, {
          parent: 'parent',
          color: 'tone',
          label: (item) => (item.group ? item.label : null),
          container: { padding: 12 },
        }),
      ],
      layout: force(settings),
      view: { autoFit: 'layouts' },
    })

  const graph = mountGraph(container, {
    definition: define(),
    ariaLabel: messages.graphLabel(items.filter((item) => !item.group).length),
  })
  const panel = document.createElement('div')
  panel.className = 'example-panel example-sliders'
  for (const setting of Object.keys(ranges) as Setting[]) {
    const label = document.createElement('label')
    const caption = document.createElement('span')
    caption.textContent = messages.settings[setting](settings[setting])
    const input = document.createElement('input')
    input.type = 'range'
    input.min = '0'
    input.max = String(ranges[setting].max)
    input.step = String(ranges[setting].step)
    input.value = String(settings[setting])
    input.addEventListener('input', () => {
      caption.textContent = messages.settings[setting](input.valueAsNumber)
    })
    input.addEventListener('change', () => {
      settings[setting] = input.valueAsNumber
      graph.update({ definition: define() })
    })
    label.append(caption, input)
    panel.append(label)
  }
  container.append(panel)

  return graph
}
