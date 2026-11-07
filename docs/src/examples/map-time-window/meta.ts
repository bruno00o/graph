import type { ExampleMeta } from '../types'

export default {
  title: 'A map in time',
  description:
    'Nodes on a map that open and close over six years, and edges that join each new node to an older one of its region. The timeline plays in grow mode, and elements fade in and out at the edges of the window.',
  hint: 'Press play, or drag across the histogram to choose a window.',
  category: 'time-and-maps',
  order: 100,
  tags: ['React'],
  api: ['map', 'timeline'],
  guides: ['map#time', 'time#timeline'],
} satisfies ExampleMeta
