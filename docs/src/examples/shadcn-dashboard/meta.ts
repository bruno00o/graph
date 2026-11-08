import type { ExampleMeta } from '../types'

export default {
  title: 'shadcn/ui dashboard',
  description:
    'A dashboard built from shadcn/ui components, with the graph as one of its cards: the graph tokens read the shadcn variables, and the select, slider, search, hover card and details all talk to the graph.',
  hint: 'Pick a layout, search an item, hover and click nodes, then change the base color.',
  category: 'tools',
  order: 100,
  tags: ['React'],
  api: ['graph-component', 'hooks', 'anchor', 'legend'],
  guides: ['react', 'theming', 'minimap-and-legend'],
} satisfies ExampleMeta
