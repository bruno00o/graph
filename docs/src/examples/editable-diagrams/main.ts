import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import {
  type ExportRegion,
  type ExportStates,
  exportDrawio,
  exportVsdx,
} from '@bruno00o/graph/export'
import { messages } from './messages'
import '../shared/overlays.css'

interface Person {
  readonly id: string
  readonly name: string
  readonly team?: string
  readonly lead?: boolean
  readonly x: number
  readonly y: number
}

interface Review {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly kind: 'reviews' | 'pairs'
}

const people: Person[] = [
  { id: 'design', name: 'Design', x: 0, y: 0 },
  { id: 'data', name: 'Data', x: 0, y: 0 },
  { id: 'web', name: 'Web', x: 0, y: 0 },
  { id: 'ada', name: 'Ada', team: 'design', lead: true, x: -260, y: -120 },
  { id: 'bruno', name: 'Bruno', team: 'design', x: -320, y: 0 },
  { id: 'chloe', name: 'Chloé', team: 'design', x: -200, y: 20 },
  { id: 'dev', name: 'Dev', team: 'data', lead: true, x: 60, y: -150 },
  { id: 'emma', name: 'Emma', team: 'data', x: 0, y: -40 },
  { id: 'farid', name: 'Farid', team: 'data', x: 130, y: -50 },
  { id: 'grace', name: 'Grace', team: 'web', lead: true, x: 300, y: 120 },
  { id: 'hugo', name: 'Hugo', team: 'web', x: 220, y: 220 },
  { id: 'ines', name: 'Inès', team: 'web', x: 370, y: 230 },
  { id: 'jun', name: 'Jun', x: -60, y: 200 },
]

const reviews: Review[] = [
  { id: 'r1', from: 'ada', to: 'bruno', kind: 'reviews' },
  { id: 'r2', from: 'ada', to: 'chloe', kind: 'reviews' },
  { id: 'r3', from: 'bruno', to: 'chloe', kind: 'pairs' },
  { id: 'r4', from: 'dev', to: 'emma', kind: 'reviews' },
  { id: 'r5', from: 'dev', to: 'farid', kind: 'reviews' },
  { id: 'r6', from: 'emma', to: 'farid', kind: 'pairs' },
  { id: 'r7', from: 'farid', to: 'emma', kind: 'pairs' },
  { id: 'r8', from: 'grace', to: 'hugo', kind: 'reviews' },
  { id: 'r9', from: 'grace', to: 'ines', kind: 'reviews' },
  { id: 'r10', from: 'chloe', to: 'emma', kind: 'pairs' },
  { id: 'r11', from: 'farid', to: 'grace', kind: 'reviews' },
  { id: 'r12', from: 'jun', to: 'bruno', kind: 'reviews' },
  { id: 'r13', from: 'jun', to: 'hugo', kind: 'reviews' },
  { id: 'r14', from: 'jun', to: 'jun', kind: 'pairs' },
]

const definition = defineGraph({
  marks: [
    edges(reviews, {
      source: 'from',
      target: 'to',
      color: 'kind',
      dash: (review) => (review.kind === 'pairs' ? 'dashed' : 'solid'),
      arrow: (review) => (review.kind === 'reviews' ? 'target' : 'none'),
      label: (review) => (review.kind === 'reviews' ? messages.reviews : messages.pairs),
    }),
    nodes(people, {
      x: 'x',
      y: 'y',
      parent: 'team',
      label: 'name',
      shape: (person) => (person.lead ? 'box' : 'circle'),
      color: (person) => person.team ?? 'none',
      size: (person) => (person.lead ? 28 : 22),
    }),
  ],
  states: { lead: { strokeWidth: 3 } },
})

const stateOrder: readonly ExportStates[] = ['custom', 'all', 'none']

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, { definition, ariaLabel: messages.graphLabel })
  graph.states.set('lead', {
    nodes: people.filter((person) => person.lead).map((person) => person.id),
  })
  let states: ExportStates = 'custom'
  let region: ExportRegion = 'graph'

  const status = document.createElement('div')
  status.className = 'example-status'

  const save = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
    status.textContent = messages.saved(name, blob.size)
  }
  const drawio = async () => {
    const file = await exportDrawio(graph, { states, region })
    save(new Blob([file], { type: 'application/vnd.jgraph.mxfile' }), 'teams.drawio')
  }
  const vsdx = async () => save(await exportVsdx(graph, { states, region }), 'teams.vsdx')

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.drawio, () => void drawio()),
    button(messages.vsdx, () => void vsdx()),
    button(messages.states(messages.stateNames[states]), (element) => {
      states = stateOrder[(stateOrder.indexOf(states) + 1) % stateOrder.length] ?? 'custom'
      element.textContent = messages.states(messages.stateNames[states])
    }),
    button(messages.region(messages.regions[region]), (element) => {
      region = region === 'graph' ? 'view' : 'graph'
      element.textContent = messages.region(messages.regions[region])
    }),
  )
  container.append(actions, status)
  return graph
}
