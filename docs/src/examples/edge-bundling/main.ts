import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { densityBundling } from '@bruno00o/graph/bundling'
import { force } from '@bruno00o/graph/layouts/force'
import { createCommunities, type Item, type Link } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

type Strength = keyof typeof messages.bundleStrengths
type Reach = keyof typeof messages.bundleReaches

const strengths: readonly Strength[] = ['0.5', '0.85', '1']
const reaches: readonly Reach[] = ['0.03', '0.06', '0.12']

function button(text: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'example-button'
  element.textContent = text
  element.addEventListener('click', () => onClick(element))
  return element
}

export function mount(container: HTMLElement): GraphInstance {
  const { items, links } = createCommunities(3_000, 5_000)
  const layout = force()
  let bundled = true
  let strength: Strength = '0.85'
  let reach: Reach = '0.06'

  const define = () =>
    defineGraph({
      marks: [
        edges<Link>(links, { source: 'from', target: 'to', opacity: 0.45 }),
        nodes<Item>(items, { color: 'group', size: 'weight', label: 'label' }),
      ],
      scales: { size: { range: [4, 18] } },
      layout,
      bundling: bundled
        ? densityBundling({ strength: Number(strength), radius: Number(reach) })
        : null,
    })

  const graph = mountGraph(container, {
    definition: define(),
    ariaLabel: messages.graphLabel(items.length, links.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  container.append(status)

  let started = performance.now()
  let running = false
  graph.store.subscribe(() => {
    const next = graph.store.get().bundling.running
    if (next === running) return
    running = next
    if (running) started = performance.now()
    status.textContent = running ? messages.bundling : messages.bundled(performance.now() - started)
  })

  const redraw = () => graph.update({ definition: define() })

  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.bundlingOn, (element) => {
      bundled = !bundled
      element.textContent = bundled ? messages.bundlingOn : messages.bundlingOff
      redraw()
    }),
    button(messages.bundleStrength(messages.bundleStrengths[strength]), (element) => {
      strength = strengths[(strengths.indexOf(strength) + 1) % strengths.length] ?? '0.85'
      element.textContent = messages.bundleStrength(messages.bundleStrengths[strength])
      redraw()
    }),
    button(messages.bundleReach(messages.bundleReaches[reach]), (element) => {
      reach = reaches[(reaches.indexOf(reach) + 1) % reaches.length] ?? '0.06'
      element.textContent = messages.bundleReach(messages.bundleReaches[reach])
      redraw()
    }),
  )
  container.append(actions)

  return graph
}
