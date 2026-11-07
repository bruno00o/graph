import type { ExampleMeta } from '../types'

export default {
  title: 'Neighborhood by hops',
  description:
    'Click a node to see what lies one, two, three or four edges away, each ring in a lighter shade. The rings come from the cost of each node in a reach query.',
  hint: 'Click a node, then move the slider.',
  category: 'analysis',
  order: 30,
  tags: ['Vanilla'],
  api: ['paths', 'graph-instance'],
  guides: ['paths#within-reach', 'states'],
} satisfies ExampleMeta
