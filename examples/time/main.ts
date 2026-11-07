import { defineGraph, edges, mountGraph, nodes } from '@bruno00o/graph'
import { force } from '@bruno00o/graph/layouts/force'
import { createTimeline, mountTimeline, type TimelineMode } from '@bruno00o/graph/timeline'
import { createHistory, type TimedItem, type TimedLink } from '../shared/data'
import { formatNumber, messages } from '../shared/messages'
import { button, choice, createPage, exportButtons, status, themeToggle } from '../shared/page'

const day = 86_400_000
const history = createHistory(320, 520)
const baseSpeed = (history.end - history.start) / 24

const spanOf = (element: TimedItem | TimedLink) => ({ start: element.start, end: element.end })

const definition = defineGraph({
  marks: [
    edges<TimedLink>(history.links, { source: 'from', target: 'to', opacity: 0.6, time: spanOf }),
    nodes<TimedItem>(history.items, {
      color: 'group',
      size: 'weight',
      label: 'label',
      time: spanOf,
    }),
  ],
  layout: force(),
  time: { fade: 20 * day },
})

const { header, main } = createPage(messages.time)
const graph = mountGraph(main, {
  definition,
  ariaLabel: messages.graphLabel(
    formatNumber(history.items.length),
    formatNumber(history.links.length),
  ),
  initialTime: { start: history.start, end: history.start + 120 * day },
})

const timeline = createTimeline(graph, { mode: 'slide', loop: true, speed: baseSpeed })
const bar = mountTimeline(timeline, {
  ariaLabel: messages.timeLabel,
  labels: { ...messages.timeLabels, range: messages.timeRange },
})
bar.element.classList.add('timeline')
main.append(bar.element)

const progress = status()
const describe = () => {
  const window = graph.time.get()
  progress.textContent = messages.timeStatus(window?.start ?? null, window?.end ?? null)
}
graph.on('timechange', describe)
describe()

const hint = document.createElement('span')
hint.className = 'hint'
hint.textContent = messages.timeHint

let mode: TimelineMode = 'slide'
let speed = 1
const applyOptions = () => timeline.update({ mode, loop: true, speed: baseSpeed * speed })

header.append(
  hint,
  progress,
  choice(
    messages.timeMode,
    (['slide', 'grow'] as const).map((value) => ({ value, text: messages.timeModes[value] })),
    mode,
    (value) => {
      mode = value === 'grow' ? 'grow' : 'slide'
      applyOptions()
    },
  ),
  choice(
    messages.speed,
    (['0.5', '1', '2', '4'] as const).map((value) => ({ value, text: messages.speeds[value] })),
    '1',
    (value) => {
      speed = Number(value)
      applyOptions()
    },
  ),
  button(messages.showAll, () => timeline.clear()),
  ...exportButtons(graph, 'time', { png: messages.exportPng, svg: messages.exportSvg }),
  themeToggle(messages.dark, messages.light),
)

Object.assign(window, { graph, timeline })
