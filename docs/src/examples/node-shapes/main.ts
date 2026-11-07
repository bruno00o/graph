import {
  defineGraph,
  edges,
  type GraphInstance,
  mountGraph,
  type NodeShape,
  nodes,
  raw,
} from '@bruno00o/graph'
import { messages } from './messages'
import '../shared/overlays.css'

interface Item {
  readonly id: string
  readonly label: string
  readonly level: 0 | 1 | 2
  readonly branch: string
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

type Choice = keyof typeof messages.choices

const shapes: Record<Item['level'], NodeShape> = { 0: 'diamond', 1: 'square', 2: 'circle' }
const sizes: Record<Item['level'], number> = { 0: 44, 1: 30, 2: 18 }
const choices = Object.keys(messages.choices) as Choice[]

const items: Item[] = [{ id: 'n0', label: messages.node(1), level: 0, branch: 'root', x: 0, y: 0 }]
const links: Link[] = []
for (let branch = 0; branch < 4; branch++) {
  const angle = Math.PI / 4 + (branch * Math.PI) / 2
  const parent = `n${items.length}`
  const name = messages.branch(branch + 1)
  items.push({
    id: parent,
    label: messages.node(items.length + 1),
    level: 1,
    branch: name,
    x: Math.cos(angle) * 170,
    y: Math.sin(angle) * 170,
  })
  links.push({ id: `e${links.length}`, from: 'n0', to: parent })
  for (let leaf = 0; leaf < 4; leaf++) {
    const turn = angle + ((leaf - 1.5) * Math.PI) / 10
    const id = `n${items.length}`
    items.push({
      id,
      label: messages.node(items.length + 1),
      level: 2,
      branch: name,
      x: Math.cos(turn) * 340,
      y: Math.sin(turn) * 340,
    })
    links.push({ id: `e${links.length}`, from: parent, to: id })
  }
}

const define = (choice: Choice) =>
  defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(items, {
        x: 'x',
        y: 'y',
        color: 'branch',
        size: raw((item) => sizes[item.level]),
        shape: choice === 'level' ? (item) => shapes[item.level] : choice,
        label: 'label',
      }),
    ],
  })

export function mount(container: HTMLElement): GraphInstance {
  let choice: Choice = 'level'
  const graph = mountGraph(container, {
    definition: define(choice),
    ariaLabel: messages.graphLabel,
  })

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-button'
  button.textContent = messages.shape(messages.choices[choice])
  button.addEventListener('click', () => {
    choice = choices[(choices.indexOf(choice) + 1) % choices.length] ?? 'level'
    button.textContent = messages.shape(messages.choices[choice])
    graph.update({ definition: define(choice) })
  })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions)
  return graph
}
