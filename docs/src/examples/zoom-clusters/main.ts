import { defineGraph, edges, type GraphInstance, mountGraph, nodes, raw } from '@bruno00o/graph'
import { random } from '../shared/random'
import { messages } from './messages'
import '../shared/overlays.css'

interface Member {
  readonly id: string
  readonly label: string
  readonly group: string
  readonly x: number
  readonly y: number
}

interface Cluster extends Member {
  readonly count: number
  readonly diameter: number
}

interface Tie {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly count: number
}

const open = 0.9
const fade = 2 ** 0.25
const next = random(4)
const sizes = [48, 18, 34, 60, 24, 40, 14]
const members: Member[] = []
const clusters: Cluster[] = sizes.map((count, index) => {
  const group = String.fromCharCode(65 + index)
  const angle = (index / sizes.length) * Math.PI * 2
  const x = Math.cos(angle) * 380
  const y = Math.sin(angle) * 380
  const radius = Math.sqrt(count) * 11
  for (let member = 0; member < count; member++) {
    const turn = next() * Math.PI * 2
    const reach = Math.sqrt(next()) * radius
    members.push({
      id: `${group}${member}`,
      label: messages.member(group, member + 1),
      group,
      x: x + Math.cos(turn) * reach,
      y: y + Math.sin(turn) * reach,
    })
  }
  return { id: group, label: messages.group(group), group, x, y, count, diameter: radius * 2 + 24 }
})

const links: Tie[] = []
const crossing = new Map<string, number>()
for (const member of members) {
  const pool = next() < 0.92 ? members.filter((other) => other.group === member.group) : members
  const other = pool[Math.floor(next() * pool.length)]
  if (!other || other === member) continue
  links.push({ id: `l${links.length}`, from: member.id, to: other.id, count: 1 })
  if (other.group !== member.group) {
    const pair = [member.group, other.group].sort().join('-')
    crossing.set(pair, (crossing.get(pair) ?? 0) + 1)
  }
}
const overview: Tie[] = [...crossing].map(([pair, count]) => {
  const [from = '', to = ''] = pair.split('-')
  return { id: pair, from, to, count }
})

export function mount(container: HTMLElement): GraphInstance {
  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Tie>(overview, {
          source: 'from',
          target: 'to',
          width: raw((tie) => 1 + Math.sqrt(tie.count) * 1.5),
          label: (tie) => messages.count(tie.count),
          maxZoom: open * fade,
        }),
        edges<Tie>(links, { source: 'from', target: 'to', width: 1, minZoom: open / fade }),
        nodes<Cluster>(clusters, {
          x: 'x',
          y: 'y',
          color: 'group',
          size: raw((cluster) => cluster.diameter),
          opacity: 0.85,
          label: {
            text: 'label',
            secondary: (cluster) => messages.members(cluster.count),
            size: 20,
          },
          maxZoom: open * fade,
        }),
        nodes<Member>(members, {
          x: 'x',
          y: 'y',
          color: 'group',
          size: 12,
          label: 'label',
          minZoom: open / fade,
        }),
      ],
    }),
    ariaLabel: messages.graphLabel(members.length, clusters.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)
  const describe = () => {
    const { zoom } = graph.store.get().view
    status.textContent = messages.zoom(zoom, zoom > open)
  }
  graph.on('viewchange', describe)
  describe()

  return graph
}
