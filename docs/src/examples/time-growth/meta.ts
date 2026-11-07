import type { ExampleMeta } from '../types'

export default {
  title: 'A graph that grows',
  description:
    'Nodes and edges that start at a date and never end, played in grow mode: the window keeps its start and its end moves on, so the graph gathers everything since the beginning. A state rings the nodes that joined in the last sixty days.',
  hint: 'Press play, or drag the end of the window.',
  category: 'time-and-maps',
  order: 50,
  tags: ['Vanilla'],
  api: ['timeline', 'graph-instance'],
  guides: ['time#brush-step-and-play', 'states'],
} satisfies ExampleMeta
