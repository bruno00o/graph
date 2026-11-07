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
  readonly degree: number
  readonly born: number
}

interface Tie {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly born: number
}

const day = 86_400_000
const start = Date.UTC(2022, 0, 1)
const end = Date.UTC(2025, 0, 1)
const recent = 60 * day
const count = 280
const next = random(3)
const groups: string[] = []
const degree = new Array<number>(count).fill(0)
const ties: Tie[] = []
const ends: number[] = []
const link = (from: number, to: number, born: number) => {
  ties.push({ id: `e${ties.length}`, from: `n${from}`, to: `n${to}`, born })
  ends.push(from, to)
  degree[from] = (degree[from] ?? 0) + 1
  degree[to] = (degree[to] ?? 0) + 1
}
const bornAt = (index: number) =>
  Math.floor((start + (end - start) * (index / count) ** 0.8) / day) * day
for (let index = 0; index < count; index++) {
  if (index < 6) {
    groups.push(String.fromCharCode(65 + index))
    if (index > 0) link(index, index - 1, bornAt(index))
    continue
  }
  const host = ends[Math.floor(next() * ends.length)] ?? 0
  groups.push(next() < 0.92 ? (groups[host] ?? 'A') : String.fromCharCode(65 + (index % 6)))
  link(index, host, bornAt(index))
  const other = ends[Math.floor(next() * ends.length)] ?? 0
  if (next() < 0.25 && other !== index && other !== host) link(index, other, bornAt(index))
}
const members: Member[] = groups.map((group, index) => ({
  id: `n${index}`,
  label: messages.node(index + 1),
  group,
  degree: degree[index] ?? 1,
  born: bornAt(index),
}))

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Tie>(ties, {
          source: 'from',
          target: 'to',
          opacity: 0.6,
          time: (tie) => ({ start: tie.born }),
        }),
        nodes<Member>(members, {
          color: 'group',
          size: 'degree',
          label: 'label',
          time: (member) => ({ start: member.born }),
        }),
      ],
      scales: { size: { range: [10, 36] } },
      layout: force(),
      states: {
        recent: {
          outline: 'var(--graph-accent)',
          outlineWidth: 3,
          stroke: 'var(--graph-accent)',
          raise: true,
        },
      },
    }),
    initialTime: { start, end: start + (end - start) * 0.6 },
    ariaLabel: messages.graphLabel(members.length, ties.length),
  })

  graph.on('layoutend', () => graph.view.fit(undefined, { padding: 80, duration: 300 }))

  const timeline = createTimeline(graph, { mode: 'grow', loop: true, speed: (end - start) / 15 })
  const bar = mountTimeline(timeline, {
    ariaLabel: messages.timeline,
    labels: messages.timelineLabels,
  })
  bar.element.classList.add('example-timeline')
  container.append(bar.element)

  const status = document.createElement('output')
  status.className = 'example-status example-status-top'
  container.append(status)
  const describe = () => {
    const until = graph.time.get()?.end ?? end
    const fresh = members.filter((member) => member.born < until && member.born >= until - recent)
    const shown = members.filter((member) => member.born < until).length
    graph.states.set('recent', {
      nodes: fresh.map((member) => member.id),
      edges: ties
        .filter((tie) => tie.born < until && tie.born >= until - recent)
        .map((tie) => tie.id),
    })
    status.textContent = messages.status(until, shown, fresh.length)
  }
  graph.on('timechange', describe)
  describe()

  return graph
}
