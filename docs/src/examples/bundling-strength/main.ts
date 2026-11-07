import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { densityBundling } from '@bruno00o/graph/bundling'
import { messages } from './messages'
import '../shared/overlays.css'

interface Dot {
  readonly id: string
  readonly group: string
  readonly x: number
  readonly y: number
}

interface Tie {
  readonly id: string
  readonly from: string
  readonly to: string
}

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

const groups = 10
const members = 36
const next = random(8)
const dots: Dot[] = []
for (let group = 0; group < groups; group++) {
  const angle = (group / groups) * Math.PI * 2
  for (let member = 0; member < members; member++) {
    const turn = next() * Math.PI * 2
    const reach = Math.sqrt(next()) * 46
    dots.push({
      id: `d${group}-${member}`,
      group: String.fromCharCode(65 + group),
      x: Math.cos(angle) * 320 + Math.cos(turn) * reach,
      y: Math.sin(angle) * 320 + Math.sin(turn) * reach,
    })
  }
}
const ties: Tie[] = Array.from({ length: 900 }, (_, index) => {
  const from = Math.floor(next() * groups)
  const to = (from + 1 + Math.floor(next() * (groups - 1))) % groups
  const pick = () => Math.floor(next() * members)
  return { id: `t${index}`, from: `d${from}-${pick()}`, to: `d${to}-${pick()}` }
})

export function mount(container: HTMLElement): GraphInstance {
  let strength = 0.85

  const define = () =>
    defineGraph({
      marks: [
        edges<Tie>(ties, { source: 'from', target: 'to', opacity: 0.3 }),
        nodes<Dot>(dots, { x: 'x', y: 'y', color: 'group', size: () => 8 }),
      ],
      scales: { size: (value) => value },
      bundling: densityBundling({ strength }),
    })

  const graph = mountGraph(container, {
    definition: define(),
    ariaLabel: messages.graphLabel(dots.length, ties.length),
  })
  graph.view.fit(undefined, { padding: 56 })

  const text = document.createElement('span')
  text.textContent = messages.strength(strength)
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.min = '0'
  slider.max = '1'
  slider.step = '0.05'
  slider.value = String(strength)
  slider.addEventListener('input', () => {
    strength = Number(slider.value)
    text.textContent = messages.strength(strength)
    graph.update({ definition: define() })
  })
  const control = document.createElement('label')
  control.className = 'example-button'
  Object.assign(control.style, { display: 'flex', alignItems: 'center', gap: '10px' })
  control.append(text, slider)
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(control)
  container.append(actions)

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)
  let runs = 0
  let started = 0
  let running = false
  graph.store.subscribe(() => {
    const now = graph.store.get().bundling.running
    if (now === running) return
    running = now
    if (running) {
      runs += 1
      started = performance.now()
    }
    status.textContent = running
      ? messages.bundling
      : messages.bundled(runs, performance.now() - started)
  })

  return graph
}
