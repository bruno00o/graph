import type { ExampleMeta } from '../types'

export default {
  title: 'Devtools panel',
  description:
    'The panel of TanStack Devtools, inline under the graph: frame times, renderer timings, element counts, view and selection, updated as you interact.',
  hint: 'Pan and zoom to fill the frame chart. Change the node count to time a flush.',
  category: 'tools',
  order: 30,
  tags: ['React', 'TanStack Devtools'],
  api: ['devtools', 'graph-component'],
  guides: ['devtools'],
} satisfies ExampleMeta
