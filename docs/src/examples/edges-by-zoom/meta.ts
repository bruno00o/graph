import type { ExampleMeta } from '../types'

export default {
  title: 'Edges by zoom',
  description:
    'Strong edges always show, weaker ones only once the view is zoomed in far enough: each edge takes its own minZoom from its data, and fades in past it.',
  hint: 'Scroll to zoom in on a group: weaker edges fade in, strongest first.',
  category: 'edges',
  order: 70,
  tags: ['Vanilla'],
  api: ['edges'],
  guides: ['zoom'],
} satisfies ExampleMeta
