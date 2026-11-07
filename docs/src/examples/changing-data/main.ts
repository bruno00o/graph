import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { messages } from './messages'
import '../shared/overlays.css'

type Trend = 'up' | 'down' | 'steady'

interface Slot {
  readonly id: string
  readonly label: string
  readonly weight: number
  readonly trend: Trend
  readonly x: number
  readonly y: number
}

interface Link {
  readonly id: string
  readonly from: string
  readonly to: string
}

const count = 64
const core = 24
const interval = 1500

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

const seeded = random(42)
const trends: readonly Trend[] = ['up', 'down', 'steady', 'steady', 'steady']
const angle = Math.PI * (3 - Math.sqrt(5))
const initial: readonly Slot[] = Array.from({ length: count }, (_, index) => ({
  id: `n${index}`,
  label: messages.node(index + 1),
  weight: Math.round(10 + seeded() * 80),
  trend: trends[Math.floor(seeded() * trends.length)] ?? 'steady',
  x: Math.cos(index * angle) * 52 * Math.sqrt(index),
  y: Math.sin(index * angle) * 52 * Math.sqrt(index),
}))

const links: Link[] = initial.slice(1).flatMap((slot, at) => {
  const index = at + 1
  const nearest = initial
    .slice(0, index)
    .map((other) => ({ other, distance: Math.hypot(other.x - slot.x, other.y - slot.y) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, index > 6 ? 2 : 1)
  return nearest.map(({ other }) => ({ id: `${other.id}-${slot.id}`, from: other.id, to: slot.id }))
})

const linkMark = edges<Link>(links, { source: 'from', target: 'to', arrow: 'target' })
const nodeOptions = {
  x: 'x',
  y: 'y',
  size: 'weight',
  color: 'trend',
  label: { text: 'label', secondary: (slot: Slot) => messages.weight(slot.weight) },
} as const
const scales = {
  size: { domain: [0, 100], range: [8, 44] },
  color: {
    domain: ['up', 'steady', 'down'],
    range: ['var(--graph-cat-6)', 'var(--graph-node)', 'var(--graph-cat-4)'],
  },
} as const

const define = (present: readonly Slot[]) =>
  defineGraph({ marks: [linkMark, nodes<Slot>(present, nodeOptions)], scales })

export function mount(container: HTMLElement): GraphInstance {
  const next = random(7)
  const slots = [...initial]
  const shown = new Set(
    slots.filter((_, index) => index < core || next() < 0.5).map((slot) => slot.id),
  )
  const present = () => slots.filter((slot) => shown.has(slot.id))
  const graph = mountGraph(container, {
    definition: define(present()),
    ariaLabel: messages.graphLabel,
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  status.textContent = messages.ready(shown.size)
  let round = 0

  const tick = () => {
    if (!graph.element.isConnected) {
      clearInterval(timer)
      return
    }
    round += 1
    let joined = 0
    let left = 0
    for (let index = core; index < count; index++) {
      if (next() > 0.12) continue
      const id = `n${index}`
      if (shown.delete(id)) left += 1
      else {
        shown.add(id)
        joined += 1
      }
    }
    let changed = 0
    slots.forEach((slot, index) => {
      if (next() < 0.25) {
        const weight = Math.min(100, Math.max(4, slot.weight + Math.round((next() - 0.5) * 40)))
        slots[index] = { ...slot, weight, trend: weight > slot.weight ? 'up' : 'down' }
        changed += 1
      } else if (slot.trend !== 'steady') slots[index] = { ...slot, trend: 'steady' }
    })
    graph.update({ definition: define(present()) })
    status.textContent = messages.round(round, joined, left, changed, shown.size)
  }

  let timer: ReturnType<typeof setInterval> | undefined
  const play = document.createElement('button')
  play.type = 'button'
  play.className = 'example-button'
  const toggle = (running: boolean) => {
    clearInterval(timer)
    timer = running ? setInterval(tick, interval) : undefined
    play.textContent = running ? messages.pause : messages.play
  }
  play.addEventListener('click', () => toggle(timer === undefined))
  toggle(!matchMedia('(prefers-reduced-motion: reduce)').matches)

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(play)
  container.append(actions, status)
  return graph
}
