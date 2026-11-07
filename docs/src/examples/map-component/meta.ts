import type { ExampleMeta } from '../types'

export default {
  title: 'A map component',
  description:
    'A graph in a MapLibre map, mounted by the MapGraph component. The timeline inside it reads the graph from context; the legend beside it, outside the component, takes the graph as a prop.',
  hint: 'Press play, hover a group in the legend to outline its nodes, or click it to hide them.',
  category: 'time-and-maps',
  order: 110,
  tags: ['React'],
  api: ['map-graph', 'legend', 'timeline'],
  guides: ['react#maps', 'map#react'],
} satisfies ExampleMeta
