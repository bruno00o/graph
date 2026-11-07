import {
  defineGraph,
  edges,
  type GraphInstance,
  type Key,
  mountGraph,
  nodes,
} from '@bruno00o/graph'
import { layers } from '@bruno00o/graph/layouts'
import { type Arrow, createSteps, type Step } from './data'
import { messages } from './messages'
import '../shared/overlays.css'

export function mount(container: HTMLElement): GraphInstance {
  const { steps, arrows } = createSteps()
  const labels = new Map(steps.map((step) => [step.id, step.label]))
  let root: Key | null = null
  const layout = () => layers({ direction: 'right', root: root ?? undefined })

  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<Arrow>(arrows, {
          source: 'from',
          target: 'to',
          arrow: 'target',
          stroke: (arrow) => (arrow.back ? 'var(--graph-accent)' : 'var(--graph-edge)'),
          dash: (arrow) => (arrow.back ? 'dashed' : 'solid'),
        }),
        nodes<Step>(steps, { label: 'label' }),
      ],
      states: { root: { outline: 'var(--graph-accent)', outlineWidth: 3, raise: true } },
      layout: layout(),
      interaction: { select: false },
    }),
    ariaLabel: messages.graphLabel(steps.length, arrows.length),
  })

  const status = document.createElement('output')
  status.className = 'example-status'
  status.textContent = messages.noRoot
  container.append(status)

  graph.on('click', ({ target }) => {
    if (target?.kind !== 'node') return
    root = target.key === root ? null : target.key
    if (root === null) graph.states.clear('root')
    else graph.states.set('root', { nodes: [root] })
    status.textContent =
      root === null ? messages.noRoot : messages.root(labels.get(String(root)) ?? '')
    void graph.layout.run(layout(), { fit: true })
  })

  return graph
}
