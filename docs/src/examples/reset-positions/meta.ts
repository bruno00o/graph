import type { ExampleMeta } from '../types'

export default {
  title: 'Reset positions',
  description:
    'Nodes placed by the x and y fields of their data. Drag them or scatter them, then positions.reset puts them back where the data says, animated: every node, or only the selection.',
  hint: 'Drag a few nodes or scatter them, select some, then put them back.',
  category: 'data',
  order: 45,
  tags: ['Vanilla'],
  api: ['graph-instance', 'nodes'],
  guides: ['positions#put-nodes-back', 'positions#positions-from-your-data'],
} satisfies ExampleMeta
