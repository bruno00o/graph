import type { ExampleMeta } from '../types'

export default {
  title: 'Connected components',
  description:
    'Before mounting, a path finder walks the data once per component. The eight largest components get a color of their own, the rest stay gray. Click a node to select and frame its component.',
  hint: 'Click a node to select its whole component.',
  category: 'analysis',
  order: 40,
  tags: ['Vanilla'],
  api: ['paths', 'nodes', 'edges'],
  guides: ['paths#without-a-graph', 'paths#within-reach'],
} satisfies ExampleMeta
