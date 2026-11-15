import {
  defineGraph,
  edges,
  type GraphInstance,
  mountGraph,
  nodes,
  type TimeSpan,
} from '@bruno00o/graph'
import { historyFrom } from '@bruno00o/graph/history'
import { force } from '@bruno00o/graph/layouts/force'
import { createTimeline, mountTimeline } from '@bruno00o/graph/timeline'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

interface Member {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly stays: readonly TimeSpan[]
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

interface Opening {
  readonly id: string
  readonly link: string
  readonly time: number
  readonly open: boolean
}

const day = 86_400_000
const start = Date.UTC(2025, 0, 1)
const end = Date.UTC(2026, 0, 1)
const next = random(31)
const days = (from: number, to: number) => from + Math.floor(next() * (to - from))

const members: Member[] = Array.from({ length: 48 }, (_, index) => {
  const stays: TimeSpan[] = []
  let at = start + days(0, 60) * day
  const count = 1 + Math.floor(next() * 3)
  for (let stay = 0; stay < count && at < end; stay++) {
    const until = at + days(30, 110) * day
    stays.push({ start: at, end: until < end ? until : null })
    at = until + days(20, 80) * day
  }
  return {
    id: `n${index}`,
    label: messages.node(index + 1),
    group: messages.group(index % 4),
    stays,
  }
})

const links: Link[] = []
for (let index = 1; index < members.length; index++) {
  const same = members.filter((_, other) => other < index && other % 4 === index % 4)
  const pool = same.length > 0 && next() < 0.8 ? same : members.slice(0, index)
  const other = pool[Math.floor(next() * pool.length)]
  if (other) links.push({ id: `l${index}`, from: other.id, to: `n${index}` })
  if (next() < 0.3) {
    const far = members[Math.floor(next() * members.length)]
    if (far && far.id !== `n${index}`)
      links.push({ id: `x${index}`, from: far.id, to: `n${index}` })
  }
}

const openings: Opening[] = []
for (const link of links) {
  let at = start + days(0, 120) * day
  let open = next() < 0.7
  while (at < end) {
    openings.push({ id: `o${openings.length}`, link: link.id, time: at, open })
    open = !open
    at += days(open ? 15 : 30, open ? 60 : 120) * day
  }
}

const whole = (member: Member): TimeSpan => ({
  start: member.stays[0]?.start ?? null,
  end: member.stays[member.stays.length - 1]?.end ?? null,
})

export function mount(container: HTMLElement): GraphInstance {
  let each = true
  const history = historyFrom(openings, { key: 'link', present: 'open' })
  const define = () =>
    defineGraph({
      marks: [
        edges(links, { source: 'from', target: 'to', width: 2, history }),
        nodes(members, {
          color: 'group',
          label: 'label',
          time: each ? (member) => member.stays : whole,
        }),
      ],
      layout: force(),
      time: { fade: 4 * day },
      view: { padding: { top: 64, right: 48, bottom: 150, left: 48 } },
    })

  const graph = mountGraph(container, {
    definition: define(),
    initialTime: { start: start + 120 * day, end: start + 141 * day },
    ariaLabel: messages.graphLabel(members.length, links.length),
  })

  const timeline = createTimeline(graph, { loop: true, speed: 30 * day })
  const bar = mountTimeline(timeline, {
    ariaLabel: messages.timeline,
    labels: messages.timelineLabels,
  })
  bar.element.classList.add('example-timeline')
  container.append(bar.element)

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'example-button'
  button.setAttribute('aria-pressed', 'true')
  button.textContent = messages.each
  button.addEventListener('click', () => {
    each = !each
    button.setAttribute('aria-pressed', String(each))
    button.textContent = each ? messages.each : messages.whole
    graph.update({ definition: define() })
  })
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions)

  graph.signal.addEventListener('abort', () => timeline.destroy())
  return graph
}
