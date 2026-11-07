import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createTimeline, mountTimeline } from '@bruno00o/graph/timeline'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

interface Member {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly from: number
  readonly until: number | null
}

interface Contact {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly at: number
}

const day = 86_400_000
const start = Date.UTC(2024, 0, 1)
const end = Date.UTC(2025, 0, 1)
const next = random(9)
const members: Member[] = Array.from({ length: 60 }, (_, index) => {
  const from = start + Math.floor(next() * 200) * day
  const until = next() < 0.4 ? null : from + Math.floor(60 + next() * 200) * day
  return {
    id: `n${index}`,
    label: messages.node(index + 1),
    group: String.fromCharCode(65 + (index % 5)),
    from,
    until: until !== null && until < end ? until : null,
  }
})
const contacts: Contact[] = []
for (let tries = 0; contacts.length < 700 && tries < 20_000; tries++) {
  const a = members[Math.floor(next() * members.length)]
  const pool = next() < 0.8 ? members.filter((member) => member.group === a?.group) : members
  const b = pool[Math.floor(next() * pool.length)]
  if (!a || !b || a === b) continue
  const first = Math.max(a.from, b.from)
  const last = Math.min(a.until ?? end, b.until ?? end)
  if (last - first < day) continue
  const at = first + Math.floor((next() * (last - first)) / day) * day
  contacts.push({ id: `c${contacts.length}`, from: a.id, to: b.id, at })
}

const fades: readonly number[] = [0, 4, 12]

export function mount(container: HTMLElement): GraphInstance {
  let fade = fades[1] ?? 0
  const define = () =>
    defineGraph({
      marks: [
        edges<Contact>(contacts, { source: 'from', target: 'to', width: () => 2, time: 'at' }),
        nodes<Member>(members, {
          color: 'group',
          label: 'label',
          time: (member) => ({ start: member.from, end: member.until }),
        }),
      ],
      scales: { width: (value) => value },
      layout: force(),
      time: { fade: fade * day },
      view: { padding: 80 },
    })

  const graph = mountGraph(container, {
    definition: define(),
    initialTime: { start: start + 150 * day, end: start + 171 * day },
    ariaLabel: messages.graphLabel(members.length, contacts.length),
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
  button.textContent = messages.fade(fade)
  button.addEventListener('click', () => {
    fade = fades[(fades.indexOf(fade) + 1) % fades.length] ?? 0
    button.textContent = messages.fade(fade)
    graph.update({ definition: define() })
  })
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(button)
  container.append(actions)

  return graph
}
