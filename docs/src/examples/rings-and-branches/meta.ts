import type { ExampleMeta } from '../types'

export default {
  title: 'Rings and branches',
  description:
    'Chains of nodes run from one base to another, and the two bases close them. One depth-first walk finds the nodes with two ways out to two different bases; the rings are drawn as circles through their bases, with the branches around them.',
  hint: 'Click a node to see its two ways out, or the node its only way goes through.',
  category: 'analysis',
  order: 100,
  tags: ['Vanilla'],
  api: ['paths', 'layouts', 'nodes', 'edges', 'define-graph'],
  guides: ['paths#highlight-a-path', 'layout#positions-from-your-code', 'states#style-the-others'],
} satisfies ExampleMeta
