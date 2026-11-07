import type { ExampleMeta } from '../types'

export default {
  title: 'Controlled view',
  description:
    'The view lives in React state: gestures send requests to onViewChange, a slider sets the zoom, and a lock keeps the vertical position while you pan.',
  hint: 'Drag the zoom slider, then lock the vertical position and pan: the graph only moves sideways.',
  category: 'basics',
  order: 80,
  tags: ['React'],
  api: ['graph-component', 'hooks', 'events'],
  guides: ['react#controlled-view', 'view#controlled-view'],
} satisfies ExampleMeta
