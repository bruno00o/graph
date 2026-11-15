import type { ExampleMeta } from '../types'

export default {
  title: 'Replay a history of changes',
  description:
    'A timeline counts the changes of an application, stacked by kind, and points at one moment: the graph shows what existed then, and the panel lists the changes made at that moment.',
  hint: 'Focus the cursor and press Shift with the arrow keys to step from one change to the next.',
  category: 'time-and-maps',
  order: 160,
  tags: ['React'],
  api: ['timeline'],
  guides: ['time#events', 'time#a-moment-instead-of-a-window'],
} satisfies ExampleMeta
