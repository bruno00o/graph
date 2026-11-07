import {
  defineGraph,
  edges,
  type GraphInstance,
  groups,
  mountGraph,
  nodes,
  raw,
} from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'

type Field = keyof typeof messages.fields

const fields = Object.keys(messages.fields) as Field[]
const bandOf = (item: Item) => (item.weight < 10 ? 'light' : item.weight < 40 ? 'medium' : 'heavy')

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createSample(120, 170, 5, 7, 0.12)
  const groupLook = {
    size: raw((group: { count: number }) => 20 + Math.sqrt(group.count) * 4),
    container: { padding: 14 },
  }
  const marks = {
    group: groups(items, {
      ...groupLook,
      by: 'group',
      name: 'groups',
      color: (group) => String(group.value),
      label: (group) => messages.group(String(group.value), group.count),
    }),
    band: groups(items, {
      ...groupLook,
      by: bandOf,
      name: 'bands',
      fill: 'var(--graph-ink-muted)',
      label: (group) => messages.band(String(group.value), group.count),
    }),
  }
  let field: Field = 'group'

  const define = () =>
    defineGraph({
      marks: [
        edges<Link>(links, {
          source: 'from',
          target: 'to',
          opacity: 0.5,
          merge: { directed: false },
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
        ...(field === 'none' ? [] : [marks[field]]),
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
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions)

  return graph
}
