import type { ExampleMeta } from '../types'

export default {
  title: 'Expand on double-click',
  description:
    'Start from a few nodes of a larger graph held in memory. A double-click adds the neighbors of a node, which the force layout places next to it, and a badge counts the neighbors still hidden.',
  hint: 'Double-click a node with a badge.',
  category: 'interaction',
  order: 90,
  tags: ['Vanilla'],
  api: ['nodes', 'events', 'force'],
  guides: ['data#update-the-data', 'layout#when-it-runs', 'images-and-badges#badges'],
} satisfies ExampleMeta
