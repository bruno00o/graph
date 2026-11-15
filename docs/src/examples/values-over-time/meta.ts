import type { ExampleMeta } from '../types'

export default {
  title: 'Values over time',
  description:
    'One journal of changes drives both the timeline and the graph: the timeline counts the changes by kind and points at a moment, and each node shows the state and the level it had then.',
  hint: 'Focus the cursor and press Shift with the arrow keys to step from one change to the next.',
  category: 'time-and-maps',
  order: 165,
  tags: ['Vanilla'],
  api: ['history', 'timeline'],
  guides: ['time#values-over-time', 'time#events'],
  thumbnail: { panels: true },
} satisfies ExampleMeta
