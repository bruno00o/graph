import type { ExampleMeta } from '../types'

export default {
  title: 'Categorical colors',
  description:
    'One color per group, shared by nodes and edges: theme colors in order of appearance, colors pinned by a domain, a range of shades mixed from theme tokens, or a function that singles out one group.',
  hint: 'Cycle the colors and read the legend: the first mode follows the order of the data.',
  category: 'style',
  order: 60,
  tags: ['Vanilla'],
  api: ['define-graph', 'nodes', 'edges', 'legend'],
  guides: ['scales#color', 'scales#functions', 'theming#colors-in-your-options'],
} satisfies ExampleMeta
