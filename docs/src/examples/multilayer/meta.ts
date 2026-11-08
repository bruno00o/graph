import type { ExampleMeta } from '../types'

export default {
  title: 'Multilayer graph',
  description:
    'Routes between places, each with its own name and capacity, that run along paths, which run along segments. Only the routes show at first: double-click an edge to open the edges that carry it, one level at a time.',
  hint: 'Double-click an edge to open what carries it. Double-click it again to close.',
  category: 'structure',
  order: 30,
  tags: ['Vanilla'],
  api: ['edges', 'support', 'events', 'legend'],
  guides: ['multilayer#drill-down'],
} satisfies ExampleMeta
