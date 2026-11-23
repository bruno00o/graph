import type { ExampleMeta } from '../types'

export default {
  title: 'Loops and branches',
  description:
    'Loops start and end on two bases, branches hang off them. One depth-first walk tells which nodes have two ways out that share no node, ending on two different bases, and which hang on a single node.',
  hint: 'Click a node to see its two ways out, or the node its only way goes through.',
  category: 'analysis',
  order: 100,
  tags: ['Vanilla'],
  api: ['paths', 'layouts', 'nodes', 'edges', 'define-graph'],
  guides: ['paths#highlight-a-path', 'layout#positions-from-your-code', 'states#style-the-others'],
} satisfies ExampleMeta
