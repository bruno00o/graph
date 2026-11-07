import { defineGraph, edges, type GraphInstance, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createTimeline, mountTimeline, type TimelineMode } from '@bruno00o/graph/timeline'
import { createHistory, type TimedItem, type TimedLink } from '../shared/data'
import { messages } from '../shared/messages'
import '../shared/overlays.css'

const day = 86_400_000

export function mount(container: HTMLElement): GraphInstance {
  const history = createHistory(320, 520)
  const graph = mountGraph(container, {
    definition: defineGraph({
      marks: [
        edges<TimedLink>(history.links, {
          source: 'from',
          target: 'to',
          opacity: 0.6,
          time: (link) => ({ start: link.start, end: link.end }),
        }),
        nodes<TimedItem>(history.items, {
          color: 'group',
          size: 'weight',
          label: 'label',
          time: (item) => ({ start: item.start, end: item.end }),
        }),
      ],
      layout: force(),
      time: { fade: 20 * day },
    }),
    initialTime: { start: history.start, end: history.start + 120 * day },
    ariaLabel: messages.graphLabel(history.items.length, history.links.length),
  })

  const timeline = createTimeline(graph, {
    loop: true,
    speed: (history.end - history.start) / 24,
  })
  const bar = mountTimeline(timeline, {
    ariaLabel: messages.timeLabel,
    labels: { ...messages.timeLabels, range: messages.timeRange },
  })
  bar.element.classList.add('example-timeline')
  container.append(bar.element)

  const status = document.createElement('output')
  status.className = 'example-status example-status-top'
  container.append(status)
  const describe = () => {
    const window = graph.time.get()
    status.textContent = messages.timeWindow(window?.start ?? null, window?.end ?? null)
  }
  graph.on('timechange', describe)
  describe()

  let mode: TimelineMode = 'slide'
  const button = (text: string, onClick: (element: HTMLButtonElement) => void) => {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'example-button'
    element.textContent = text
    element.addEventListener('click', () => onClick(element))
    return element
  }
  const actions = document.createElement('div')
  actions.className = 'example-actions'
  actions.append(
    button(messages.timeMode(messages.timeModes[mode]), (element) => {
      mode = mode === 'slide' ? 'grow' : 'slide'
      timeline.update({ mode, loop: true, speed: (history.end - history.start) / 24 })
      element.textContent = messages.timeMode(messages.timeModes[mode])
    }),
    button(messages.showAll, () => timeline.clear()),
  )
  container.append(actions)

  return graph
}
