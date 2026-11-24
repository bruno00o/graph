import type { ExampleMeta } from '../types'

export default {
  title: 'Rings and branches',
  description:
    'Chains of nodes run from one base to another, and the two bases close them. `ways` finds the nodes with two ways out to two different bases and the chains between them; the `chains` layout draws each chain as an arc of a circle through its bases, with the branches around them.',
  hint: 'Click a node to see its two ways out, or the node its only way goes through.',
  category: 'analysis',
  order: 100,
  tags: ['Vanilla'],
  api: ['ways', 'chains', 'paths', 'nodes', 'edges', 'define-graph'],
  guides: ['paths#two-ways-out', 'layout#chains-between-exits', 'states#style-the-others'],
} satisfies ExampleMeta
