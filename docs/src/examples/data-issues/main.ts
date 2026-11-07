import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { GraphDevtoolsCore } from '@bruno00o/graph/devtools'
import { createSample, type Item, type Link } from '../shared/data'
import { messages } from './messages'
import '../shared/overlays.css'
import './issues.css'

const sample = createSample(36, 50, 3, 41, 0.03)
const groups = ['A', 'B', 'C'].map(
  (group): Item => ({
    id: `group-${group}`,
    label: messages.group(group),
    group,
    weight: 1,
    x: 0,
    y: 0,
  }),
)
const clean = {
  items: [
    ...groups,
    ...sample.items.map((item) => ({
      ...item,
      x: item.x * 2,
      y: item.y * 2,
      parent: `group-${item.group}`,
    })),
  ],
  links: sample.links,
}
const first = clean.items[groups.length]
const broken = {
  items: [
    ...clean.items,
    {
      id: first?.id ?? 'n0',
      label: messages.copy(first?.label ?? ''),
      group: 'D',
      weight: 40,
      x: 0,
      y: 0,
    },
    { id: 'stray', label: messages.stray, group: 'D', weight: 20, x: 0, y: 0, parent: 'group-D' },
  ],
  links: [
    ...clean.links,
    { id: 'late-link', from: first?.id ?? 'n0', to: 'late' },
    { id: sample.links[0]?.id ?? 'e0', from: 'n1', to: 'n2' },
  ],
}
const fixed = {
  items: [
    ...broken.items,
    { id: 'group-D', label: messages.group('D'), group: 'D', weight: 1, x: 0, y: 0 },
    {
      id: 'late',
      label: messages.late,
      group: first?.group ?? 'A',
      weight: 30,
      x: (first?.x ?? 0) + 24,
      y: (first?.y ?? 0) + 24,
      parent: `group-${first?.group ?? 'A'}`,
    },
  ],
  links: broken.links,
}
type Data = typeof clean

const define = ({ items, links }: Data) =>
  defineGraph({
    marks: [
      edges<Link>(links, { source: 'from', target: 'to' }),
      nodes<Item>(items, {
        x: 'x',
        y: 'y',
        color: 'group',
        size: 'weight',
        label: 'label',
        parent: 'parent',
      }),
    ],
    scales: { size: { range: [8, 22] } },
  })

function theme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', onClick)
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  container.classList.add('issues-stage')
  const stage = document.createElement('div')
  stage.className = 'example-graph'
  const panelHost = document.createElement('div')
  panelHost.className = 'issues-panel'
  container.append(stage, panelHost)

  const graph = mountGraph(stage, { definition: define(broken), ariaLabel: messages.graphLabel })
  const panel = new GraphDevtoolsCore()
  panel.mount(panelHost, { theme: theme() })
  const observer = new MutationObserver(() => {
    if (!panelHost.isConnected) observer.disconnect()
    else panel.mount(panelHost, { theme: theme() })
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

  const status = document.createElement('output')
  status.className = 'example-status'
  status.setAttribute('aria-live', 'polite')
  status.textContent = messages.broken
  const load = (data: Data, text: string) => {
    graph.update({ definition: define(data) })
    status.textContent = text
  }

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.fix, () => load(fixed, messages.fixed)),
    button(messages.clean, () => load(clean, messages.cleaned)),
    button(messages.break, () => load(broken, messages.broken)),
  )
  stage.append(actions, status)

  return graph
}
