import type { ExampleMeta } from '../types'

export default {
  title: 'Upstream and downstream',
  description:
    'Click a node of a directed graph: what it leads to turns blue, what leads to it turns gold. The graph follows the edges forward, and a second path finder with the edges turned around follows them back.',
  hint: 'Click a node in the middle layers.',
  category: 'analysis',
  order: 90,
  tags: ['Vanilla'],
  api: ['paths', 'layouts'],
  guides: ['paths#weights-and-direction', 'paths#without-a-graph', 'layout#layers'],
} satisfies ExampleMeta
