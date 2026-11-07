import type { ExampleMeta } from '../types'

export default {
  title: 'Upstream and downstream',
  description:
    'Click a node of a directed graph: what it leads to turns blue, what leads to it turns gold. The same search follows the edges forward, then backward.',
  hint: 'Click a node in the middle layers.',
  category: 'analysis',
  order: 90,
  tags: ['Vanilla'],
  api: ['paths', 'layouts'],
  guides: ['paths#weights-and-direction', 'layout#layers'],
} satisfies ExampleMeta
