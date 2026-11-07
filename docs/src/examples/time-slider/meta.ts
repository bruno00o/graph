import type { ExampleMeta } from '../types'

export default {
  title: 'A time slider of your own',
  description:
    'A React slider owns the time window: it passes a single moment as the controlled time of the graph, which then shows what exists at that moment. The bars above it come from useTimeline, which counts the nodes over time.',
  hint: 'Drag the slider, or focus it and use the arrow keys to move a day at a time.',
  category: 'time-and-maps',
  order: 70,
  tags: ['React'],
  api: ['graph-component', 'timeline'],
  guides: ['time#controlled-window', 'time#react'],
} satisfies ExampleMeta
