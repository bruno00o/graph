import type { ExampleMeta } from '../types'

export default {
  title: 'Several periods',
  description:
    'Nodes come and go: each has a list of stays in its time. Edges open and close through a journal of openings read as a history. A three week window slides over the year, and each element shows only in its own periods.',
  hint: 'Press play, then switch to the whole span to see the gaps fill in.',
  category: 'time-and-maps',
  order: 65,
  tags: ['Vanilla'],
  api: ['nodes', 'history', 'timeline'],
  guides: ['time#several-periods', 'time#when-elements-are-there'],
} satisfies ExampleMeta
