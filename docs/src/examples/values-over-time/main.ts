import { defineGraph, edges, type GraphInstance, mountGraph, nodes, raw } from '@bruno00o/graph'
import { historyFrom } from '@bruno00o/graph/history'
import { force } from '@bruno00o/graph/layouts/force'
import { createTimeline, mountTimeline } from '@bruno00o/graph/timeline'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

type State = 'idle' | 'active' | 'paused'

interface Item {
  readonly id: string
  readonly label: string
  readonly state: State
  readonly level: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

interface Change {
  readonly id: string
  readonly time: number
  readonly kind: 'state' | 'level'
  readonly node: string
  readonly state?: State
  readonly level?: number
}

const hour = 3_600_000
const day = 24 * hour
const first = Date.UTC(2026, 8, 7)
const next = random(21)
const states: readonly State[] = ['idle', 'active', 'paused']

const items: Item[] = Array.from({ length: 48 }, (_, index) => ({
  id: `n${index}`,
  label: messages.node(index + 1),
  state: 'idle',
  level: 1,
}))

const links: Link[] = []
for (let index = 1; index < items.length; index++) {
  links.push({ id: `l${index}`, from: `n${Math.floor(next() * index)}`, to: `n${index}` })
  const other = Math.floor(next() * items.length)
  if (next() < 0.25 && other !== index) {
    links.push({ id: `x${index}`, from: `n${other}`, to: `n${index}` })
  }
}

const changes: Change[] = []
for (let at = first; at < first + 30 * day; at += Math.floor((2 + next() * 10) * hour)) {
  const node = `n${Math.floor(next() * items.length)}`
  const id = `c${changes.length}`
  if (next() < 0.5) {
    changes.push({
      id,
      time: at,
      kind: 'state',
      node,
      state: states[Math.floor(next() * 3)] ?? 'idle',
    })
  } else {
    changes.push({ id, time: at, kind: 'level', node, level: 1 + Math.floor(next() * 5) })
  }
}

const history = historyFrom(changes, {
  key: 'node',
  values: (change) => ({ state: change.state, level: change.level }),
})

const definition = defineGraph({
  marks: [
    edges(links, { source: 'from', target: 'to', opacity: 0.5 }),
    nodes(items, {
      label: 'label',
      color: 'state',
      size: raw((item) => 8 + item.level * 4),
      history,
    }),
  ],
  scales: { color: { domain: states } },
  states: { current: { raise: true, halo: true, label: 'always' } },
  layout: force(),
  view: { padding: { top: 40, right: 260, bottom: 150, left: 40 } },
})

export function mount(container: HTMLElement): GraphInstance {
  const last = changes[changes.length - 1]?.time ?? first
  const graph = mountGraph(container, {
    definition,
    initialTime: { start: last, end: last },
    ariaLabel: messages.graphLabel(items.length, changes.length),
  })

  const timeline = createTimeline(graph, {
    events: changes,
    eventKind: 'kind',
    kinds: ['state', 'level'],
    instant: true,
    speed: day / 2,
  })
  const bar = mountTimeline(timeline, {
    ariaLabel: messages.timeline,
    labels: messages.labels,
    kindText: messages.kind,
  })
  bar.element.classList.add('example-timeline')
  container.append(bar.element)

  const panel = document.createElement('section')
  panel.className = 'example-panel'
  panel.setAttribute('aria-live', 'polite')
  const title = document.createElement('h2')
  const list = document.createElement('ul')
  panel.append(title, list)
  container.append(panel)

  const describe = (change: Change) => {
    const label = graph.datumOf({ kind: 'node', key: change.node })?.label ?? change.node
    return change.kind === 'state'
      ? messages.state(label, change.state ?? '')
      : messages.level(label, change.level ?? 0)
  }

  const show = () => {
    const moment = timeline.store.state.window?.start ?? null
    title.textContent = moment === null ? messages.latest : messages.moment(moment)
    const now = moment === null ? [] : timeline.events(moment)
    const lines = now.length === 0 ? [messages.quiet] : now.map(describe)
    list.replaceChildren(
      ...lines.map((text) => {
        const line = document.createElement('li')
        line.textContent = text
        return line
      }),
    )
    graph.states.set('current', { nodes: now.map((change) => change.node) })
  }

  const subscription = timeline.store.subscribe(show)
  show()
  graph.signal.addEventListener('abort', () => {
    subscription.unsubscribe()
    timeline.destroy()
  })

  return graph
}
