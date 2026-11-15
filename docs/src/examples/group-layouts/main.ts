import {
  defineGraph,
  edges,
  type GraphInstance,
  type Layout,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { grid, layers, radial, rings } from '@bruno00o/graph/layouts'
import { force } from '@bruno00o/graph/layouts/force'
import { random } from '../shared/random'
import { type Arrangement, createGroups, type Member, type Tie } from './data'
import { messages } from './messages'
import '../shared/overlays.css'

type Around = keyof typeof messages.arounds

const arrangements: Record<Arrangement, Layout> = {
  layers: layers({ direction: 'right' }),
  radial: radial(),
  rings: rings(),
  grid: grid({ order: 'degree' }),
  force: force(),
}

const arounds: Record<Around, Layout | null> = {
  force: force({ edgeLength: 60 }),
  grid: grid(),
  none: null,
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
  const sample = createGroups()
  let items: Member[] = sample.items
  let links: Tie[] = sample.links
  let around: Around = 'force'
  const next = random(11)

  const define = () =>
    defineGraph({
      marks: [
        edges<Tie>(links, { source: 'from', target: 'to', opacity: 0.6 }),
        nodes<Member>(items, {
          parent: 'parent',
          color: 'tone',
          label: (item) => (item.group ? item.label : null),
          container: {
            padding: 12,
            layout: (item) => (item.arrangement ? arrangements[item.arrangement] : null),
          },
        }),
      ],
      layout: arounds[around],
      view: { autoFit: 'layouts' },
    })

  const graph = mountGraph(container, {
    definition: define(),
    ariaLabel: messages.graphLabel(
      items.filter((item) => !item.group).length,
      items.filter((item) => item.group).length,
    ),
  })

  const order = Object.keys(arounds) as Around[]
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.around(messages.arounds[around]), (element) => {
      around = order[(order.indexOf(around) + 1) % order.length] ?? 'force'
      element.textContent = messages.around(messages.arounds[around])
      graph.update({ definition: define() })
    }),
    button(messages.add, () => {
      const holders = items.filter((item) => item.group && item.id !== 'D')
      const holder = holders[Math.floor(next() * holders.length)]
      if (!holder) return
      const siblings = items.filter((item) => item.parent === holder.id)
      const id = `${holder.id}-${siblings.length + 1}`
      const neighbor = siblings[Math.floor(next() * siblings.length)]
      items = [
        ...items,
        {
          id,
          label: `Node ${id}`,
          parent: holder.id,
          tone: holder.tone,
          group: false,
          arrangement: null,
        },
      ]
      if (neighbor) links = [...links, { id: `t${links.length}`, from: neighbor.id, to: id }]
      graph.update({ definition: define() })
    }),
    button(messages.arrange, () => {
      void graph.layout.run(undefined, { fit: true })
    }),
  )
  container.append(actions)

  return graph
}
