import {
  defineGraph,
  type EdgesBetweenGroups,
  edges,
  type GraphInstance,
  groups,
  mountGraph,
  type NodeGroup,
  nodes,
  raw,
} from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/controls.css'
import '../shared/overlays.css'

type Field = keyof typeof messages.fields

const fields = Object.keys(messages.fields) as Field[]
const bandOf = (item: Item) => (item.weight < 10 ? 'light' : item.weight < 40 ? 'medium' : 'heavy')
const groupSize = raw((group: NodeGroup<Item>) => 20 + Math.sqrt(group.count) * 4)
const groupColor = (group: NodeGroup<Item>) => String(group.value)
const groupLabel = (group: NodeGroup<Item>) => messages.group(String(group.value), group.count)
const bandLabel = (group: NodeGroup<Item>) => messages.band(String(group.value), group.count)

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createSample(120, 170, 5, 7, 0.12)
  const marks = (fill: number) => {
    const container = { padding: 14, fillOpacity: fill / 100 }
    return {
      group: groups(items, {
        size: groupSize,
        container,
        by: 'group',
        name: 'groups',
        color: groupColor,
        label: groupLabel,
      }),
      band: groups(items, {
        size: groupSize,
        container,
        by: bandOf,
        name: 'bands',
        fill: 'var(--graph-ink-muted)',
        label: bandLabel,
      }),
    }
  }
  let field: Field = 'group'
  let between: EdgesBetweenGroups = 'members'
  let fill = 100

  const define = () =>
    defineGraph({
      marks: [
        edges<Link>(links, {
          source: 'from',
          target: 'to',
          opacity: 0.5,
          merge: { directed: false },
          betweenGroups: between,
          aggregate: {
            width: (aggregate) => aggregate.count,
            label: (aggregate) => String(aggregate.count),
          },
        }),
        nodes<Item>(items, {
          color: 'group',
          size: raw((item) => 6 + Math.sqrt(item.weight) * 1.5),
          label: 'label',
        }),
        ...(field === 'none' ? [] : [marks(fill)[field]]),
      ],
      scales: { width: (value) => 1 + Math.sqrt(value) * 1.5 },
      layout: force(field === 'none' ? {} : { edgeLength: 160 }),
      relayout: true,
      view: { autoFit: 'layouts' },
    })

  const graph = mountGraph(container, {
    definition: define(),
    ariaLabel: messages.graphLabel(items.length),
  })
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-button'
  button.textContent = messages.field(messages.fields[field])
  button.addEventListener('click', () => {
    field = fields[(fields.indexOf(field) + 1) % fields.length] ?? 'group'
    button.textContent = messages.field(messages.fields[field])
    graph.update({ definition: define() })
  })
  const linkButton = document.createElement('button')
  linkButton.type = 'button'
  linkButton.className = 'example-button'
  linkButton.textContent = messages.between(between)
  linkButton.addEventListener('click', () => {
    between = between === 'groups' ? 'members' : 'groups'
    linkButton.textContent = messages.between(between)
    graph.update({ definition: define() })
  })
  const fillText = document.createElement('span')
  fillText.textContent = messages.fill(fill)
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '0'
  slider.max = '100'
  slider.step = '5'
  slider.value = String(fill)
  slider.addEventListener('input', () => {
    fill = Number(slider.value)
    fillText.textContent = messages.fill(fill)
    graph.update({ definition: define() })
  })
  const fillControl = document.createElement('label')
  fillControl.className = 'example-button example-range'
  fillControl.append(fillText, slider)
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button, linkButton, fillControl)
  container.append(actions)

  return graph
}
